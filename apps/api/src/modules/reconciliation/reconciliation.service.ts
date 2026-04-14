import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type {
  OfxTransaction,
  MatchCandidate,
  MatchStatus,
  TransactionMatchResult,
  MatchResponse,
  ConfirmMatchBody,
  ConfirmMatchResponse,
} from "./reconciliation.schema.js";

const DATE_TOLERANCE_DAYS = 7;
const HIGH_CONFIDENCE_DAYS = 1;

interface RawOpenCharge {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  dueDate: Date;
  status: "PENDING" | "OVERDUE";
}

/**
 * Crosses OFX credit transactions with open (PENDING/OVERDUE) charges that
 * have no associated Payment yet.
 *
 * Matching criteria (all must be satisfied):
 *   1. transaction.amountCents > 0  — credits only; debits are skipped
 *   2. charge.amountCents === transaction.amountCents — exact value match
 *   3. charge.status IN ['PENDING', 'OVERDUE']
 *   4. |daysDiff(charge.dueDate, transaction.postedAt)| ≤ DATE_TOLERANCE_DAYS
 *
 * A charge that already has a Payment row is excluded from candidates.
 * Pure read — no writes.
 *
 * Candidate sort order (all tiebreakers applied in sequence):
 *   1. Confidence DESC  (high before medium)
 *   2. dateDeltaDays ASC  (closer date wins)
 *   3. Status: OVERDUE before PENDING  (prefer urgent charges)
 */
export async function matchOfxTransactions(
  prisma: PrismaClient,
  clubId: string,
  transactions: OfxTransaction[],
): Promise<MatchResponse> {
  const creditTransactions = transactions.filter((t) => t.amountCents > 0);
  const skippedDebits = transactions.length - creditTransactions.length;

  if (creditTransactions.length === 0) {
    return {
      matches: [],
      summary: {
        total: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
        skippedDebits,
      },
    };
  }

  const openCharges = await withTenantSchema(
    prisma,
    clubId,
    async (tx: PrismaClient) => {
      return (
        tx as unknown as {
          $queryRaw: <T>(
            sql: TemplateStringsArray,
            ...values: unknown[]
          ) => Promise<T>;
        }
      ).$queryRaw<RawOpenCharge[]>`
        SELECT
          c.id               AS "chargeId",
          c."memberId",
          m.name             AS "memberName",
          c."amountCents",
          c."dueDate",
          c.status::text     AS status
        FROM charges c
        JOIN members m ON m.id = c."memberId"
        LEFT JOIN payments p ON p."chargeId" = c.id
        WHERE c.status IN ('PENDING', 'OVERDUE')
          AND p.id IS NULL
        ORDER BY c."dueDate" ASC
      `;
    },
  );

  const matches: TransactionMatchResult[] = creditTransactions.map(
    (transaction) => {
      const txDate = new Date(transaction.postedAt as unknown as string);

      const candidates: MatchCandidate[] = openCharges
        .filter((charge) => charge.amountCents === transaction.amountCents)
        .map((charge) => {
          const chargeDate = new Date(charge.dueDate);
          const dateDeltaDays = Math.floor(
            Math.abs(
              (txDate.getTime() - chargeDate.getTime()) / (1000 * 60 * 60 * 24),
            ),
          );
          return { ...charge, dateDeltaDays };
        })
        .filter((c) => c.dateDeltaDays <= DATE_TOLERANCE_DAYS)
        .map(
          (c): MatchCandidate => ({
            chargeId: c.chargeId,
            memberId: c.memberId,
            memberName: c.memberName,
            amountCents: c.amountCents,
            dueDate: c.dueDate.toISOString().slice(0, 10),
            status: c.status,
            dateDeltaDays: c.dateDeltaDays,
            confidence:
              c.dateDeltaDays <= HIGH_CONFIDENCE_DAYS ? "high" : "medium",
          }),
        )
        .sort((a, b) => {
          if (a.confidence !== b.confidence) {
            return a.confidence === "high" ? -1 : 1;
          }
          if (a.dateDeltaDays !== b.dateDeltaDays) {
            return a.dateDeltaDays - b.dateDeltaDays;
          }
          if (a.status !== b.status) {
            return a.status === "OVERDUE" ? -1 : 1;
          }
          return 0;
        });

      const matchStatus: MatchStatus =
        candidates.length === 0
          ? "unmatched"
          : candidates.length === 1
            ? "matched"
            : "ambiguous";

      return { fitId: transaction.fitId, transaction, matchStatus, candidates };
    },
  );

  const summary = {
    total: creditTransactions.length,
    matched: matches.filter((m) => m.matchStatus === "matched").length,
    ambiguous: matches.filter((m) => m.matchStatus === "ambiguous").length,
    unmatched: matches.filter((m) => m.matchStatus === "unmatched").length,
    skippedDebits,
  };

  return { matches, summary };
}

/**
 * Persists a reconciliation match:
 *   1. Creates a Payment row (fitId as gatewayTxid — idempotency via unique index)
 *   2. Marks the Charge as PAID
 *   3. Restores Member status to ACTIVE if it was OVERDUE
 *   4. Writes a PAYMENT_CONFIRMED AuditLog entry
 *
 * Idempotent: returns the existing Payment when fitId is already used.
 * Replicates the webhook worker transaction pattern.
 */
export async function confirmReconciliationMatch(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: ConfirmMatchBody,
): Promise<ConfirmMatchResponse> {
  return withTenantSchema(prisma, clubId, async (tx: PrismaClient) => {
    const existing = await tx.payment.findUnique({
      where: { gatewayTxid: input.fitId },
    });
    if (existing) {
      return {
        paymentId: existing.id,
        chargeId: existing.chargeId,
        paidAt: existing.paidAt.toISOString(),
        amountCents: existing.amountCents,
        memberStatusUpdated: false,
      };
    }

    const charge = await tx.charge.findUnique({
      where: { id: input.chargeId },
      include: { member: true },
    });

    if (!charge) throw new NotFoundError("Cobrança não encontrada.");
    if (charge.status === "PAID")
      throw new ConflictError("Cobrança já está paga.");
    if (charge.status === "CANCELLED")
      throw new ConflictError(
        "Não é possível confirmar uma cobrança cancelada.",
      );

    const payment = await tx.payment.create({
      data: {
        chargeId: charge.id,
        paidAt: new Date(input.paidAt),
        method: input.method,
        amountCents: charge.amountCents,
        gatewayTxid: input.fitId,
      },
    });

    await tx.charge.update({
      where: { id: charge.id },
      data: { status: "PAID", updatedAt: new Date() },
    });

    const wasOverdue = charge.member.status === "OVERDUE";
    if (wasOverdue) {
      await tx.member.update({
        where: { id: charge.memberId },
        data: { status: "ACTIVE" },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PAYMENT_CONFIRMED",
        memberId: charge.memberId,
        entityId: payment.id,
        entityType: "Payment",
        metadata: {
          chargeId: charge.id,
          amountCents: charge.amountCents,
          method: input.method,
          gatewayTxid: input.fitId,
          source: "ofx_reconciliation",
        },
      },
    });

    return {
      paymentId: payment.id,
      chargeId: charge.id,
      paidAt: payment.paidAt.toISOString(),
      amountCents: payment.amountCents,
      memberStatusUpdated: wasOverdue,
    };
  });
}

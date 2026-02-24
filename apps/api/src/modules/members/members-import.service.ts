import Papa from "papaparse";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { isPrismaUniqueConstraintError } from "../../lib/prisma.js";
import type { ImportRowError } from "./members.schema.js";

interface ParsedRow {
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  plano_id?: string;
  data_entrada?: string;
}

interface ValidatedRow {
  name: string;
  cpf: string;
  phone: string;
  email: string | undefined;
  planId: string | undefined;
  joinedAt: Date | undefined;
}

const MAX_ROWS = 5000;
const BATCH_SIZE = 500;

function stripMask(value: string): string {
  return value.replace(/[\s.()\-]/g, "");
}

function parseDate(value: string): Date | undefined {
  if (!value || value.trim() === "") return undefined;

  const ddmmyyyy = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
    return isNaN(d.getTime()) ? undefined : d;
  }

  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? undefined : d;
}

interface ParseCsvSuccess {
  rows: ParsedRow[];
}

interface ParseCsvError {
  error: string;
}

type ParseCsvResult = ParseCsvSuccess | ParseCsvError;

export function parseCsv(csvString: string): ParseCsvResult {
  const result = Papa.parse<ParsedRow>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const fields = result.meta.fields ?? [];
  const required = ["nome", "cpf", "telefone"];
  const missing = required.filter((col) => !fields.includes(col));
  if (missing.length > 0) {
    return {
      error: `Colunas obrigatórias ausentes: ${missing.join(", ")}`,
    };
  }

  if (result.data.length > MAX_ROWS) {
    return {
      error: `O arquivo excede o limite de ${MAX_ROWS} linhas`,
    };
  }

  return { rows: result.data };
}

interface ValidateRowSuccess {
  row: ValidatedRow;
}

interface ValidateRowError {
  errors: ImportRowError[];
}

type ValidateRowResult = ValidateRowSuccess | ValidateRowError;

export function validateRow(
  raw: ParsedRow,
  rowIndex: number,
): ValidateRowResult {
  const errors: ImportRowError[] = [];
  const rowNumber = rowIndex + 2;

  const name = raw.nome?.trim() ?? "";
  if (!name || name.length < 2 || name.length > 120) {
    errors.push({
      row: rowNumber,
      cpf: raw.cpf,
      field: "nome",
      message: "Nome deve ter entre 2 e 120 caracteres",
    });
  }

  const cpfRaw = raw.cpf?.trim() ?? "";
  const cpf = stripMask(cpfRaw);
  if (!cpf || !/^\d{11}$/.test(cpf)) {
    errors.push({
      row: rowNumber,
      cpf: cpfRaw,
      field: "cpf",
      message: "CPF deve conter exatamente 11 dígitos",
    });
  }

  const phoneRaw = raw.telefone?.trim() ?? "";
  const phone = stripMask(phoneRaw);
  if (!phone || !/^\d{10,11}$/.test(phone)) {
    errors.push({
      row: rowNumber,
      cpf: cpfRaw,
      field: "telefone",
      message: "Telefone deve conter 10 ou 11 dígitos",
    });
  }

  const emailRaw = raw.email?.trim();
  let email: string | undefined;
  if (emailRaw && emailRaw !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailRaw)) {
      errors.push({
        row: rowNumber,
        cpf: cpfRaw,
        field: "email",
        message: "Formato de e-mail inválido",
      });
    } else {
      email = emailRaw;
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const planId = raw.plano_id?.trim() || undefined;
  const joinedAt = raw.data_entrada ? parseDate(raw.data_entrada) : undefined;

  return {
    row: {
      name: name,
      cpf,
      phone,
      email,
      planId,
      joinedAt,
    },
  };
}

interface ImportMembersResult {
  imported: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}

interface ImportServiceError {
  error: string;
}

export type ImportServiceResult = ImportMembersResult | ImportServiceError;

async function processBatch(
  prisma: PrismaClient,
  clubId: string,
  batch: ValidatedRow[],
  rowErrors: ImportRowError[],
  counters: { created: number; updated: number },
  batchStartIndex: number,
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    // Pre-fetch existing CPFs in this batch to determine create vs update
    const cpfs = batch.map((r) => r.cpf);
    const existing = await tx.member.findMany({
      where: { cpf: { in: cpfs } },
      select: { cpf: true },
    });
    const existingCpfSet = new Set(existing.map((m: { cpf: string }) => m.cpf));

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i]!;
      const wasExisting = existingCpfSet.has(row.cpf);

      try {
        const member = await tx.member.upsert({
          where: { cpf: row.cpf },
          create: {
            name: row.name,
            cpf: row.cpf,
            phone: row.phone,
            email: row.email ?? null,
            ...(row.joinedAt ? { joinedAt: row.joinedAt } : {}),
          },
          update: {
            name: row.name,
            phone: row.phone,
            email: row.email ?? null,
          },
        });

        if (wasExisting) {
          counters.updated++;
        } else {
          counters.created++;
        }

        // Link to plan if provided — plan must exist in this tenant's schema and be active
        if (row.planId) {
          const plan = await tx.plan.findUnique({
            where: { id: row.planId },
            select: { id: true, isActive: true },
          });

          if (plan && plan.isActive) {
            await tx.memberPlan.upsert({
              where: {
                memberId_planId: { memberId: member.id, planId: row.planId },
              },
              create: { memberId: member.id, planId: row.planId },
              // update: {} is intentional — nothing to update on a simple join record
              update: {},
            });
          }
          // If plan not found or inactive, silently skip — member is still created/updated
        }
      } catch (err) {
        if (isPrismaUniqueConstraintError(err)) {
          // This can occur in a race condition where two concurrent imports
          // try to create the same CPF simultaneously. Safe to record as error
          // without aborting the entire batch.
          rowErrors.push({
            row: batchStartIndex + i + 2,
            cpf: row.cpf,
            field: "cpf",
            message: "CPF já existe (conflito concorrente)",
          });
        } else {
          // Unexpected DB error — re-throw to abort the transaction
          throw err;
        }
      }
    }
  });
}

export async function importMembersFromCsv(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  csvString: string,
): Promise<ImportServiceResult> {
  const parsed = parseCsv(csvString);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { rows } = parsed;

  const errors: ImportRowError[] = [];
  const validRows: ValidatedRow[] = [];
  const validRowOriginalIndices: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i]!, i);
    if ("errors" in result) {
      errors.push(...result.errors);
    } else {
      validRows.push(result.row);
      validRowOriginalIndices.push(i);
    }
  }

  if (validRows.length === 0) {
    return {
      imported: rows.length,
      created: 0,
      updated: 0,
      errors,
    };
  }

  // Shared mutable counters updated across all batches
  const counters = { created: 0, updated: 0 };

  // Process in batches to avoid transaction timeouts with large files (up to 5000 rows)
  for (
    let batchStart = 0;
    batchStart < validRows.length;
    batchStart += BATCH_SIZE
  ) {
    const batch = validRows.slice(batchStart, batchStart + BATCH_SIZE);
    const batchOriginalStart =
      validRowOriginalIndices[batchStart] ?? batchStart;

    await processBatch(
      prisma,
      clubId,
      batch,
      errors,
      counters,
      batchOriginalStart,
    );
  }

  // Write a single audit log entry after all batches complete successfully
  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBER_CREATED",
        entityType: "Member",
        metadata: {
          source: "csv_import",
          totalRows: rows.length,
          created: counters.created,
          updated: counters.updated,
          skipped: errors.length,
        },
      },
    });
  });

  return {
    imported: rows.length,
    created: counters.created,
    updated: counters.updated,
    errors,
  };
}

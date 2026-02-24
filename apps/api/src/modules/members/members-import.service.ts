import Papa from "papaparse";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { encryptField, findMemberByCpf } from "../../lib/crypto.js";
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
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i]!;

      try {
        const existing = await findMemberByCpf(tx, row.cpf);

        const [encryptedCpf, encryptedPhone] = await Promise.all([
          encryptField(tx, row.cpf),
          encryptField(tx, row.phone),
        ]);

        let member: { id: string };

        if (existing) {
          member = await tx.member.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              phone: encryptedPhone,
              email: row.email ?? null,
            },
          });
          counters.updated++;
        } else {
          member = await tx.member.create({
            data: {
              name: row.name,
              cpf: encryptedCpf,
              phone: encryptedPhone,
              email: row.email ?? null,
              ...(row.joinedAt ? { joinedAt: row.joinedAt } : {}),
            },
          });
          counters.created++;
        }

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
              update: {},
            });
          }
        }
      } catch (err) {
        throw err;
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

  const counters = { created: 0, updated: 0 };

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

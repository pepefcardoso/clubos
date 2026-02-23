import Papa from "papaparse";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
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

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i]!, i);
    if ("errors" in result) {
      errors.push(...result.errors);
    } else {
      validRows.push(result.row);
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

  let created = 0;
  let updated = 0;

  await withTenantSchema(prisma, clubId, async (tx) => {
    const cpfs = validRows.map((r) => r.cpf);
    const existing = await tx.member.findMany({
      where: { cpf: { in: cpfs } },
      select: { cpf: true },
    });
    const existingCpfSet = new Set(existing.map((m: { cpf: string }) => m.cpf));

    for (const row of validRows) {
      const wasExisting = existingCpfSet.has(row.cpf);

      const member = await tx.member.upsert({
        where: { cpf: row.cpf },
        create: {
          name: row.name,
          cpf: row.cpf,
          phone: row.phone,
          email: row.email ?? null,
          joinedAt: row.joinedAt,
        },
        update: {
          name: row.name,
          phone: row.phone,
          email: row.email ?? null,
        },
      });

      if (wasExisting) {
        updated++;
      } else {
        created++;
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
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBER_CREATED",
        entityType: "Member",
        metadata: {
          source: "csv_import",
          created,
          updated,
          errors: errors.length,
        },
      },
    });
  });

  return {
    imported: rows.length,
    created,
    updated,
    errors,
  };
}

import type { PrismaClient } from "../../generated/prisma/index.js";
import { withTenantSchema } from "./prisma.js";

/**
 * Protocol seed entry shape.
 * Using a plain object type here (not importing from Prisma) keeps this module
 * independent of generated client changes and avoids circular imports.
 */
interface ProtocolSeed {
  readonly id: string;
  readonly name: string;
  readonly structure: string;
  readonly grade: "GRADE_1" | "GRADE_2" | "GRADE_3" | "COMPLETE";
  readonly durationDays: number;
  readonly source: string;
  readonly steps: ReadonlyArray<Record<string, string>>;
}

/**
 * FIFA Medical standard injury protocols (representative subset).
 *
 * Grade classification follows FIFA Medical 2023:
 *   GRADE_1 = mild     (< 7 days)
 *   GRADE_2 = moderate (7–28 days)
 *   GRADE_3 = severe   (> 28 days)
 *   COMPLETE = complete rupture / structural failure
 */
const FIFA_PROTOCOLS: ReadonlyArray<ProtocolSeed> = [
  {
    id: "proto_hamstring_g1",
    name: "Hamstring Strain — Grade I",
    structure: "Hamstring",
    grade: "GRADE_1",
    durationDays: 7,
    source: "FIFA Medical 2023",
    steps: [
      { day: "1-2", activity: "PRICE protocol, cryotherapy 15min × 3/day" },
      {
        day: "3-5",
        activity: "Light stretching, pain-free range of motion exercises",
      },
      {
        day: "6-7",
        activity:
          "Progressive running, return to full training if asymptomatic",
      },
    ],
  },
  {
    id: "proto_hamstring_g2",
    name: "Hamstring Strain — Grade II",
    structure: "Hamstring",
    grade: "GRADE_2",
    durationDays: 21,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity:
          "PRICE protocol, physiotherapy initiation, crutches if needed",
      },
      {
        day: "4-10",
        activity:
          "Progressive resistance exercises (isometric → isotonic), pool running",
      },
      {
        day: "11-18",
        activity:
          "Running program, sport-specific drills, agility ladder at 70%",
      },
      {
        day: "19-21",
        activity:
          "Return-to-play protocol: full training, medical clearance required",
      },
    ],
  },
  {
    id: "proto_hamstring_g3",
    name: "Hamstring Strain — Grade III",
    structure: "Hamstring",
    grade: "GRADE_3",
    durationDays: 42,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-5",
        activity: "PRICE, crutches, physiotherapy assessment for surgical need",
      },
      { day: "6-14", activity: "Non-weight-bearing exercises, aqua therapy" },
      {
        day: "15-28",
        activity: "Progressive loading, eccentric strengthening",
      },
      {
        day: "29-42",
        activity:
          "Running progression, sport-specific rehabilitation, clearance testing",
      },
    ],
  },
  {
    id: "proto_ankle_lateral_g1",
    name: "Lateral Ankle Sprain — Grade I",
    structure: "Ankle",
    grade: "GRADE_1",
    durationDays: 7,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-2",
        activity: "PRICE, compression bandage, partial weight-bearing",
      },
      {
        day: "3-5",
        activity:
          "Proprioception exercises, balance board, full weight-bearing",
      },
      { day: "6-7", activity: "Sport-specific drills, return to training" },
    ],
  },
  {
    id: "proto_ankle_lateral_g2",
    name: "Lateral Ankle Sprain — Grade II",
    structure: "Ankle",
    grade: "GRADE_2",
    durationDays: 14,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity: "PRICE, aircast brace, crutches for first 48h",
      },
      {
        day: "4-7",
        activity: "Progressive weight-bearing, range of motion, proprioception",
      },
      {
        day: "8-14",
        activity:
          "Running drills, agility, sport-specific rehabilitation, return to play",
      },
    ],
  },
  {
    id: "proto_quad_g1",
    name: "Quadriceps Strain — Grade I",
    structure: "Quadriceps",
    grade: "GRADE_1",
    durationDays: 7,
    source: "FIFA Medical 2023",
    steps: [
      { day: "1-2", activity: "PRICE, cryotherapy, rest from training" },
      {
        day: "3-5",
        activity: "Pain-free stretching, isometric strengthening",
      },
      {
        day: "6-7",
        activity: "Progressive running, return to full training if pain-free",
      },
    ],
  },
] as const;

/**
 * Seeds the injury_protocols table with FIFA Medical standard protocols.
 *
 * Idempotent: uses `ON CONFLICT (id) DO NOTHING` — safe to call on every
 * provision or restart. Existing rows are never overwritten, which preserves
 * any club-level customisations made after initial seeding.
 *
 * Called by `provisionTenantSchema` **outside** the main DDL transaction,
 * because `withTenantSchema` opens its own transaction internally.
 *
 * @param prisma  Global Prisma client (public schema connection).
 * @param clubId  Tenant club ID — used to set the correct search_path.
 */
export async function seedInjuryProtocols(
  prisma: PrismaClient,
  clubId: string,
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    for (const protocol of FIFA_PROTOCOLS) {
      await tx.$executeRaw`
        INSERT INTO "injury_protocols" (
          "id",
          "name",
          "structure",
          "grade",
          "steps",
          "source",
          "durationDays",
          "isActive",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${protocol.id},
          ${protocol.name},
          ${protocol.structure},
          ${protocol.grade}::"InjuryGrade",
          ${JSON.stringify(protocol.steps)}::jsonb,
          ${protocol.source},
          ${protocol.durationDays},
          true,
          NOW(),
          NOW()
        )
        ON CONFLICT ("id") DO NOTHING
      `;
    }
  });
}

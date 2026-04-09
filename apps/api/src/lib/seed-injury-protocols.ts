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
 * FIFA Medical standard injury protocols (20 protocols).
 *
 * Grade classification follows FIFA Medical 2023:
 *   GRADE_1 = mild     (< 7 days)
 *   GRADE_2 = moderate (7–28 days)
 *   GRADE_3 = severe   (> 28 days)
 *   COMPLETE = complete rupture / structural failure
 *
 * Structures covered: Hamstring, Ankle, Quadriceps, MCL, ACL, Calf,
 *                     Adductor, Hip Flexor, Metatarsal, Patellar Tendon
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
    id: "proto_ankle_lateral_g3",
    name: "Lateral Ankle Sprain — Grade III",
    structure: "Ankle",
    grade: "GRADE_3",
    durationDays: 28,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-5",
        activity:
          "PRICE, cast/aircast brace, non-weight-bearing, physiotherapy assessment",
      },
      {
        day: "6-14",
        activity:
          "Progressive weight-bearing, range of motion, soft tissue mobilization",
      },
      {
        day: "15-21",
        activity: "Proprioception training, balance board, resistance bands",
      },
      {
        day: "22-28",
        activity:
          "Running program, agility, sport-specific rehabilitation, return to play clearance",
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
  {
    id: "proto_quad_g2",
    name: "Quadriceps Strain — Grade II",
    structure: "Quadriceps",
    grade: "GRADE_2",
    durationDays: 21,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity:
          "PRICE, crutches if needed, cryotherapy 3×/day, physiotherapy initiation",
      },
      {
        day: "4-10",
        activity:
          "Progressive resistance exercises (isometric → isotonic), pool running",
      },
      {
        day: "11-18",
        activity:
          "Sport-specific drills, eccentric strengthening, agility at 70%",
      },
      {
        day: "19-21",
        activity:
          "Full training, medical clearance required for return to play",
      },
    ],
  },
  {
    id: "proto_quad_g3",
    name: "Quadriceps Strain — Grade III",
    structure: "Quadriceps",
    grade: "GRADE_3",
    durationDays: 35,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-5",
        activity:
          "PRICE, crutches, physiotherapy assessment, surgical consultation if complete rupture",
      },
      {
        day: "6-14",
        activity:
          "Non-weight-bearing exercises, aqua therapy, soft tissue work",
      },
      {
        day: "15-25",
        activity:
          "Progressive loading, eccentric strengthening, neuromuscular control",
      },
      {
        day: "26-35",
        activity:
          "Running progression, sport-specific rehabilitation, functional testing and clearance",
      },
    ],
  },

  {
    id: "proto_mcl_g1",
    name: "MCL Sprain — Grade I",
    structure: "MCL",
    grade: "GRADE_1",
    durationDays: 10,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity: "PRICE, compression brace, full weight-bearing as tolerated",
      },
      {
        day: "4-7",
        activity:
          "Strengthening exercises (VMO, hip abductors), proprioception",
      },
      {
        day: "8-10",
        activity:
          "Sport-specific drills, return to training if fully pain-free",
      },
    ],
  },
  {
    id: "proto_mcl_g2",
    name: "MCL Sprain — Grade II",
    structure: "MCL",
    grade: "GRADE_2",
    durationDays: 21,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-5",
        activity:
          "PRICE, hinged knee brace 0–90°, partial weight-bearing, crutches",
      },
      {
        day: "6-12",
        activity:
          "Full weight-bearing, progressive ROM, closed kinetic chain exercises",
      },
      {
        day: "13-18",
        activity: "Running drills, lateral movement, sport-specific agility",
      },
      {
        day: "19-21",
        activity:
          "Return to full training with brace, medical clearance required",
      },
    ],
  },
  {
    id: "proto_mcl_g3",
    name: "MCL Sprain — Grade III",
    structure: "MCL",
    grade: "GRADE_3",
    durationDays: 42,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-7",
        activity:
          "Brace immobilisation, non-weight-bearing, crutches, surgical evaluation",
      },
      {
        day: "8-21",
        activity: "Progressive weight-bearing, physiotherapy, ROM recovery",
      },
      {
        day: "22-35",
        activity: "Strengthening, proprioception, functional movement patterns",
      },
      {
        day: "36-42",
        activity: "Running program, cutting drills, clearance testing",
      },
    ],
  },

  {
    id: "proto_acl_complete",
    name: "ACL Rupture — Complete (Post-Surgical)",
    structure: "ACL",
    grade: "COMPLETE",
    durationDays: 270,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-14",
        activity:
          "Post-surgical immobilisation, crutches, cryotherapy, wound care",
      },
      {
        day: "15-42",
        activity:
          "Progressive weight-bearing, ROM recovery, quadriceps activation",
      },
      {
        day: "43-90",
        activity: "Strength training, proprioception, cycling, pool running",
      },
      {
        day: "91-150",
        activity:
          "Running program, straight-line speed, sport-specific movements",
      },
      {
        day: "151-210",
        activity: "Change of direction, agility, return to team training",
      },
      {
        day: "211-270",
        activity:
          "Full team training, psychological readiness assessment, functional clearance",
      },
    ],
  },

  {
    id: "proto_calf_g1",
    name: "Calf Strain (Gastrocnemius) — Grade I",
    structure: "Calf",
    grade: "GRADE_1",
    durationDays: 7,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-2",
        activity: "PRICE, avoid full plantarflexion load, cryotherapy",
      },
      {
        day: "3-5",
        activity:
          "Progressive heel raises, pain-free stretching, eccentric protocol initiation",
      },
      {
        day: "6-7",
        activity: "Running, return to full training if pain-free",
      },
    ],
  },
  {
    id: "proto_calf_g2",
    name: "Calf Strain (Gastrocnemius) — Grade II",
    structure: "Calf",
    grade: "GRADE_2",
    durationDays: 21,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-4",
        activity:
          "PRICE, partial weight-bearing, heel lift in shoe, physiotherapy",
      },
      {
        day: "5-10",
        activity:
          "Progressive eccentric calf raises, pool walking, range of motion",
      },
      {
        day: "11-18",
        activity: "Running progression, jumping, sport-specific drills",
      },
      {
        day: "19-21",
        activity: "Return to full training, clearance testing",
      },
    ],
  },

  {
    id: "proto_adductor_g1",
    name: "Adductor Strain — Grade I",
    structure: "Adductor",
    grade: "GRADE_1",
    durationDays: 10,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity:
          "Rest, cryotherapy, gentle active ROM, avoid hip abduction loading",
      },
      {
        day: "4-7",
        activity:
          "Isometric adductor squeezes, progressive resistance, bike/pool",
      },
      {
        day: "8-10",
        activity: "Running, lateral drills, return to training if asymptomatic",
      },
    ],
  },
  {
    id: "proto_adductor_g2",
    name: "Adductor Strain — Grade II",
    structure: "Adductor",
    grade: "GRADE_2",
    durationDays: 21,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-5",
        activity:
          "Rest, crutches if needed, cryotherapy, compression, physiotherapy",
      },
      {
        day: "6-12",
        activity:
          "Copenhagen adduction exercises, progressive resistance, aqua therapy",
      },
      {
        day: "13-18",
        activity: "Running, lateral movements, sport-specific rehabilitation",
      },
      {
        day: "19-21",
        activity: "Full team training, clearance required",
      },
    ],
  },

  {
    id: "proto_hip_flexor_g1",
    name: "Hip Flexor Strain — Grade I",
    structure: "Hip Flexor",
    grade: "GRADE_1",
    durationDays: 10,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-3",
        activity: "Rest from kicking/sprinting, cryotherapy, gentle ROM",
      },
      {
        day: "4-7",
        activity:
          "Hip flexor stretching, core activation, progressive resistance",
      },
      {
        day: "8-10",
        activity:
          "Running, kicking drills, return to full training if pain-free",
      },
    ],
  },

  {
    id: "proto_metatarsal_fracture",
    name: "Metatarsal Fracture (2nd–5th)",
    structure: "Metatarsal",
    grade: "GRADE_3",
    durationDays: 56,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-14",
        activity:
          "Cast/boot immobilisation, non-weight-bearing, crutches, X-ray confirmation",
      },
      {
        day: "15-28",
        activity:
          "Progressive weight-bearing in boot, swimming, upper body training",
      },
      {
        day: "29-42",
        activity: "Walking without boot, proprioception, cycling, pool running",
      },
      {
        day: "43-56",
        activity:
          "Running progression, sport-specific training, repeat imaging before clearance",
      },
    ],
  },

  {
    id: "proto_patellar_tendon_g2",
    name: "Patellar Tendinopathy — Grade II",
    structure: "Patellar Tendon",
    grade: "GRADE_2",
    durationDays: 42,
    source: "FIFA Medical 2023",
    steps: [
      {
        day: "1-7",
        activity:
          "Relative rest, cryotherapy post-activity, isometric quad loading (pain relief)",
      },
      {
        day: "8-21",
        activity:
          "Heavy slow resistance (HSR) protocol: leg press + squats 3×/week",
      },
      {
        day: "22-35",
        activity: "Energy storage exercises: jump squats, hop progressions",
      },
      {
        day: "36-42",
        activity:
          "Sport-specific plyometrics, return to full training with ongoing load management",
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

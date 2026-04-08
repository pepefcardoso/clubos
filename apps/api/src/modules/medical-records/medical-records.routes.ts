import type { FastifyInstance } from "fastify";
import {
  CreateMedicalRecordSchema,
  UpdateMedicalRecordSchema,
  ListMedicalRecordsQuerySchema,
} from "./medical-records.schema.js";
import {
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord,
  listMedicalRecords,
  MedicalRecordNotFoundError,
  AthleteNotFoundError,
  ProtocolNotFoundError,
} from "./medical-records.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Medical record routes — all endpoints require PHYSIO or ADMIN role.
 *
 * Uses the OR-allowlist form `requireRole('ADMIN', 'PHYSIO')` which:
 *   - Grants access to ADMIN (full administrative oversight).
 *   - Grants access to PHYSIO (clinical data owner).
 *   - Blocks TREASURER and COACH — financial/coaching roles have zero
 *     visibility into encrypted clinical data (Privacy by Design).
 *
 * Mounted under `/api/medical-records` in protected.routes.ts.
 */
export async function medicalRecordRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/medical-records
   * Paginated list of medical record summaries.
   * Clinical fields (clinicalNotes, diagnosis, treatmentDetails) are NOT
   * returned here — use GET /:recordId for the full decrypted record.
   * A data_access_log entry (action: "LIST") is written for every call
   * per LGPD Art. 37.
   */
  fastify.get(
    "/",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const parsed = ListMedicalRecordsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Invalid query parameters",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const userAgent = request.headers["user-agent"];

      const result = await listMedicalRecords(
        fastify.prisma,
        clubId,
        parsed.data,
        request.actorId,
        {
          ipAddress: request.ip,
          ...(userAgent ? { userAgent } : {}),
        },
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/medical-records
   * Create a new injury medical record for an athlete.
   * Clinical fields are encrypted at rest (AES-256 via pgcrypto).
   * No data_access_log entry is written on create — no encrypted data is read back.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const parsed = CreateMedicalRecordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const record = await createMedicalRecord(
          fastify.prisma,
          clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(201).send(record);
      } catch (err) {
        if (err instanceof AthleteNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ProtocolNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * GET /api/medical-records/:recordId
   * Retrieve a single record with all clinical fields decrypted.
   * Writes a data_access_log entry (LGPD Art. 37) and an audit_log entry
   * (MEDICAL_RECORD_ACCESSED) on every successful response.
   */
  fastify.get(
    "/:recordId",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const { recordId } = request.params as { recordId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        const userAgent = request.headers["user-agent"];

        const record = await getMedicalRecordById(
          fastify.prisma,
          clubId,
          recordId,
          request.actorId,
          {
            ipAddress: request.ip,
            ...(userAgent ? { userAgent } : {}),
          },
        );
        return reply.status(200).send(record);
      } catch (err) {
        if (err instanceof MedicalRecordNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * PUT /api/medical-records/:recordId
   * Partially update a medical record — any subset of fields.
   * Clinical fields are re-encrypted on update or set to NULL if cleared.
   * A data_access_log entry (action: "UPDATE_READ") is written when clinical
   * fields are decrypted for the response. Plaintext-only updates
   * do NOT generate a data_access_log entry.
   */
  fastify.put(
    "/:recordId",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const { recordId } = request.params as { recordId: string };

      const parsed = UpdateMedicalRecordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const userAgent = request.headers["user-agent"];

      try {
        const record = await updateMedicalRecord(
          fastify.prisma,
          clubId,
          request.actorId,
          recordId,
          parsed.data,
          {
            ipAddress: request.ip,
            ...(userAgent ? { userAgent } : {}),
          },
        );
        return reply.status(200).send(record);
      } catch (err) {
        if (err instanceof MedicalRecordNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ProtocolNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/medical-records/:recordId
   * Permanently removes a medical record (hard delete).
   * Deletion is tracked in audit_log with metadata.deleted = true.
   * A data_access_log entry (action: "DELETE_ACCESS") is also written
   * per LGPD Art. 37.
   */
  fastify.delete(
    "/:recordId",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const { recordId } = request.params as { recordId: string };
      const { clubId } = request.user as AccessTokenPayload;
      const userAgent = request.headers["user-agent"];

      try {
        await deleteMedicalRecord(
          fastify.prisma,
          clubId,
          request.actorId,
          recordId,
          {
            ipAddress: request.ip,
            ...(userAgent ? { userAgent } : {}),
          },
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof MedicalRecordNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}

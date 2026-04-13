import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../types/fastify.js";
import { memberRoutes } from "./members/members.routes.js";
import { planRoutes } from "./plans/plans.routes.js";
import { chargeRoutes } from "./charges/charges.routes.js";
import { templateRoutes } from "./templates/templates.routes.js";
import { messageRoutes } from "./messages/messages.routes.js";
import { dashboardRoutes } from "./dashboard/dashboard.routes.js";
import { athleteRoutes } from "./athletes/athletes.routes.js";
import { contractRoutes } from "./contracts/contracts.routes.js";
import { rulesConfigRoutes } from "./rules/rules-config.routes.js";
import { workloadRoutes } from "./workload/workload.routes.js";
import { expenseRoutes } from "./expenses/expenses.routes.js";
import { reconciliationRoutes } from "./reconciliation/reconciliation.routes.js";
import { balanceSheetAdminRoutes } from "./balance-sheets/balance-sheets.routes.js";
import { exerciseRoutes } from "./exercises/exercises.routes.js";
import { trainingSessionRoutes } from "./training-sessions/training-sessions.routes.js";
import { integrationRoutes } from "./integrations/integrations.routes.js";
import { evaluationRoutes } from "./evaluations/evaluations.routes.js";
import { medicalRecordRoutes } from "./medical-records/medical-records.routes.js";
import { rtpRoutes } from "./rtp/rtp.routes.js";
import { injuryProtocolRoutes } from "./injury-protocols/injury-protocols.routes.js";
import { creditorDisclosureRoutes } from "./creditor-disclosures/creditor-disclosures.routes.js";

/**
 * All routes registered inside this plugin are automatically protected
 * by `verifyAccessToken` via `addHook('preHandler', ...)`.
 *
 * This means new endpoints added here will NEVER accidentally be left
 * unauthenticated — the guard is enforced at the plugin boundary.
 *
 * A second hook populates `request.actorId` with the authenticated user's `sub`,
 * so every handler can reference it for AuditLog entries without repeating the
 * extraction logic.
 *
 * For routes that also require a specific role, chain `requireRole` as an
 * additional preHandler on the individual route:
 *
 * ```ts
 * fastify.delete('/members/:id', {
 *   preHandler: [fastify.requireRole('ADMIN')],
 * }, handler)
 * ```
 *
 * Note: `verifyAccessToken` does NOT need to be repeated in that array —
 * it already runs via the plugin-level hook.
 *
 * Routes that must remain PUBLIC (no JWT required):
 *   - GET  /health              → registered directly in server.ts
 *   - POST /api/auth/login      → registered in authRoutes (outside this plugin)
 *   - POST /api/auth/refresh    → same
 *   - POST /api/auth/logout     → same
 *   - POST /webhooks/:gateway   → authenticated via HMAC, not JWT
 */
export async function protectedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.verifyAccessToken);

  fastify.addHook("preHandler", async (request) => {
    const user = request.user as AccessTokenPayload;
    request.actorId = user.sub;
  });

  await fastify.register(memberRoutes, { prefix: "/members" });
  await fastify.register(planRoutes, { prefix: "/plans" });
  await fastify.register(chargeRoutes, { prefix: "/charges" });
  await fastify.register(templateRoutes, { prefix: "/templates" });
  await fastify.register(messageRoutes, { prefix: "/messages" });
  await fastify.register(dashboardRoutes, { prefix: "/dashboard" });
  await fastify.register(athleteRoutes, { prefix: "/athletes" });
  await fastify.register(rtpRoutes, { prefix: "/athletes" });
  await fastify.register(contractRoutes, { prefix: "/contracts" });
  await fastify.register(rulesConfigRoutes, { prefix: "/rules-config" });
  await fastify.register(workloadRoutes, { prefix: "/workload" });
  await fastify.register(expenseRoutes, { prefix: "/expenses" });
  await fastify.register(reconciliationRoutes, { prefix: "/reconciliation" });
  await fastify.register(balanceSheetAdminRoutes, { prefix: "/clubs" });
  await fastify.register(exerciseRoutes, { prefix: "/exercises" });
  await fastify.register(trainingSessionRoutes, {
    prefix: "/training-sessions",
  });
  await fastify.register(integrationRoutes, { prefix: "/integrations" });
  await fastify.register(evaluationRoutes, { prefix: "/evaluations" });
  await fastify.register(injuryProtocolRoutes, { prefix: "/injury-protocols" });
  await fastify.register(medicalRecordRoutes, { prefix: "/medical-records" });
  await fastify.register(creditorDisclosureRoutes, {
    prefix: "/creditor-disclosures",
  });
}

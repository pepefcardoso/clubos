import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../types/fastify.js";
import { memberRoutes } from "./members/members.routes.js";
import { planRoutes } from "./plans/plans.routes.js";

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
}

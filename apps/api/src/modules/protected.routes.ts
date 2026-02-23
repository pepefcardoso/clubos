import type { FastifyInstance } from "fastify";

/**
 * All routes registered inside this plugin are automatically protected
 * by `verifyAccessToken` via `addHook('preHandler', ...)`.
 *
 * This means new endpoints added here will NEVER accidentally be left
 * unauthenticated — the guard is enforced at the plugin boundary.
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

  // -------------------------------------------------------------------------
  // Register feature route modules here as they are implemented.
  // Each import should be a Fastify sub-plugin that registers its own routes.
  // Example:
  //   await fastify.register(memberRoutes, { prefix: '/members' })
  //   await fastify.register(planRoutes,   { prefix: '/plans'   })
  //   await fastify.register(chargeRoutes, { prefix: '/charges' })
  // -------------------------------------------------------------------------
}

import type { FastifyInstance } from "fastify";
import { sseBus, type SseBusEvent } from "../../../lib/sse-bus.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";

/**
 * SSE endpoint — GET /api/scout/events
 *
 * Streams real-time events for the authenticated scout.
 *
 * Registered in server.ts OUTSIDE protectedRoutes (same pattern as eventsRoutes)
 * so the ?token= EventSource auth pattern works before the plugin-level hook.
 *
 * Protocol:
 *   - Client connects with a valid SCOUT Bearer access token (header OR ?token= param).
 *   - Server sends a `connected` event immediately as a keep-alive handshake.
 *   - Server sends a `CONTACT_REQUEST_RECEIVED` event when a club accepts/rejects
 *     a contact request from this scout.
 *   - Server sends a `:keepalive\n\n` comment every 25s.
 *   - When the client disconnects, the listener is removed from the bus.
 *
 * Security:
 *   - [SEC-TEN] SCOUT JWT has clubId: null. Channel is `scout:{sub}` — structurally
 *     isolated from `club:*` channels. A SCOUT token can never receive club events.
 *   - Non-SCOUT roles (ADMIN, TREASURER, PHYSIO) receive 403.
 *   - ?token= query param is injected into Authorization header before verification.
 *   - Query params are redacted from access logs via pino redaction in server.ts.
 *
 * Scaling note: see SseBus JSDoc in sse-bus.ts.
 */
export async function scoutEventsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get("/", { config: { rateLimit: false } }, async (request, reply) => {
    const query = request.query as { token?: string };
    if (query.token && !request.headers["authorization"]) {
      request.headers["authorization"] = `Bearer ${query.token}`;
    }

    await fastify.verifyAccessToken(request, reply);
    if (reply.sent) return;

    const user = request.user as AccessTokenPayload | undefined;
    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Missing or invalid access token.",
      });
    }

    if (user.role !== "SCOUT") {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Acesso negado.",
      });
    }

    const scoutId = user.sub;
    const channel = `scout:${scoutId}`;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ scoutId })}\n\n`,
    );

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(":keepalive\n\n");
      }
    }, 25_000);

    const onEvent = (event: SseBusEvent) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`,
        );
      }
    };

    sseBus.on(channel, onEvent);

    const cleanup = () => {
      clearInterval(heartbeat);
      sseBus.off(channel, onEvent);
    };

    request.raw.on("close", cleanup);

    await new Promise<void>((resolve) => {
      request.raw.on("close", resolve);
    });
  });
}

import type { FastifyInstance } from "fastify";
import { sseBus, type SseBusEvent } from "../../lib/sse-bus.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * SSE endpoint — GET /api/events
 *
 * Streams real-time payment confirmation events for the authenticated club.
 *
 * Registered in server.ts OUTSIDE protectedRoutes so we can handle the
 * EventSource auth pattern (token via query param) cleanly before the
 * protectedRoutes plugin-level verifyAccessToken hook would run.
 *
 * Protocol:
 *   - Client connects with a valid Bearer access token (header OR ?token= param).
 *   - Server sends a `connected` event immediately as a keep-alive handshake.
 *   - Server sends a `PAYMENT_CONFIRMED` data event whenever a payment is
 *     processed for the caller's club.
 *   - Server sends a `:keepalive\n\n` comment every 25s to prevent proxies
 *     from closing idle connections.
 *   - When the client disconnects, the listener is removed from the bus.
 *
 * Security:
 *   - verifyAccessToken is called explicitly inside the route handler.
 *   - The ?token= query param is injected into the Authorization header
 *     before verification — needed because EventSource cannot set headers.
 *   - Events are scoped by `clubId` from the JWT — cross-club leakage is
 *     structurally impossible (each connection subscribes to `club:{clubId}`).
 *   - Query params are stripped from access logs to avoid token leakage
 *     (configure pino serializer in server.ts or use a log redaction plugin).
 *
 * Rate limiting:
 *   - Excluded from global rate limiting via `config: { rateLimit: false }`.
 *     SSE connections are long-lived; billing rate-limit tokens on a persistent
 *     connection would exhaust the budget for no security benefit.
 *
 * Scaling note:
 *   Uses in-process EventEmitter (sseBus). For multi-process deployments,
 *   replace sseBus.on/off with Redis SUBSCRIBE/UNSUBSCRIBE.
 */
export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    {
      config: { rateLimit: false },
    },
    async (request, reply) => {
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

      const { clubId } = user;
      const channel = `club:${clubId}`;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ clubId })}\n\n`,
      );

      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) {
          reply.raw.write(":keepalive\n\n");
        }
      }, 25_000);

      const onEvent = (event: SseBusEvent) => {
        if (!reply.raw.destroyed) {
          const line = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
          reply.raw.write(line);
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
    },
  );
}

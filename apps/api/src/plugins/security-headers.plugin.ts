import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

/**
 * Attaches security-relevant HTTP response headers to every API reply.
 *
 * Headers applied on every response:
 *   - X-Content-Type-Options: nosniff      → prevents MIME-type sniffing
 *   - X-Frame-Options: DENY                → prevents clickjacking
 *   - Referrer-Policy                       → limits referrer leakage
 *
 * Production-only:
 *   - Strict-Transport-Security (HSTS)     → forces HTTPS for 2 years
 *
 * Note: HTTPS termination itself happens at the reverse proxy layer.
 * HSTS ensures that once a browser has connected securely, it will
 * refuse to downgrade to HTTP for the declared max-age.
 */
async function securityHeadersPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");

    if (process.env["NODE_ENV"] === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }
  });
}

export default fp(securityHeadersPlugin, {
  name: "security-headers",
  fastify: "5.x",
});

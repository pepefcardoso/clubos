import type { FastifyInstance } from "fastify";

export async function clubPublicRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/public/clubs/:slug/info
   *
   * Returns minimal public club info (name, logoUrl) for display on public
   * pages (tryout form, member verification, transparency).
   *
   * No authentication required.
   * Returns 404 JSON when slug is unknown.
   */
  fastify.get("/clubs/:slug/info", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const club = await fastify.prisma.club.findUnique({
      where: { slug },
      select: { id: true, name: true, logoUrl: true },
    });

    if (!club) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Clube não encontrado.",
      });
    }

    return reply.status(200).send(club);
  });
}

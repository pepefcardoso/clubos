import type { PrismaClient } from "../../../generated/prisma/index.js";
import { NotFoundError, ForbiddenError } from "../../lib/errors.js";

export interface PhysioClubEntry {
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  isPrimary: boolean;
}

/**
 * Returns all clubs a PHYSIO user has active access to,
 * including their primary club from User.clubId.
 *
 * The primary club (User.clubId) is always first in the list.
 * Additional clubs are sourced from physio_club_access rows where isActive=true.
 */
export async function getPhysioClubs(
  prisma: PrismaClient,
  userId: string,
): Promise<PhysioClubEntry[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      clubId: true,
      role: true,
      club: { select: { id: true, name: true, logoUrl: true } },
      physioClubAccess: {
        where: { isActive: true },
        include: {
          club: { select: { id: true, name: true, logoUrl: true } },
        },
      },
    },
  });

  if (!user) throw new NotFoundError("Usuário não encontrado.");
  if (user.role !== "PHYSIO")
    throw new ForbiddenError("Acesso restrito a fisioterapeutas.");

  const primary: PhysioClubEntry = {
    clubId: user.clubId,
    clubName: user.club.name,
    clubLogoUrl: user.club.logoUrl ?? null,
    isPrimary: true,
  };

  const additional: PhysioClubEntry[] = user.physioClubAccess
    .filter((r) => r.clubId !== user.clubId)
    .map((r) => ({
      clubId: r.clubId,
      clubName: r.club.name,
      clubLogoUrl: r.club.logoUrl ?? null,
      isPrimary: false,
    }));

  return [primary, ...additional];
}

/**
 * Validates that a PHYSIO user may switch to the requested clubId.
 *
 * The primary club (User.clubId) is always allowed.
 * Additional clubs require an active physio_club_access row.
 *
 * Always returns ForbiddenError (never NotFoundError) to avoid confirming
 * club existence to unauthorized callers.
 *
 * @throws ForbiddenError if user is not PHYSIO or has no access to targetClubId.
 */
export async function validatePhysioClubSwitch(
  prisma: PrismaClient,
  userId: string,
  targetClubId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clubId: true, role: true },
  });

  if (!user || user.role !== "PHYSIO") {
    throw new ForbiddenError("Acesso restrito a fisioterapeutas.");
  }

  if (user.clubId === targetClubId) return;

  const access = await prisma.physioClubAccess.findUnique({
    where: { userId_clubId: { userId, clubId: targetClubId } },
    select: { isActive: true },
  });

  if (!access?.isActive) {
    throw new ForbiddenError("Acesso a este clube não autorizado.");
  }
}

/**
 * Grants a PHYSIO user access to an additional club.
 * Only ADMIN of the target club may grant access.
 *
 * Idempotent: re-activates an existing soft-revoked row rather than inserting a duplicate.
 */
export async function grantPhysioClubAccess(
  prisma: PrismaClient,
  adminId: string,
  adminClubId: string,
  physioUserId: string,
  targetClubId: string,
): Promise<{ id: string }> {
  if (adminClubId !== targetClubId) {
    throw new ForbiddenError(
      "Apenas o ADMIN do clube-destino pode conceder acesso.",
    );
  }

  const physio = await prisma.user.findUnique({
    where: { id: physioUserId },
    select: { role: true },
  });
  if (!physio)
    throw new NotFoundError("Usuário fisioterapeuta não encontrado.");
  if (physio.role !== "PHYSIO") {
    throw new ForbiddenError(
      "Acesso múltiplo é exclusivo para usuários com papel PHYSIO.",
    );
  }

  const existing = await prisma.physioClubAccess.findUnique({
    where: { userId_clubId: { userId: physioUserId, clubId: targetClubId } },
    select: { id: true, isActive: true },
  });

  if (existing) {
    if (existing.isActive) return { id: existing.id };
    await prisma.physioClubAccess.update({
      where: { id: existing.id },
      data: { isActive: true, grantedBy: adminId, grantedAt: new Date() },
    });
    return { id: existing.id };
  }

  const row = await prisma.physioClubAccess.create({
    data: {
      userId: physioUserId,
      clubId: targetClubId,
      isActive: true,
      grantedBy: adminId,
    },
    select: { id: true },
  });

  return { id: row.id };
}

/**
 * Revokes a PHYSIO user's access to an additional club (soft-delete via isActive=false).
 * Only ADMIN of that club may revoke.
 */
export async function revokePhysioClubAccess(
  prisma: PrismaClient,
  adminClubId: string,
  accessId: string,
): Promise<void> {
  const row = await prisma.physioClubAccess.findUnique({
    where: { id: accessId },
    select: { clubId: true, isActive: true },
  });

  if (!row) throw new NotFoundError("Registro de acesso não encontrado.");
  if (row.clubId !== adminClubId) {
    throw new ForbiddenError(
      "Apenas o ADMIN do clube pode revogar este acesso.",
    );
  }
  if (!row.isActive) return;

  await prisma.physioClubAccess.update({
    where: { id: accessId },
    data: { isActive: false },
  });
}

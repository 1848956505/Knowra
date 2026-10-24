import { createAppError } from '../errors/app-error.ts';

export interface OwnerBoundarySpace {
  readonly id?: unknown;
  readonly userId?: unknown;
}

export interface ResolveSingleOwnerOptions {
  readonly configuredOwnerId?: unknown;
  readonly spaces?: readonly OwnerBoundarySpace[] | undefined;
  readonly fallbackOwnerId?: unknown;
}

export interface PostgresOwnerBoundaryClient {
  readonly knowledgeSpace: {
    findMany(options: {
      select: { id: true; userId: true };
    }): readonly OwnerBoundarySpace[] | PromiseLike<readonly OwnerBoundarySpace[]>;
  };
}

function normalizeOwnerId(value: unknown): string | null {
  const ownerId = String(value ?? '').trim();
  return ownerId || null;
}

export function assertSpacesOwnedBy(spaces: readonly OwnerBoundarySpace[] | undefined = [], ownerId: unknown): string {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    throw createAppError('OWNER_ID_REQUIRED', 'A server owner id is required', 500);
  }

  const foreignSpaces = spaces.filter(space => {
    const spaceOwnerId = normalizeOwnerId(space?.userId);
    return spaceOwnerId && spaceOwnerId !== normalizedOwnerId;
  });
  if (foreignSpaces.length > 0) {
    throw createAppError('OWNER_BOUNDARY_VIOLATION', 'Knowledge storage contains spaces owned by another user', 409, {
      ownerId: normalizedOwnerId,
      spaceIds: foreignSpaces.map(space => space.id)
    });
  }
  return normalizedOwnerId;
}

export function resolveSingleOwnerId({
  configuredOwnerId,
  spaces = [],
  fallbackOwnerId = 'demo'
}: ResolveSingleOwnerOptions = {}): string {
  const configured = normalizeOwnerId(configuredOwnerId);
  const storedOwners = [...new Set(spaces.map(space => normalizeOwnerId(space?.userId)).filter(Boolean))];
  if (storedOwners.length > 1) {
    throw createAppError('OWNER_BOUNDARY_VIOLATION', 'Knowledge storage contains multiple owners', 409, {
      ownerIds: storedOwners
    });
  }

  const ownerId = configured ?? storedOwners[0] ?? normalizeOwnerId(fallbackOwnerId) ?? 'demo';
  assertSpacesOwnedBy(spaces, ownerId);
  return ownerId;
}

export async function assertPostgresOwnerBoundary(
  client: PostgresOwnerBoundaryClient,
  ownerId: unknown
): Promise<string> {
  const spaces = await client.knowledgeSpace.findMany({
    select: { id: true, userId: true }
  });
  return assertSpacesOwnedBy(spaces, ownerId);
}

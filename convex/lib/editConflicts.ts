import { ConvexError } from 'convex/values';

type ConflictEntity = 'business' | 'program' | 'campaign';

export type EditConflictPayload = {
  code: 'EDIT_CONFLICT';
  entity: ConflictEntity;
  entityId: string;
  serverUpdatedAt: number;
};

export function assertExpectedUpdatedAt(params: {
  entity: ConflictEntity;
  entityId: string;
  expectedUpdatedAt: number | undefined;
  actualUpdatedAt: number | undefined;
}) {
  if (params.expectedUpdatedAt === undefined) {
    return;
  }

  if (
    !Number.isFinite(params.actualUpdatedAt) ||
    Number(params.actualUpdatedAt) !== Number(params.expectedUpdatedAt)
  ) {
    throw new ConvexError({
      code: 'EDIT_CONFLICT',
      entity: params.entity,
      entityId: params.entityId,
      serverUpdatedAt: Number(params.actualUpdatedAt ?? 0),
    } satisfies EditConflictPayload);
  }
}

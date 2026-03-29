export type EditConflictPayload = {
  code: 'EDIT_CONFLICT';
  entity: 'business' | 'program' | 'campaign';
  entityId: string;
  serverUpdatedAt: number;
};

function isEditConflictPayload(value: unknown): value is EditConflictPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === 'EDIT_CONFLICT' &&
    typeof (value as { entity?: unknown }).entity === 'string' &&
    typeof (value as { entityId?: unknown }).entityId === 'string' &&
    typeof (value as { serverUpdatedAt?: unknown }).serverUpdatedAt === 'number'
  );
}

export function getEditConflictError(
  error: unknown
): EditConflictPayload | null {
  const direct = (error as { data?: unknown } | null)?.data;
  if (isEditConflictPayload(direct)) {
    return direct;
  }

  const cause = (error as { cause?: { data?: unknown } } | null)?.cause?.data;
  if (isEditConflictPayload(cause)) {
    return cause;
  }

  return null;
}

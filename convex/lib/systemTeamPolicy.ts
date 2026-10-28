import { v } from 'convex/values';

export const systemTeamRole = v.union(v.literal('service'), v.literal('sales'));
export const systemTeamStatus = v.union(
  v.literal('invited'),
  v.literal('active'),
  v.literal('suspended'),
  v.literal('revoked')
);
export const systemTaskStatus = v.union(
  v.literal('open'),
  v.literal('in_progress'),
  v.literal('resolved')
);
export const SYSTEM_TEAM_INVITE_MS = 14 * 86400000;
export const SYSTEM_TEAM_RETENTION_MS = 90 * 86400000;

export function assertSystemTaskScope(input: {
  role: string;
  memberStatus: string;
  memberId: string;
  assignedMemberId: string;
  kind: string;
}) {
  if (
    input.memberStatus !== 'active' ||
    input.memberId !== input.assignedMemberId ||
    (input.role !== 'service' && input.role !== 'sales') ||
    (input.kind !== 'business' &&
      !(input.kind === 'support' && input.role === 'service'))
  ) {
    throw new Error('SYSTEM_TASK_NOT_AUTHORIZED');
  }
}

export function boundedTeamNote(value: string) {
  const note = value.trim();
  if (note.length > 1200) {
    throw new Error('SYSTEM_NOTE_TOO_LONG');
  }
  return note;
}

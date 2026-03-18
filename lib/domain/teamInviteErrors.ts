export const TEAM_INVITE_ERROR_MESSAGES = {
  CANNOT_INVITE_SELF: 'לא ניתן להזמין את עצמך.',
  INVITE_ALREADY_PENDING:
    'העובד כבר מופיע בהזמנות הממתינות. אפשר לבטל את ההזמנה הקיימת ולסרוק מחדש.',
  ALREADY_STAFF: 'המשתמש כבר חלק מהצוות.',
  OWNER_CANNOT_BE_INVITED: 'לא ניתן להזמין בעלים.',
  SUSPENDED_MEMBER_CANNOT_REINVITE: 'לא ניתן להזמין מחדש משתמש מושעה.',
  INVALID_SCAN_TOKEN: 'זה לא QR אישי תקין של עובד.',
  SCAN_TOKEN_EXPIRED: 'תוקף ה-QR פג. בקשו מהעובד לרענן ולסרוק שוב.',
  TARGET_USER_NOT_FOUND: 'לא הצלחנו לזהות משתמש מה-QR שנסרק.',
  NOT_AUTHORIZED: 'אין הרשאה לניהול צוות.',
} as const;

export type TeamInviteErrorCode = keyof typeof TEAM_INVITE_ERROR_MESSAGES;

const TEAM_INVITE_ERROR_CODES = Object.keys(
  TEAM_INVITE_ERROR_MESSAGES
) as TeamInviteErrorCode[];

export function resolveTeamInviteErrorCode(
  error: unknown
): TeamInviteErrorCode | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message ?? '';
  const normalized = message.trim();
  const directMatch = TEAM_INVITE_ERROR_CODES.find(
    (code) => code === normalized
  );
  if (directMatch) {
    return directMatch;
  }

  return TEAM_INVITE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

export function mapTeamInviteErrorToMessage(error: unknown): string | null {
  const code = resolveTeamInviteErrorCode(error);
  return code ? TEAM_INVITE_ERROR_MESSAGES[code] : null;
}

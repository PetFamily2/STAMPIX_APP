import { useQuery } from 'convex/react';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';

export function SystemTeamEntry() {
  const { user } = useUser();
  const access = useQuery(api.systemTeam.viewer, user?.isActive ? {} : 'skip');
  if (
    !access ||
    (!access.administrator && !access.member && access.invitations.length === 0)
  ) {
    return null;
  }
  return (
    <a
      href="/system-team"
      style={{
        color: T.colors.primary,
        minHeight: 48,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        direction: 'rtl',
        fontWeight: 700,
      }}
    >
      {access.invitations.length
        ? 'הזמנה לצוות StampAix ממתינה לאישור'
        : 'מרכז עובדי StampAix'}
    </a>
  );
}

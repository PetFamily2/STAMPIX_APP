import { BusinessWebTeam } from '@/components/business-web/BusinessWebTeam';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebTeamScreen() {
  const { activeBusinessId } = useActiveBusiness();
  return <BusinessWebTeam key={String(activeBusinessId ?? 'none')} />;
}

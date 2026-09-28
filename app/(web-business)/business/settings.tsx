import { BusinessWebSettings } from '@/components/business-web/BusinessWebSettings';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebSettingsScreen() {
  const { activeBusinessId } = useActiveBusiness();
  return <BusinessWebSettings key={String(activeBusinessId ?? 'none')} />;
}

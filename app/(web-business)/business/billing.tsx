import { BusinessWebBilling } from '@/components/business-web/BusinessWebBilling';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebBillingScreen() {
  const { activeBusinessId } = useActiveBusiness();
  return <BusinessWebBilling key={String(activeBusinessId ?? 'none')} />;
}

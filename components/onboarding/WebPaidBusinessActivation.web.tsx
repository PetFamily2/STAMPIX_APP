import { useQuery } from 'convex/react';
import { ActivityIndicator, View } from 'react-native';
import { BusinessWebBilling } from '@/components/business-web/BusinessWebBilling';
import { AppText } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { WebPaidBusinessActivationProps } from './WebPaidBusinessActivation';

export function WebPaidBusinessActivation({
  businessId,
  businessName,
  onBeforeCheckout,
  children,
}: WebPaidBusinessActivationProps) {
  const identity = useQuery(
    api.businessBilling.getBusinessBillingIdentity,
    businessId ? { businessId } : 'skip'
  );
  if (!businessId || identity === undefined) {
    return <ActivityIndicator accessibilityLabel="בודקים את מצב המנוי" />;
  }
  if (
    identity?.businessId === businessId &&
    identity.hasCurrentPaidAccess === true
  ) {
    return <>{children}</>;
  }
  return (
    <View>
      <AppText>
        לפני פרסום העסק בוחרים מסלול ומשלמים. הטיוטה נשמרת לפני המעבר לתשלום.
        לאחר אימות התשלום תוכלו להשלים את הפרסום.
      </AppText>
      <BusinessWebBilling
        key={businessId}
        businessIdOverride={businessId}
        businessNameOverride={businessName}
        onBeforeCheckout={onBeforeCheckout}
      />
    </View>
  );
}

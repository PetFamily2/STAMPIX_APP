import { useQuery } from 'convex/react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BusinessWebBilling } from '@/components/business-web/BusinessWebBilling';
import { AppText } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
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
      <AppText accessibilityRole="header" style={styles.title}>
        בחירת מסלול והפעלת העסק
      </AppText>
      <AppText style={styles.description}>
        בחרו מסלול כדי להפעיל את העסק. הטיוטה נשמרת, ואחרי אימות התשלום תוכלו
        לפרסם את הכרטיסייה.
      </AppText>
      <BusinessWebBilling
        key={businessId}
        businessIdOverride={businessId}
        businessNameOverride={businessName}
        mode="onboarding"
        onBeforeCheckout={onBeforeCheckout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    marginBottom: 6,
  },
  description: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    marginBottom: 12,
  },
});

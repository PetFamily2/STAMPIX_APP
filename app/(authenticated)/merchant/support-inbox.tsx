import { Redirect } from 'expo-router';

export default function LegacyMerchantSupportInboxRoute() {
  return <Redirect href="/(authenticated)/admin/support-inbox" />;
}

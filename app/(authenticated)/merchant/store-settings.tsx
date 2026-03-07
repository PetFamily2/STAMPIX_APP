import { Redirect } from 'expo-router';

export default function MerchantStoreSettingsRedirect() {
  return <Redirect href="/(authenticated)/(business)/settings-business-profile" />;
}

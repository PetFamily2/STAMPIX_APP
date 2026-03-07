import { Redirect } from 'expo-router';

export default function MerchantProfileSettingsRedirect() {
  return (
    <Redirect href="/(authenticated)/(business)/settings-business-account" />
  );
}

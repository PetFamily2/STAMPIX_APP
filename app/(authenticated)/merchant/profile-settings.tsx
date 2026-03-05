import { Redirect } from 'expo-router';

export default function MerchantProfileSettingsRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(authenticated)/(business)/settings',
        params: { section: 'profile' },
      }}
    />
  );
}

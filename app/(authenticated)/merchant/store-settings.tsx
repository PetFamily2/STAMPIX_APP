import { Redirect } from 'expo-router';

export default function MerchantStoreSettingsRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(authenticated)/(business)/settings',
        params: { section: 'store' },
      }}
    />
  );
}

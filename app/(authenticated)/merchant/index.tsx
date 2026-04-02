import { Redirect } from 'expo-router';

export default function MerchantIndexRedirect() {
  return <Redirect href="/(authenticated)/(business)/dashboard" />;
}

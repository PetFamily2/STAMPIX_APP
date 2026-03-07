import { Redirect } from 'expo-router';

export default function MerchantQrRedirect() {
  return <Redirect href="/(authenticated)/(business)/qr" />;
}

import { Redirect } from 'expo-router';

export default function AuthIndex() {
  // Auth entry always lands on welcome.
  return <Redirect href="/(auth)/welcome" />;
}

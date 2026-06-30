import { Redirect } from 'expo-router';

export default function LegacyClientFitRedirect() {
  return <Redirect href="/(auth)/onboarding-client-interests" />;
}

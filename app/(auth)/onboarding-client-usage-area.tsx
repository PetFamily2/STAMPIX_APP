import { Redirect } from 'expo-router';

export default function LegacyClientUsageAreaRedirect() {
  return <Redirect href="/(auth)/onboarding-client-interests" />;
}

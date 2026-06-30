import { Redirect } from 'expo-router';

export default function LegacyClientFrequencyRedirect() {
  return <Redirect href="/(auth)/onboarding-client-interests" />;
}

import { Redirect } from 'expo-router';

export default function AuthIndex() {
  // Keep flow-map as a dev tool, but avoid booting into the heavy diagram on mobile.
  return <Redirect href="/(auth)/welcome" />;
}

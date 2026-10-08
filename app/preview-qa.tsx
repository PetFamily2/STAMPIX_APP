import { Redirect } from 'expo-router';

// Native has no manual QA login route.
export default function PreviewQaUnavailable() {
  return <Redirect href="/(auth)/welcome" />;
}

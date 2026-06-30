import { Redirect } from 'expo-router';

export default function MissingCardRouteScreen() {
  return <Redirect href="/(authenticated)/(customer)/wallet" />;
}

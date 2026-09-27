import { type Href, Redirect } from 'expo-router';

import { CUSTOMER_ROUTES } from '@/lib/navigation/customerRoutes';

export default function MissingCardRouteScreen() {
  return <Redirect href={CUSTOMER_ROUTES.wallet as Href} />;
}

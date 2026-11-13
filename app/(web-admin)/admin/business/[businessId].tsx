import { useLocalSearchParams } from 'expo-router';

import { AdminBusinessDetail } from '@/components/admin-web/AdminBusinessDetail';
import type { Id } from '@/convex/_generated/dataModel';

export default function AdminBusinessDetailScreen() {
  const { businessId } = useLocalSearchParams<{ businessId?: string }>();
  if (!businessId) {
    return null;
  }
  return <AdminBusinessDetail businessId={businessId as Id<'businesses'>} />;
}

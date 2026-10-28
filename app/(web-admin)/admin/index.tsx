import { useLocalSearchParams } from 'expo-router';
import { AdminWebDashboard } from '@/components/admin-web/AdminWebDashboard';
import { SystemTeamAdmin } from '@/components/admin-web/SystemTeamAdmin.web';

export default function AdminWebIndex() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (view === 'team') return <SystemTeamAdmin />;
  return <AdminWebDashboard />;
}

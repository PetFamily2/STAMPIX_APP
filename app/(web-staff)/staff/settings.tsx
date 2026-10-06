import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
import StaffSettingsScreen from '@/screens/StaffSettingsScreen';
export default function StaffWebSettings() {
  return (
    <WebManagementSurface>
      <StaffSettingsScreen />
    </WebManagementSurface>
  );
}

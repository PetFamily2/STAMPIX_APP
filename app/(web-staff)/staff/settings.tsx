import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
import { StaffWebFrame } from '@/components/pwa-ui/StaffWebFrame';
import StaffSettingsScreen from '@/screens/StaffSettingsScreen';
export default function StaffWebSettings() {
  return (
    <StaffWebFrame>
      <WebManagementSurface>
        <StaffSettingsScreen />
      </WebManagementSurface>
    </StaffWebFrame>
  );
}

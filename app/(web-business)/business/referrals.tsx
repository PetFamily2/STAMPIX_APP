import Editor from '@/app/(authenticated)/(business)/settings-business-referrals';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function Referrals() {
  return (
    <WebManagementSurface>
      <Editor />
    </WebManagementSurface>
  );
}

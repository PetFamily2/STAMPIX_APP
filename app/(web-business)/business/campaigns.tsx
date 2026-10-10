import { CampaignsHubContent } from '@/app/(authenticated)/(business)/cards/campaigns';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function Campaigns() {
  return (
    <WebManagementSurface>
      <CampaignsHubContent />
    </WebManagementSurface>
  );
}

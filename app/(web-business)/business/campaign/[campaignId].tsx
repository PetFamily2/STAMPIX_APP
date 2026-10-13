import Editor from '@/app/(authenticated)/(business)/cards/campaign/[campaignId]';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function CampaignEditor() {
  return (
    <WebManagementSurface>
      <Editor />
    </WebManagementSurface>
  );
}

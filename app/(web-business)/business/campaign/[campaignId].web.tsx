import { useLocalSearchParams } from 'expo-router';
import Editor from '@/app/(authenticated)/(business)/cards/campaign/[campaignId]';
import { CampaignDraftWizard } from '@/components/business-web/CampaignDraftWizard.web';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
import { WebWinbackCampaignSetup } from '@/components/business-web/WebWinbackCampaignSetup.web';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function WebCampaignEditor() {
  const { campaignId, template, businessId } = useLocalSearchParams<{
    campaignId?: string;
    template?: string;
    businessId?: string;
  }>();
  const { activeBusinessId } = useActiveBusiness();
  return (
    <WebManagementSurface>
      {campaignId === 'new' && template === 'winback' ? (
        <WebWinbackCampaignSetup
          key={String(activeBusinessId)}
          requestedBusinessId={businessId}
        />
      ) : campaignId === 'new' ? (
        <CampaignDraftWizard
          key={String(activeBusinessId)}
          requestedBusinessId={businessId}
        />
      ) : (
        <Editor />
      )}
    </WebManagementSurface>
  );
}

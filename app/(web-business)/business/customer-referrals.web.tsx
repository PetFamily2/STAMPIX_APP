import Editor from '@/components/business-web/BusinessReferralSettings.web';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
import { WEB_REFERRAL_DESTINATIONS } from '@/lib/navigation/referralSettingsDestinations';
export default function CustomerReferrals() {
  return (
    <WebManagementSurface>
      <Editor
        webPresentation={true}
        campaignsHref={WEB_REFERRAL_DESTINATIONS.campaigns}
        settingsHref={WEB_REFERRAL_DESTINATIONS.settings}
      />
    </WebManagementSurface>
  );
}

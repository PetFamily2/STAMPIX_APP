import Editor from '@/app/(authenticated)/(business)/settings-business-referrals';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
import { WEB_REFERRAL_DESTINATIONS } from '@/lib/navigation/referralSettingsDestinations';
export default function Referrals() {
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

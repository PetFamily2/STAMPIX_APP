import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';
import { CUSTOMER_BACK_FALLBACKS } from '@/lib/navigation/customerRoutes';

export default function SettingsLegalScreen() {
  return (
    <LegalDocumentScreen fallbackHref={CUSTOMER_BACK_FALLBACKS.settingsLegal} />
  );
}

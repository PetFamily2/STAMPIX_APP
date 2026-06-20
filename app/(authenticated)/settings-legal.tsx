import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';

export default function SettingsLegalScreen() {
  return (
    <LegalDocumentScreen fallbackHref="/(authenticated)/(customer)/settings" />
  );
}

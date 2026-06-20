import { LegalDocumentScreen } from '@/components/legal/LegalDocumentScreen';

export default function PaywallLegalScreen() {
  return <LegalDocumentScreen fallbackHref="/(auth)/paywall" />;
}

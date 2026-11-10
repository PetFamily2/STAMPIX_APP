import { StaffWebFrame } from '@/components/pwa-ui/StaffWebFrame';
import BusinessScannerPreview from '../../(web-business)/business/scanner-preview.web';

export default function StaffScannerPreview() {
  return (
    <StaffWebFrame>
      <BusinessScannerPreview />
    </StaffWebFrame>
  );
}

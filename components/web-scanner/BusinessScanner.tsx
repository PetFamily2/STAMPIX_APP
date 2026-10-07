import { NativeCompanionRedirect } from '../navigation/NativeCompanionRedirect';

/** Native bundlers may inventory .web route modules; never pull their command adapter. */
export default function NativeScannerPreviewFallback(_props: {
  actorId: string;
  businessId: string;
  programId: string;
  token: string;
  url: string;
  enabled: boolean;
  canStartScan?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  return <NativeCompanionRedirect />;
}

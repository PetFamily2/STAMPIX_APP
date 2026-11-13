import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';

/** Route discovery requires the same companion fallback as other Web-only routes. */
export default function CustomerReferralsFallback() {
  return <NativeCompanionRedirect />;
}

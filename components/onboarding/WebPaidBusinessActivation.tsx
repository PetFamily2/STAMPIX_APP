import type { ReactNode } from 'react';
import type { Id } from '@/convex/_generated/dataModel';

export type WebPaidBusinessActivationProps = {
  businessId: Id<'businesses'> | null;
  businessName: string;
  onBeforeCheckout: () => Promise<void>;
  children: ReactNode;
};

// Native is frozen. Metro selects the separate Web implementation for launch.
export function WebPaidBusinessActivation({
  children,
}: WebPaidBusinessActivationProps) {
  return <>{children}</>;
}

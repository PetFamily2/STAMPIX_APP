import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';

export default function WebProductFrame({ children }: PropsWithChildren) {
  const path = usePathname();
  const workspace = /^\/(business|admin|staff)(\/|$)/.test(path);
  const onboarding =
    /^\/(welcome|sign-|name-capture|oauth-callback|onboarding-|legal|paywall|merchant\/onboarding|preview-qa)/.test(
      path
    );
  return (
    <div
      id="stampaix-product-frame"
      dir="ltr"
      data-layout={
        workspace ? 'workspace' : onboarding ? 'onboarding' : 'customer'
      }
    >
      {children}
    </div>
  );
}

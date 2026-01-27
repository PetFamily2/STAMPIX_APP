import { router } from 'expo-router';

export const safeBack = (fallback?: string) => {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // No navigation context; fall through to fallback or no-op.
  }

  if (!fallback) return;

  try {
    router.replace(fallback);
  } catch {
    // No navigation context; ignore to avoid crash.
  }
};

export const safePush = (href: string) => {
  try {
    router.push(href);
  } catch {
    // No navigation context; ignore to avoid crash.
  }
};

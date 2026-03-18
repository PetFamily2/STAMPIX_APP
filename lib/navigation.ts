import { type Href, router } from 'expo-router';

export const safeBack = (fallback?: string) => {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // No navigation context; fall through to fallback or no-op.
  }

  if (!fallback) {
    return;
  }

  try {
    router.navigate(fallback as Href);
  } catch {
    // No navigation context; ignore to avoid crash.
  }
};

export const safeDismissTo = (href: string) => {
  try {
    router.dismissTo(href as Href);
    return;
  } catch {
    // Fall through to a deterministic replace when dismissTo is unavailable.
  }

  try {
    router.replace(href as Href);
  } catch {
    // No navigation context; ignore to avoid crash.
  }
};

export const safePush = (href: string) => {
  try {
    router.push(href as Href);
  } catch {
    // No navigation context; ignore to avoid crash.
  }
};

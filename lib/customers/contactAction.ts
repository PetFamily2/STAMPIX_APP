export type CustomerContactAction = {
  kind: 'phone' | 'email';
  href: string;
};

function resolvePhoneHref(phone: string | null | undefined) {
  const trimmed = phone?.trim() ?? '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  const prefix = trimmed.startsWith('+') ? '+' : '';
  return `tel:${prefix}${digits}`;
}

function resolveEmailHref(email: string | null | undefined) {
  const trimmed = email?.trim() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return `mailto:${encodeURIComponent(trimmed)}`;
}

/**
 * NEEDS_WINBACK is a server-provided customer state. This helper intentionally
 * does not infer risk locally and only exposes the recommendation when a real,
 * safe contact action can be created from existing customer data.
 */
export function resolveCustomerContactRecommendation({
  customerState,
  phone,
  email,
}: {
  customerState: string | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
}): CustomerContactAction | null {
  if (customerState !== 'NEEDS_WINBACK') {
    return null;
  }

  const phoneHref = resolvePhoneHref(phone);
  if (phoneHref) {
    return { kind: 'phone', href: phoneHref };
  }

  const emailHref = resolveEmailHref(email);
  return emailHref ? { kind: 'email', href: emailHref } : null;
}

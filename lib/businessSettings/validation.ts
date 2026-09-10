import {
  BUSINESS_NAME_MAX_LENGTH,
  BUSINESS_PHONE_MAX_LENGTH,
  normalizeText,
  SERVICE_TAG_LIMIT,
  SERVICE_TAG_MAX_LENGTH,
  SERVICE_TAG_MIN_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/businessSettings/profileFields';

const PHONE_PATTERN = /^[0-9+()\-\s]+$/;

export function validateBusinessName(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'שם העסק הוא שדה חובה.';
  }
  if (normalized.length > BUSINESS_NAME_MAX_LENGTH) {
    return `שם העסק יכול להכיל עד ${BUSINESS_NAME_MAX_LENGTH} תווים.`;
  }
  return null;
}

export function validateShortDescription(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'יש להזין תיאור קצר לעסק.';
  }
  if (normalized.length > SHORT_DESCRIPTION_MAX_LENGTH) {
    return `התיאור יכול להכיל עד ${SHORT_DESCRIPTION_MAX_LENGTH} תווים.`;
  }
  return null;
}

export function validateBusinessPhone(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'יש להזין טלפון עסקי.';
  }
  if (normalized.length > BUSINESS_PHONE_MAX_LENGTH) {
    return `מספר הטלפון יכול להכיל עד ${BUSINESS_PHONE_MAX_LENGTH} תווים.`;
  }
  if (!PHONE_PATTERN.test(normalized)) {
    return 'מספר הטלפון יכול לכלול ספרות, רווחים, +, מקפים וסוגריים.';
  }
  return null;
}

export function validateServiceTagDraft(value: string, existingTags: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'יש להזין תגית.';
  }
  if (normalized.length < SERVICE_TAG_MIN_LENGTH) {
    return 'תגית חייבת להכיל לפחות 2 תווים.';
  }
  if (normalized.length > SERVICE_TAG_MAX_LENGTH) {
    return 'תגית יכולה להכיל עד 24 תווים.';
  }
  if (existingTags.length >= SERVICE_TAG_LIMIT) {
    return 'ניתן להוסיף עד 8 תגיות.';
  }
  if (
    existingTags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())
  ) {
    return null;
  }
  return null;
}

export function canAddServiceTag(value: string, existingTags: string[]) {
  const normalized = normalizeText(value);
  if (
    !normalized ||
    normalized.length < SERVICE_TAG_MIN_LENGTH ||
    normalized.length > SERVICE_TAG_MAX_LENGTH ||
    existingTags.length >= SERVICE_TAG_LIMIT
  ) {
    return false;
  }
  return !existingTags.some(
    (tag) => tag.toLowerCase() === normalized.toLowerCase()
  );
}

export const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildProgramStructureSignature(input: {
  rewardName: string;
  maxStamps: number;
  cardTerms: string;
  rewardConditions: string;
}) {
  const payload = `${normalizeText(input.rewardName)}|${Math.floor(input.maxStamps)}|${normalizeText(input.cardTerms)}|${normalizeText(input.rewardConditions)}`;
  return hashString(payload);
}

export function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

export function slugify(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function monthKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

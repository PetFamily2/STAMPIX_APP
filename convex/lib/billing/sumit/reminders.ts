import { DIRECT_PROVIDER_RENEWAL_GRACE_MS } from '../productionContract';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingReminderStageDay = 0 | 3 | 6;

export function billingReminderDedupeKey(args: {
  businessId: string;
  gracePeriodEndAt: number;
  stageDay: BillingReminderStageDay;
}) {
  return [
    'sumit_payment_failure',
    args.businessId,
    String(args.gracePeriodEndAt),
    `d${args.stageDay}`,
  ].join(':');
}

export function resolveBillingReminderStage(args: {
  gracePeriodEndAt: number;
  now: number;
  sentStages?: BillingReminderStageDay[];
}): BillingReminderStageDay | null {
  const graceStartAt =
    args.gracePeriodEndAt - DIRECT_PROVIDER_RENEWAL_GRACE_MS;

  if (args.now < graceStartAt || args.now >= args.gracePeriodEndAt) {
    return null;
  }

  const elapsedDays = Math.floor((args.now - graceStartAt) / DAY_MS);
  const stage: BillingReminderStageDay =
    elapsedDays >= 6 ? 6 : elapsedDays >= 3 ? 3 : 0;

  return args.sentStages?.includes(stage) ? null : stage;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatHebrewDate(timestamp: number) {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function buildBillingReminderEmail(args: {
  businessName: string;
  stageDay: BillingReminderStageDay;
  gracePeriodEndAt: number;
}) {
  const businessName = escapeHtml(args.businessName.trim() || 'העסק');
  const graceEnd = formatHebrewDate(args.gracePeriodEndAt);
  const heading =
    args.stageDay === 6
      ? 'נדרש טיפול בתשלום כדי לשמור על רציפות השירות'
      : 'נדרש טיפול בתשלום המנוי';
  const timing =
    args.stageDay === 0
      ? 'זוהה כשל בחידוש התשלום.'
      : args.stageDay === 3
        ? 'התשלום עדיין דורש טיפול.'
        : 'תקופת החסד מתקרבת לסיומה.';

  return {
    subject:
      args.stageDay === 6
        ? 'StampAix — נדרש טיפול בתשלום המנוי'
        : 'StampAix — עדכון לגבי תשלום המנוי',
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#101936;line-height:1.7">
<h2 style="margin:0 0 12px">${heading}</h2>
<p style="margin:0 0 10px">שלום,</p>
<p style="margin:0 0 10px">${timing}</p>
<p style="margin:0 0 10px">העסק: <strong>${businessName}</strong></p>
<p style="margin:0 0 10px">הגישה נשארת פעילה בתקופת החסד, עד ${graceEnd}, כל עוד הסטטוס לא השתנה.</p>
<p style="margin:0">אפשר להיכנס לסביבת העסק ולפתוח את אזור "חיוב וחשבוניות" כדי לבדוק את מצב התשלום.</p>
</div>`,
  };
}

export const BILLING_REMINDER_RETRY_MS = 60 * 60 * 1000;
export const BILLING_REMINDER_MAX_ATTEMPTS = 3;

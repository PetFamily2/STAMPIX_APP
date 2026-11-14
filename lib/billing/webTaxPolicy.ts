/** Owner-approved launch policy, 2026-10-28. Never infer tax changes from time. */
export const WEB_TAX_POLICY = {
  operatorStatus: 'exempt',
  vatRate: 0,
  addVatToPublishedPrice: false,
  priceNotice: 'המחירים סופיים. לא מתווסף מע״מ — מפעיל השירות הוא עוסק פטור.',
  documentNotice: 'לאחר תשלום יופק מסמך התשלום המתאים באמצעות SUMIT.',
} as const;

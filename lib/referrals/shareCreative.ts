import { REFERRAL_COPY, formatReferralCopy } from '@/lib/referrals/copy';
import { buildCanonicalReferralUrl } from '@/lib/billing/productionContract';

export const SHARE_CREATIVE_GENERAL = { width: 1080, height: 1350 };
export const SHARE_CREATIVE_STORY = { width: 1080, height: 1920 };

export type ReferralShareCreativeInput = {
  businessPublicName: string;
  code: string;
  variant: 'general' | 'story';
};

export function buildReferralShareCreative(input: ReferralShareCreativeInput) {
  const size =
    input.variant === 'story' ? SHARE_CREATIVE_STORY : SHARE_CREATIVE_GENERAL;
  return {
    width: size.width,
    height: size.height,
    brand: 'StampAix',
    businessPublicName: input.businessPublicName,
    headline: formatReferralCopy(REFERRAL_COPY.joinViaBusiness, {
      businessName: input.businessPublicName,
    }),
    benefit: REFERRAL_COPY.shareBenefit,
    cta: REFERRAL_COPY.inviteCta,
    url: buildCanonicalReferralUrl(input.code),
    shareText: `${REFERRAL_COPY.shareMessage}\n${buildCanonicalReferralUrl(input.code)}`,
  };
}

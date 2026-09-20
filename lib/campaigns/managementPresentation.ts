export type CampaignManagementType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo'
  | 'referral';

export type CampaignManagementVisualMeta = {
  label: string;
  icon:
    | 'hand-left-outline'
    | 'gift-outline'
    | 'heart-outline'
    | 'refresh-outline'
    | 'megaphone-outline'
    | 'people-outline';
  iconColor: string;
  iconBackground: string;
};

const TYPE_META: Record<CampaignManagementType, CampaignManagementVisualMeta> =
  {
    welcome: {
      label: 'ברוכים הבאים',
      icon: 'hand-left-outline',
      iconColor: '#1D4ED8',
      iconBackground: '#DBEAFE',
    },
    birthday: {
      label: 'יום הולדת',
      icon: 'gift-outline',
      iconColor: '#C2410C',
      iconBackground: '#FFEDD5',
    },
    anniversary: {
      label: 'יום נישואין',
      icon: 'heart-outline',
      iconColor: '#9D174D',
      iconBackground: '#FCE7F3',
    },
    winback: {
      label: 'השבת לקוחות',
      icon: 'refresh-outline',
      iconColor: '#0F766E',
      iconBackground: '#CCFBF1',
    },
    promo: {
      label: 'קמפיין כללי',
      icon: 'megaphone-outline',
      iconColor: '#4C1D95',
      iconBackground: '#EDE9FE',
    },
    referral: {
      label: 'חבר מביא חבר',
      icon: 'people-outline',
      iconColor: '#1D4ED8',
      iconBackground: '#DBEAFE',
    },
  };

export const DEFAULT_CAMPAIGN_MANAGEMENT_VISUAL_META = TYPE_META.promo;

export function resolveCampaignManagementVisualMeta(
  type: unknown
): CampaignManagementVisualMeta {
  if (typeof type !== 'string') {
    return DEFAULT_CAMPAIGN_MANAGEMENT_VISUAL_META;
  }

  const normalizedType = type.trim().toLowerCase();
  if (Object.hasOwn(TYPE_META, normalizedType)) {
    return TYPE_META[normalizedType as CampaignManagementType];
  }

  return DEFAULT_CAMPAIGN_MANAGEMENT_VISUAL_META;
}

import type { RecommendationAction } from './navigation';

const VISUAL_CTA_LABELS: Record<RecommendationAction['type'], string> = {
  open_business_address: 'השלמה',
  open_business_profile: 'השלמה',
  open_programs: 'יצירה',
  open_program: 'עריכה',
  open_campaigns: 'יצירה',
  open_campaign: 'פתיחה',
  open_customers_segment: 'צפייה',
  open_team_pending: 'צפייה',
  open_subscription: 'בדיקה',
};

export function getRecommendationVisualCtaLabel(
  action: Pick<RecommendationAction, 'type'>
) {
  return VISUAL_CTA_LABELS[action.type];
}

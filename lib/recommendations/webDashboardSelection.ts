export const RULE_RECOMMENDATION_LABEL = 'לפי נתוני העסק';
export const AI_RECOMMENDATION_LABEL = 'נוצר';
export const SAVED_RECOMMENDATION_LABEL = 'נוסח שמור';
export const EMPTY_RECOMMENDATION_LABEL = 'אין צעד דחוף כרגע';

export type WebRuleRecommendationInput = {
  priority: number;
};

export type WebStoredRecommendationInput = {
  source: string;
  actionable: boolean;
};

export type WebDashboardRecommendationChoice =
  | { kind: 'rule'; label: typeof RULE_RECOMMENDATION_LABEL }
  | { kind: 'stored-ai'; label: typeof AI_RECOMMENDATION_LABEL }
  | { kind: 'stored-saved'; label: typeof SAVED_RECOMMENDATION_LABEL }
  | { kind: 'empty'; label: typeof EMPTY_RECOMMENDATION_LABEL };

export function isUrgentRuleRecommendation(
  recommendation: WebRuleRecommendationInput | null
) {
  return (
    recommendation != null &&
    (recommendation.priority === 0 || recommendation.priority === 1)
  );
}

export function selectWebDashboardRecommendation(input: {
  rulePrimary: WebRuleRecommendationInput | null;
  stored: WebStoredRecommendationInput | null;
}): WebDashboardRecommendationChoice {
  if (isUrgentRuleRecommendation(input.rulePrimary)) {
    return { kind: 'rule', label: RULE_RECOMMENDATION_LABEL };
  }
  if (input.stored?.actionable && input.stored.source === 'ai') {
    return { kind: 'stored-ai', label: AI_RECOMMENDATION_LABEL };
  }
  if (input.rulePrimary) {
    return { kind: 'rule', label: RULE_RECOMMENDATION_LABEL };
  }
  if (
    input.stored?.actionable &&
    (input.stored.source === 'fixed' || input.stored.source === 'cache')
  ) {
    return { kind: 'stored-saved', label: SAVED_RECOMMENDATION_LABEL };
  }
  return { kind: 'empty', label: EMPTY_RECOMMENDATION_LABEL };
}

export function claimRecommendationAction(inFlight: Set<string>, key: string) {
  if (inFlight.has(key)) {
    return false;
  }
  inFlight.add(key);
  return true;
}

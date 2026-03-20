export type RequiredPlan = 'starter' | 'pro' | 'premium' | null | undefined;

export type LockedAreaKey =
  | 'team'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'advancedReports'
  | 'segmentationBuilder'
  | 'savedSegments'
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth'
  | 'business_subscription'
  | 'onboarding_plan_selection'
  | 'generic';

type LockedAreaDefinition = {
  sectionTitle: string;
  lockedTitle: string;
  lockedSubtitle: (requiredPlanLabel: string | null) => string;
  benefits: string[];
  upgradeAreaLabel: string;
};

const PLAN_LABELS: Record<'starter' | 'pro' | 'premium', string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  premium: 'Premium AI',
};

const FEATURE_KEY_ALIAS_MAP: Record<string, LockedAreaKey> = {
  team: 'team',
  canManageTeam: 'team',
  marketingHub: 'marketingHub',
  canUseMarketingHubAI: 'marketingHub',
  smartAnalytics: 'smartAnalytics',
  canUseSmartAnalytics: 'smartAnalytics',
  advancedReports: 'advancedReports',
  canSeeAdvancedReports: 'advancedReports',
  segmentationBuilder: 'segmentationBuilder',
  canUseAdvancedSegmentation: 'segmentationBuilder',
  savedSegments: 'savedSegments',
  maxCards: 'maxCards',
  maxCustomers: 'maxCustomers',
  maxActiveRetentionActions: 'maxActiveRetentionActions',
  maxCampaigns: 'maxCampaigns',
  maxAiExecutionsPerMonth: 'maxAiExecutionsPerMonth',
  business_subscription: 'business_subscription',
  onboarding_plan_selection: 'onboarding_plan_selection',
};

const LOCKED_AREA_COPY: Record<LockedAreaKey, LockedAreaDefinition> = {
  team: {
    sectionTitle: '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e6\u05d5\u05d5\u05ea',
    lockedTitle:
      '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e6\u05d5\u05d5\u05ea \u05e0\u05e2\u05d5\u05dc \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9',
    lockedSubtitle: (requiredPlanLabel) =>
      `\u05d4\u05d6\u05de\u05e0\u05ea \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d4 \u05d1\u05de\u05e1\u05dc\u05d5\u05dc ${
        requiredPlanLabel ??
        '\u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8'
      }.`,
    benefits: [
      '\u05d4\u05d6\u05de\u05e0\u05ea \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd \u05d5\u05e0\u05d9\u05d4\u05d5\u05dc \u05d4\u05e8\u05e9\u05d0\u05d5\u05ea',
      '\u05e2\u05d1\u05d5\u05d3\u05d4 \u05de\u05e1\u05d5\u05d3\u05e8\u05ea \u05e2\u05dd \u05e6\u05d5\u05d5\u05ea',
    ],
    upgradeAreaLabel: '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e6\u05d5\u05d5\u05ea',
  },
  marketingHub: {
    sectionTitle: 'Campaign workspace',
    lockedTitle: 'Campaign workspace is locked on this plan',
    lockedSubtitle: (requiredPlanLabel) =>
      `Campaign activation is available on ${
        requiredPlanLabel ?? 'a higher plan'
      }.`,
    benefits: [
      'Identify campaign opportunities automatically',
      'Activate campaign drafts with explicit approval',
    ],
    upgradeAreaLabel: 'Campaign workspace',
  },
  smartAnalytics: {
    sectionTitle:
      '\u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
    lockedTitle:
      '\u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05e0\u05e2\u05d5\u05dc\u05d5\u05ea',
    lockedSubtitle: (requiredPlanLabel) =>
      `\u05e0\u05d9\u05ea\u05d5\u05d7 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05dd \u05d6\u05de\u05d9\u05df \u05d1\u05de\u05e1\u05dc\u05d5\u05dc ${
        requiredPlanLabel ??
        '\u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8'
      }.`,
    benefits: [
      '\u05d6\u05d9\u05d4\u05d5\u05d9 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d1\u05e1\u05d9\u05db\u05d5\u05df',
      '\u05e4\u05d9\u05dc\u05d5\u05d7 \u05d5\u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05dc\u05e6\u05de\u05d9\u05d7\u05d4',
    ],
    upgradeAreaLabel:
      '\u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  },
  advancedReports: {
    sectionTitle:
      '\u05d3\u05d5\u05d7\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d9\u05dd',
    lockedTitle:
      '\u05d3\u05d5\u05d7\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d9\u05dd \u05e0\u05e2\u05d5\u05dc\u05d9\u05dd',
    lockedSubtitle: (requiredPlanLabel) =>
      `\u05d3\u05d5\u05d7\u05d5\u05ea \u05e2\u05d5\u05de\u05e7 \u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05d1\u05de\u05e1\u05dc\u05d5\u05dc ${
        requiredPlanLabel ??
        '\u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8'
      }.`,
    benefits: [
      '\u05de\u05d2\u05de\u05d5\u05ea \u05d1\u05d9\u05e6\u05d5\u05e2\u05d9\u05dd',
      '\u05d4\u05e9\u05d5\u05d5\u05d0\u05ea \u05ea\u05e7\u05d5\u05e4\u05d5\u05ea',
    ],
    upgradeAreaLabel:
      '\u05d3\u05d5\u05d7\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d9\u05dd',
  },
  segmentationBuilder: {
    sectionTitle: '\u05d1\u05d5\u05e0\u05d4 \u05e7\u05d4\u05dc\u05d9\u05dd',
    lockedTitle:
      '\u05d1\u05d5\u05e0\u05d4 \u05e7\u05d4\u05dc\u05d9\u05dd \u05d6\u05de\u05d9\u05df \u05d1\u05de\u05e1\u05dc\u05d5\u05dc Premium AI',
    lockedSubtitle: () =>
      '\u05e4\u05d9\u05dc\u05d5\u05d7 \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d4\u05de\u05ea\u05e7\u05d3\u05dd \u05d6\u05de\u05d9\u05df \u05d1-Premium AI.',
    benefits: [
      '\u05d4\u05d2\u05d3\u05e8\u05ea \u05e7\u05d4\u05dc\u05d9\u05dd \u05de\u05de\u05d5\u05e7\u05d3\u05d9\u05dd',
      '\u05e9\u05de\u05d9\u05e8\u05ea \u05e7\u05d4\u05dc\u05d9\u05dd \u05dc\u05e9\u05d9\u05de\u05d5\u05e9 \u05d7\u05d5\u05d6\u05e8',
    ],
    upgradeAreaLabel: '\u05d1\u05d5\u05e0\u05d4 \u05e7\u05d4\u05dc\u05d9\u05dd',
  },
  savedSegments: {
    sectionTitle:
      '\u05e7\u05d4\u05dc\u05d9\u05dd \u05e9\u05de\u05d5\u05e8\u05d9\u05dd',
    lockedTitle:
      '\u05e7\u05d4\u05dc\u05d9\u05dd \u05e9\u05de\u05d5\u05e8\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05d1-Premium AI',
    lockedSubtitle: () =>
      '\u05e9\u05de\u05d9\u05e8\u05ea \u05e7\u05d4\u05dc\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d4 \u05d1\u05de\u05e1\u05dc\u05d5\u05dc Premium AI.',
    benefits: [
      '\u05e9\u05d9\u05de\u05d5\u05e9 \u05d7\u05d5\u05d6\u05e8 \u05d1\u05e7\u05d4\u05dc\u05d9\u05dd',
      '\u05d7\u05d9\u05d1\u05d5\u05e8 \u05de\u05d4\u05d9\u05e8 \u05dc\u05de\u05d4\u05dc\u05db\u05d9 \u05e9\u05d9\u05de\u05d5\u05e8',
    ],
    upgradeAreaLabel:
      '\u05e7\u05d4\u05dc\u05d9\u05dd \u05e9\u05de\u05d5\u05e8\u05d9\u05dd',
  },
  maxCards: {
    sectionTitle:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd',
    lockedTitle:
      '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05d2\u05d1\u05dc\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9 \u05d4\u05e0\u05d0\u05de\u05e0\u05d5\u05ea',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc ${requiredPlanLabel} \u05d9\u05d0\u05e4\u05e9\u05e8 \u05e4\u05ea\u05d9\u05d7\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd.`
        : '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8 \u05d9\u05d0\u05e4\u05e9\u05e8 \u05e4\u05ea\u05d9\u05d7\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd.',
    benefits: [
      '\u05db\u05de\u05d4 \u05ea\u05d5\u05db\u05e0\u05d9\u05d5\u05ea \u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d1\u05de\u05e7\u05d1\u05d9\u05dc',
      '\u05e6\u05de\u05d9\u05d7\u05d4 \u05d1\u05dc\u05d9 \u05dc\u05e2\u05e6\u05d5\u05e8',
    ],
    upgradeAreaLabel:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd',
  },
  maxCustomers: {
    sectionTitle:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
    lockedTitle:
      '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05d2\u05d1\u05dc\u05ea \u05de\u05e1\u05e4\u05e8 \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc ${requiredPlanLabel} \u05d9\u05d0\u05e4\u05e9\u05e8 \u05e6\u05d9\u05e8\u05d5\u05e3 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd.`
        : '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8 \u05d9\u05d0\u05e4\u05e9\u05e8 \u05e6\u05d9\u05e8\u05d5\u05e3 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd.',
    benefits: [
      '\u05d4\u05e8\u05d7\u05d1\u05ea \u05d1\u05e1\u05d9\u05e1 \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
      '\u05de\u05e0\u05d9\u05e2\u05ea \u05d7\u05e1\u05d9\u05de\u05d4 \u05d1\u05d2\u05d9\u05d5\u05e1 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
    ],
    upgradeAreaLabel:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  },
  maxActiveRetentionActions: {
    sectionTitle: 'Recurring campaigns limit',
    lockedTitle: 'You reached the recurring campaigns limit',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `Upgrade to ${requiredPlanLabel} to activate more recurring campaigns.`
        : 'Upgrade to a higher plan to activate more recurring campaigns.',
    benefits: [
      'Run multiple recurring campaigns in parallel',
      'Control campaign volume without losing coverage',
    ],
    upgradeAreaLabel: 'Recurring campaigns limit',
  },
  maxCampaigns: {
    sectionTitle:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd',
    lockedTitle:
      '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05d2\u05d1\u05dc\u05ea \u05de\u05e1\u05e4\u05e8 \u05d4\u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd \u05d4\u05e4\u05e2\u05d9\u05dc\u05d9\u05dd',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc ${requiredPlanLabel} \u05d9\u05d0\u05e4\u05e9\u05e8 \u05dc\u05e4\u05ea\u05d5\u05d7 \u05e7\u05de\u05e4\u05d9\u05d9\u05df \u05e0\u05d5\u05e1\u05e3.`
        : '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8 \u05d9\u05d0\u05e4\u05e9\u05e8 \u05dc\u05e4\u05ea\u05d5\u05d7 \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd.',
    benefits: [
      '\u05db\u05de\u05d5\u05ea \u05d2\u05d3\u05d5\u05dc\u05d4 \u05d9\u05d5\u05ea\u05e8 \u05e9\u05dc \u05de\u05d4\u05dc\u05db\u05d9 \u05e7\u05de\u05e4\u05d9\u05d9\u05df',
      '\u05d2\u05de\u05d9\u05e9\u05d5\u05ea \u05d1\u05d0\u05d5\u05d8\u05d5\u05de\u05e6\u05d9\u05d4 \u05d5\u05de\u05d1\u05e6\u05e2\u05d9\u05dd',
    ],
    upgradeAreaLabel:
      '\u05de\u05d2\u05d1\u05dc\u05ea \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd',
  },
  maxAiExecutionsPerMonth: {
    sectionTitle:
      '\u05de\u05d2\u05d1\u05dc\u05ea AI \u05d7\u05d5\u05d3\u05e9\u05d9\u05ea',
    lockedTitle:
      '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05e9\u05d9\u05de\u05d5\u05e9\u05d9 AI \u05dc\u05d7\u05d5\u05d3\u05e9 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc ${requiredPlanLabel} \u05d9\u05d0\u05e4\u05e9\u05e8 \u05de\u05db\u05e1\u05ea AI \u05d2\u05d1\u05d5\u05d4\u05d4 \u05d9\u05d5\u05ea\u05e8.`
        : '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8 \u05d9\u05d0\u05e4\u05e9\u05e8 \u05d9\u05d5\u05ea\u05e8 \u05e9\u05d9\u05de\u05d5\u05e9\u05d9 AI.',
    benefits: [
      '\u05d9\u05d5\u05ea\u05e8 \u05d4\u05de\u05dc\u05e6\u05d5\u05ea AI \u05dc\u05d0\u05d5\u05e8\u05da \u05d4\u05d7\u05d5\u05d3\u05e9',
      '\u05d6\u05de\u05d9\u05e0\u05d5\u05ea \u05d2\u05d1\u05d5\u05d4\u05d4 \u05d9\u05d5\u05ea\u05e8 \u05dc\u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05d7\u05db\u05de\u05d5\u05ea',
    ],
    upgradeAreaLabel:
      '\u05de\u05d2\u05d1\u05dc\u05ea AI \u05d7\u05d5\u05d3\u05e9\u05d9\u05ea',
  },
  business_subscription: {
    sectionTitle: '\u05de\u05e0\u05d5\u05d9 \u05d5\u05d7\u05d9\u05d5\u05d1',
    lockedTitle:
      '\u05d0\u05e4\u05e9\u05e8\u05d5\u05d9\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d6\u05de\u05d9\u05e0\u05d5\u05ea \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d2\u05d1\u05d5\u05d4 \u05d9\u05d5\u05ea\u05e8',
    lockedSubtitle: () =>
      '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05de\u05e1\u05dc\u05d5\u05dc \u05d9\u05e4\u05ea\u05d7 \u05de\u05d2\u05d1\u05dc\u05d5\u05ea \u05d5\u05d9\u05db\u05d5\u05dc\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d5\u05ea.',
    benefits: [
      '\u05d4\u05e8\u05d7\u05d1\u05ea \u05de\u05d2\u05d1\u05dc\u05d5\u05ea',
      '\u05e2\u05d1\u05d5\u05e8 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05d0\u05d9\u05dd \u05dc\u05e6\u05de\u05d9\u05d7\u05d4',
    ],
    upgradeAreaLabel: '\u05de\u05e0\u05d5\u05d9 \u05d5\u05d7\u05d9\u05d5\u05d1',
  },
  onboarding_plan_selection: {
    sectionTitle:
      '\u05d1\u05d7\u05d9\u05e8\u05ea \u05de\u05e1\u05dc\u05d5\u05dc',
    lockedTitle:
      '\u05d1\u05d7\u05d9\u05e8\u05ea \u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05e9\u05e4\u05d9\u05e2\u05d4 \u05d9\u05e9\u05d9\u05e8\u05d5\u05ea \u05e2\u05dc \u05d4\u05d9\u05db\u05d5\u05dc\u05d5\u05ea',
    lockedSubtitle: () =>
      '\u05d0\u05e4\u05e9\u05e8 \u05dc\u05d4\u05ea\u05d7\u05d9\u05dc \u05d1-Starter \u05d5\u05dc\u05e9\u05d3\u05e8\u05d2 \u05d1\u05db\u05dc \u05e9\u05dc\u05d1.',
    benefits: [
      '\u05de\u05d2\u05d1\u05dc\u05d5\u05ea \u05d5\u05ea\u05db\u05d5\u05e0\u05d5\u05ea \u05d1\u05e8\u05d5\u05e8\u05d5\u05ea',
      '\u05de\u05e2\u05d1\u05e8 \u05e4\u05e9\u05d5\u05d8 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd',
    ],
    upgradeAreaLabel:
      '\u05d1\u05d7\u05d9\u05e8\u05ea \u05de\u05e1\u05dc\u05d5\u05dc',
  },
  generic: {
    sectionTitle:
      '\u05d9\u05db\u05d5\u05dc\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d5\u05ea',
    lockedTitle:
      '\u05d4\u05d0\u05d6\u05d5\u05e8 \u05d4\u05d6\u05d4 \u05d6\u05de\u05d9\u05df \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc ${requiredPlanLabel} \u05d9\u05e4\u05ea\u05d7 \u05d0\u05ea \u05d4\u05d9\u05db\u05d5\u05dc\u05ea \u05d4\u05d6\u05d5.`
        : '\u05e9\u05d3\u05e8\u05d5\u05d2 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8 \u05d9\u05e4\u05ea\u05d7 \u05d0\u05ea \u05d4\u05d9\u05db\u05d5\u05dc\u05ea \u05d4\u05d6\u05d5.',
    benefits: [
      '\u05d4\u05e8\u05d7\u05d1\u05ea \u05d9\u05db\u05d5\u05dc\u05d5\u05ea \u05de\u05d5\u05e6\u05e8',
      '\u05de\u05e2\u05d1\u05e8 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05d0\u05d9\u05dd \u05dc\u05e6\u05de\u05d9\u05d7\u05d4',
    ],
    upgradeAreaLabel:
      '\u05d9\u05db\u05d5\u05dc\u05d5\u05ea \u05de\u05ea\u05e7\u05d3\u05de\u05d5\u05ea',
  },
};

function resolveRequiredPlanLabel(requiredPlan: RequiredPlan): string | null {
  if (!requiredPlan || !PLAN_LABELS[requiredPlan]) {
    return null;
  }
  return PLAN_LABELS[requiredPlan];
}

function resolveLockedAreaKey(featureKey?: string | null): LockedAreaKey {
  if (!featureKey) {
    return 'generic';
  }
  const normalized = featureKey.trim();
  if (!normalized) {
    return 'generic';
  }
  return FEATURE_KEY_ALIAS_MAP[normalized] ?? 'generic';
}

export function getLockedAreaCopy(
  featureKey: string,
  requiredPlan?: RequiredPlan
) {
  const key = resolveLockedAreaKey(featureKey);
  const definition = LOCKED_AREA_COPY[key];
  const requiredPlanLabel = resolveRequiredPlanLabel(requiredPlan);
  return {
    ...definition,
    lockedSubtitle: definition.lockedSubtitle(requiredPlanLabel),
  };
}

export function getUpgradeAreaLabel(featureKey?: string | null) {
  const key = resolveLockedAreaKey(featureKey);
  return LOCKED_AREA_COPY[key].upgradeAreaLabel;
}

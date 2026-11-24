import { isCanonicalCardThemeId } from '@/constants/cardThemes';
import { isCanonicalStampIcon } from '@/constants/stampIcons';
import {
  MAX_STAMP_OPTIONS,
  normalizeStampShape,
  type StampShape,
} from '@/constants/stampOptions';

export type ClassicWizardInput = {
  title: string;
  rewardName: string;
  maxStamps: number;
  cardThemeId: string;
  stampIcon: string;
  stampShape: string;
};

export type ClassicWizardIssue = {
  field: 'title' | 'rewardName' | 'maxStamps' | 'cardThemeId';
  message: string;
};

const STAMP_COUNTS = new Set<number>(MAX_STAMP_OPTIONS);

export function classicWizardIssues(
  input: ClassicWizardInput
): ClassicWizardIssue[] {
  const issues: ClassicWizardIssue[] = [];
  if (input.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'צריך שם לכרטיסייה' });
  }
  if (input.rewardName.trim().length === 0) {
    issues.push({ field: 'rewardName', message: 'צריך שם להטבה' });
  }
  if (!STAMP_COUNTS.has(input.maxStamps)) {
    issues.push({
      field: 'maxStamps',
      message: 'צריך לבחור מספר חותמות מהרשימה',
    });
  }
  if (!isCanonicalCardThemeId(input.cardThemeId)) {
    issues.push({
      field: 'cardThemeId',
      message: 'צריך לבחור צבע מהרשימה',
    });
  }
  return issues;
}

export function classicWizardCanSave(input: ClassicWizardInput) {
  return (
    classicWizardIssues(input).length === 0 &&
    isCanonicalStampIcon(input.stampIcon) &&
    normalizeStampShape(input.stampShape) === (input.stampShape as StampShape)
  );
}

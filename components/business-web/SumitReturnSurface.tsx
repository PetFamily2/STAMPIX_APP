import {
  useRouter } from 'expo-router';
import {
  CheckCircle2,
  Clock3,
  ReceiptText,
  XCircle,
  } from 'lucide-react-native';
import { Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';
import { BUSINESS_WEB_ROUTES } from '@/lib/businessWebNavigation';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection } from '@/lib/rtl';

export type SumitReturnState =
  | 'verifying'
  | 'verified'
  | 'pending'
  | 'awaiting_verification'
  | 'reauthentication'
  | 'failed'
  | 'canceled';

const COPY: Record<SumitReturnState, { title: string; description: string }> = {
  verifying: {
    title: 'מאמתים את התשלום…',
    description:
      'השרת בודק את פרטי העסקה ישירות מול SUMIT. אין צורך לרענן את העמוד.',
  },
  verified: {
    title: 'התשלום אומת והמנוי פעיל.',
    description: 'אפשר לחזור לעמוד החיוב ולראות את פרטי התקופה המעודכנים.',
  },
  pending: {
    title: 'התשלום אומת, ועדכון המנוי עדיין בטיפול.',
    description:
      'לא נקבעה זכאות מההפניה בדפדפן. מצב המנוי יוצג לאחר השלמת העדכון בשרת.',
  },
  awaiting_verification: {
    title: 'התשלום ממתין לאימות.',
    description:
      'לא התקבלו מזהי העסקה הדרושים לאימות מיידי. לא שינינו את מצב המנוי; השרת והסנכרון מול SUMIT נשארים מקור הסמכות.',
  },
  reauthentication: {
    title: 'נדרשת התחברות מחדש כדי לאמת את התשלום.',
    description:
      'לא בוצע שינוי במנוי. התחברו שוב, ולאחר מכן חזרו לעמוד הזה כדי להמשיך באימות המאובטח.',
  },
  failed: {
    title: 'לא הצלחנו לאמת את התשלום כרגע.',
    description:
      'לא שינינו את מצב המנוי. אפשר לחזור לעמוד החיוב ולנסות שוב או לבדוק מאוחר יותר.',
  },
  canceled: {
    title: 'התשלום לא הושלם',
    description:
      'יצאתם מתהליך התשלום לפני השלמתו. מנוי קיים, אם ישנו, לא השתנה.',
  },
};

export function SumitReturnSurface({ state }: { state: SumitReturnState }) {
  const router = useRouter();
  const copy = COPY[state];
  const Icon =
    state === 'verified'
      ? CheckCircle2
      : state === 'failed' || state === 'canceled'
        ? XCircle
        : Clock3;
  const iconColor =
    state === 'verified'
      ? TOKENS.colors.success
      : state === 'failed'
        ? TOKENS.colors.danger
        : state === 'canceled'
          ? TOKENS.colors.warning
          : TOKENS.colors.primary;

  return (
    <View style={styles.page}>
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>S</Text>
        </View>
        <View>
          <Text style={styles.brandName}>StampAix</Text>
          <Text style={styles.brandProduct}>Business</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}12` }]}>
          <Icon color={iconColor} size={34} />
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.title}>
          {copy.title}
        </Text>
        <Text style={styles.description}>{copy.description}</Text>
        {state !== 'verifying' ? (
          <Pressable
            accessibilityLabel="חזרה לחיוב וחשבוניות"
            accessibilityRole="link"
            onPress={() =>
              state === 'reauthentication'
                ? router.push(resolveBusinessSignedOutHref('web'))
                : router.replace(BUSINESS_WEB_ROUTES.billing)
            }
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.pressed : null,
            ]}
          >
            <ReceiptText color="#FFFFFF" size={18} />
            <Text style={styles.buttonText}>
              {state === 'reauthentication'
                ? 'מעבר להתחברות'
                : 'חזרה לחיוב וחשבוניות'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.pageBackground,
    flex: 1,
    gap: TOKENS.space.xl,
    justifyContent: 'center',
    minHeight: '100%',
    padding: TOKENS.space.xl,
  },
  brand: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  brandName: {
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  brandProduct: {
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    ...TOKENS.shadow,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    gap: TOKENS.space.lg,
    maxWidth: 560,
    padding: TOKENS.space.xxxl,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.pill,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  title: {
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  description: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    maxWidth: 450,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  button: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    marginTop: TOKENS.space.sm,
    minHeight: 48,
    paddingHorizontal: TOKENS.space.xl,
  },
  buttonText: { ...TOKENS.typography.label, color: '#FFFFFF' },
  pressed: { opacity: 0.82 },
});

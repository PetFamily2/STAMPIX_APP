import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { alignItems, flexDirection, rtlBaseView, tw } from '@/lib/rtl';

type StatusTone = 'danger' | 'warning' | 'neutral' | 'success';

const SUBSCRIPTION_STATUS_COPY: Partial<
  Record<
    string,
    {
      title: string;
      subtitle: string;
      tone: StatusTone;
      icon: keyof typeof Ionicons.glyphMap;
    }
  >
> = {
  expired: {
    title: 'המנוי הסתיים',
    subtitle: 'נדרש חידוש או עדכון חבילה כדי להמשיך לעבוד ללא מגבלות.',
    tone: 'danger',
    icon: 'alert-circle-outline',
  },
  inactive: {
    title: 'המנוי לא פעיל',
    subtitle: 'יש להפעיל או לעדכן את החבילה כדי לחזור לעבודה מלאה.',
    tone: 'danger',
    icon: 'alert-circle-outline',
  },
  canceled: {
    title: 'המנוי בוטל',
    subtitle: 'אפשר לעדכן או לחדש את החבילה כדי להמשיך לעבוד ללא הפרעה.',
    tone: 'warning',
    icon: 'alert-circle-outline',
  },
  cancelled: {
    title: 'המנוי בוטל',
    subtitle: 'אפשר לעדכן או לחדש את החבילה כדי להמשיך לעבוד ללא הפרעה.',
    tone: 'warning',
    icon: 'alert-circle-outline',
  },
  past_due: {
    title: 'יש בעיית חיוב במנוי',
    subtitle: 'נדרש להסדיר את התשלום כדי למנוע הגבלות על הפעילות.',
    tone: 'warning',
    icon: 'alert-circle-outline',
  },
};

function buildStatus(args: {
  plan: string;
  profileIncomplete: boolean;
  usageWarnings: string[];
  isFirstBusinessExperience?: boolean;
}) {
  const normalizedPlan = args.plan.trim().toLowerCase();
  const hasReachedLimit = args.usageWarnings.some((warning) =>
    warning.endsWith('_limit_reached')
  );
  const hasNearLimit = args.usageWarnings.some((warning) =>
    warning.endsWith('_limit_near')
  );
  const subscriptionStatus = SUBSCRIPTION_STATUS_COPY[normalizedPlan];

  if (subscriptionStatus) {
    return subscriptionStatus;
  }
  if (hasReachedLimit) {
    return {
      title: 'הגעת למגבלת החבילה',
      subtitle:
        'נוצלה מלוא המכסה של החבילה הנוכחית. נדרש עדכון חבילה כדי להמשיך בפעולות נוספות.',
      tone: 'danger' as StatusTone,
      icon: 'alert-circle-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (args.profileIncomplete) {
    return {
      title: 'יש להשלים פרטי עסק',
      subtitle: 'השלמת הפרופיל תשפר את איכות ההמלצות והדיוק בדשבורד.',
      tone: 'warning' as StatusTone,
      icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (hasNearLimit) {
    return {
      title: 'התקרבת למגבלת החבילה',
      subtitle: 'מומלץ לעקוב אחרי השימוש כדי להימנע מחסימת פעולות.',
      tone: 'neutral' as StatusTone,
      icon: 'trending-up-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (args.isFirstBusinessExperience) {
    return {
      title: 'העסק פעיל',
      subtitle: 'אחרי שלקוחות יצטרפו, המדדים וההמלצות יתעדכנו כאן.',
      tone: 'success' as StatusTone,
      icon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
    };
  }
  return {
    title: 'העסק פעיל',
    subtitle: 'הכל תקין והמערכת מזהה הזדמנויות בזמן אמת.',
    tone: 'success' as StatusTone,
    icon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
  };
}

const TONE_STYLES: Record<
  StatusTone,
  {
    bg: string;
    border: string;
    icon: string;
    title: string;
    subtitle: string;
    bubble: string;
    statusBubble: string;
  }
> = {
  danger: {
    bg: '#FEF2F2',
    border: '#FECACA',
    icon: '#DC2626',
    title: '#991B1B',
    subtitle: '#7F1D1D',
    bubble: '#FFF5F5',
    statusBubble: '#FEE2E2',
  },
  warning: {
    bg: '#FFF7ED',
    border: '#FED7AA',
    icon: '#D97706',
    title: '#9A3412',
    subtitle: '#9A3412',
    bubble: '#FFF5EB',
    statusBubble: '#FFEDD5',
  },
  neutral: {
    bg: '#EEF4FF',
    border: '#CFE0FF',
    icon: '#1D4ED8',
    title: '#1E3A8A',
    subtitle: '#1E40AF',
    bubble: '#F4F8FF',
    statusBubble: '#DBEAFE',
  },
  success: {
    bg: '#FFFFFF',
    border: '#E2E8F0',
    icon: '#16A34A',
    title: '#0F172A',
    subtitle: '#334155',
    bubble: '#EEF4FF',
    statusBubble: '#EAF8F1',
  },
};

export function BusinessStatusCard({
  layoutMode,
  plan,
  profileIncomplete,
  usageWarnings,
  isFirstBusinessExperience = false,
}: {
  layoutMode: DashboardLayoutMode;
  plan: string;
  profileIncomplete: boolean;
  usageWarnings: string[];
  isFirstBusinessExperience?: boolean;
}) {
  const layout = getDashboardLayout(layoutMode);
  const status = buildStatus({
    plan,
    profileIncomplete,
    usageWarnings,
    isFirstBusinessExperience,
  });
  const palette = TONE_STYLES[status.tone];

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: layout.cardRadius,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={[styles.storeBubble, { backgroundColor: palette.bubble }]}>
        <Ionicons
          name="storefront"
          size={26}
          color={DASHBOARD_TOKENS.colors.brandBlue}
        />
      </View>
      <View style={styles.textWrap}>
        <Text
          className={tw.textStart}
          style={[styles.title, { color: palette.title }]}
        >
          {status.title}
        </Text>
        <Text
          className={tw.textStart}
          style={[styles.subtitle, { color: palette.subtitle }]}
        >
          {status.subtitle}
        </Text>
      </View>
      <View
        style={[styles.statusBubble, { backgroundColor: palette.statusBubble }]}
      >
        <Ionicons name={status.icon} size={22} color={palette.icon} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    minHeight: 92,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  storeBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 3,
    alignItems: alignItems.start,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
});

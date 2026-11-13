import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { PwaButton } from '@/components/pwa-ui/PwaButton.web';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { Alert } from '@/lib/alert';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  earnedRewardLabel,
  qualificationProgressLabel,
  REFERRAL_COPY,
  referralStatusLabel,
} from '@/lib/referrals/copy';
import { buildReferralShareCreative } from '@/lib/referrals/shareCreative';
import { completeWebBusinessInvite } from '@/lib/referrals/webBusinessInvite';
import { flexDirection, rtlBaseText } from '@/lib/rtl';
import { WEB_BUSINESS_OPERATOR } from '@/lib/webBusinessOperator';

const PAGE_COPY = {
  title: 'עסק מביא עסק',
  subtitle:
    'עסק שמצטרף דרככם ומשלם 3 חודשים מזכה אתכם בחודש מנוי. מנוי שנתי מזכה בחודשיים.',
  note: 'הזיכוי נכנס רק אחרי תשלום מאומת.',
  invite: 'הזמנת עסק',
  whatsapp: 'WhatsApp',
  copied: 'הקישור הועתק.',
  empty: 'עדיין אין הזמנות.',
  denied: 'ההזמנה זמינה לבעלים ולמנהל.',
  noBusiness: 'בחרו עסק כדי להזמין עסקים.',
  shareFailed: 'לא הצלחנו ליצור קישור הזמנה כרגע.',
  redeemFailed: 'לא הצלחנו להתחיל את המימוש כרגע.',
} as const;

type ShareMode = 'invite' | 'whatsapp';

export function BusinessWebReferrals() {
  const { width } = useWindowDimensions();
  const stacked = width < 720;
  const { activeBusiness, activeBusinessId, isLoading, isSwitchingBusiness } =
    useActiveBusiness();
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canInvite = capabilities?.invite_businesses === true;
  const canRedeem = capabilities?.manage_subscription === true;
  const createLink = useMutation(api.referrals.getOrCreateBusinessReferralLink);
  const hub = useQuery(
    api.businessReferralEngine.getBusinessReferralHub,
    !activeBusinessId || isSwitchingBusiness || !canInvite
      ? 'skip'
      : { businessId: activeBusinessId }
  );
  const [busy, setBusy] = useState<ShareMode | 'redeem' | null>(null);
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const scope = useRef({
    id: activeBusinessId,
    switching: isSwitchingBusiness,
  });
  if (
    scope.current.id !== activeBusinessId ||
    scope.current.switching !== isSwitchingBusiness
  )
    scope.current = { id: activeBusinessId, switching: isSwitchingBusiness };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const invite = async (mode: ShareMode) => {
    if (!activeBusinessId || !canInvite || isSwitchingBusiness || busy) {
      return;
    }
    setNotice('');
    setBusy(mode);
    const startedScope = scope.current;
    const isCurrent = () =>
      alive.current &&
      scope.current === startedScope &&
      !startedScope.switching;
    try {
      const outcome = await completeWebBusinessInvite({
        isCurrent,
        mode,
        createLink: () => createLink({ businessId: activeBusinessId }),
        creative: (code) =>
          buildReferralShareCreative({
            businessPublicName: activeBusiness?.name ?? 'StampAix',
            code,
            variant: 'general',
          }),
        openWhatsApp: (text) =>
          Linking.openURL('https://wa.me/?text=' + encodeURIComponent(text)),
        share: shareInvite,
        copy: copyInviteLink,
      });
      if (outcome === 'copied' && isCurrent()) setNotice(PAGE_COPY.copied);
    } catch {
      if (isCurrent()) Alert.alert('הזמנת עסק', PAGE_COPY.shareFailed);
    } finally {
      if (isCurrent()) setBusy(null);
    }
  };

  const redeem = async (rewardId: string) => {
    if (!activeBusinessId || !canRedeem || isSwitchingBusiness || busy) return;
    // Web/SUMIT must never invoke the Apple/Google redemption mutation.
    const subject = encodeURIComponent('בקשת מימוש הטבת הזמנת עסק');
    const body = encodeURIComponent(
      'עסק: ' + activeBusinessId + '\nהטבה: ' + rewardId
    );
    try {
      await Linking.openURL(
        'mailto:' +
          WEB_BUSINESS_OPERATOR.supportEmail +
          '?subject=' +
          subject +
          '&body=' +
          body
      );
    } catch {
      Alert.alert('מימוש ההטבה', PAGE_COPY.redeemFailed);
    }
  };

  if (isLoading) {
    return (
      <View accessibilityLabel="טוען הזמנת עסקים" style={styles.state}>
        <ActivityIndicator color={TOKENS.colors.primary} />
      </View>
    );
  }

  if (!activeBusinessId) {
    return (
      <View style={styles.page}>
        <Text accessibilityRole="header" style={styles.title}>
          {PAGE_COPY.title}
        </Text>
        <Text style={styles.subtitle}>{PAGE_COPY.noBusiness}</Text>
      </View>
    );
  }

  if (!canInvite) {
    return (
      <View style={styles.page}>
        <Text accessibilityRole="header" style={styles.title}>
          {PAGE_COPY.title}
        </Text>
        <Text style={styles.subtitle}>{PAGE_COPY.denied}</Text>
      </View>
    );
  }

  const loadingHub = isSwitchingBusiness || hub == null;

  return (
    <View style={styles.page}>
      <View style={[styles.header, stacked ? styles.headerStacked : null]}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            {PAGE_COPY.title}
          </Text>
          <Text style={styles.subtitle}>{PAGE_COPY.subtitle}</Text>
        </View>
        <View style={[styles.actions, stacked ? styles.actionsStacked : null]}>
          <PwaButton
            accessibilityLabel="הזמנת עסק"
            fullWidth={stacked}
            label={PAGE_COPY.invite}
            loading={busy === 'invite'}
            disabled={busy != null}
            onPress={() => void invite('invite')}
          />
          <PwaButton
            accessibilityLabel="שליחת הזמנה ב-WhatsApp"
            disabled={busy != null}
            fullWidth={stacked}
            label={PAGE_COPY.whatsapp}
            loading={busy === 'whatsapp'}
            onPress={() => void invite('whatsapp')}
            variant="secondary"
          />
        </View>
      </View>
      <Text style={styles.note}>{PAGE_COPY.note}</Text>
      <Text style={styles.note}>
        מימוש הטבות המנוי ב־Web נעשה דרך שירות הלקוחות, לאחר בדיקת זכאות. פתיחת
        הפנייה אינה משנה את המנוי.
      </Text>
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {loadingHub || !hub ? (
        <View accessibilityLabel="טוען סיכום הזמנת עסקים" style={styles.state}>
          <ActivityIndicator color={TOKENS.colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric label="נצברו" value={hub.metrics.monthsEarned} />
            <Metric label="בהמתנה" value={hub.metrics.monthsPending} />
            <Metric label="מומשו" value={hub.metrics.monthsRedeemed} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הזמנות</Text>
            {hub.history.length === 0 ? (
              <Text style={styles.empty}>{PAGE_COPY.empty}</Text>
            ) : (
              hub.history.map((row) => (
                <View key={row.id} style={styles.historyRow}>
                  <Text style={styles.rowTitle}>{row.publicName}</Text>
                  <Text style={styles.rowMeta}>
                    {qualificationProgressLabel(
                      row.paidMonthsConfirmed,
                      row.requiredMonths
                    )}
                    {' · '}
                    {referralStatusLabel(row.status)}
                  </Text>
                </View>
              ))
            )}
          </View>

          {hub.rewards.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>הטבות</Text>
              {hub.rewards.map(
                (row: { id: string; months: number; status: string }) => {
                  const canRedeemRow =
                    canRedeem &&
                    (row.status === 'redeemable' || row.status === 'earned');
                  return (
                    <View key={row.id} style={styles.row}>
                      <View style={styles.rewardCopy}>
                        <Text style={styles.rowTitle}>
                          {earnedRewardLabel(row.months)}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {referralStatusLabel(row.status)}
                        </Text>
                      </View>
                      {canRedeemRow ? (
                        <PwaButton
                          accessibilityLabel={'פנייה למימוש ההטבה'}
                          disabled={busy != null}
                          label={'פנייה למימוש ההטבה'}
                          loading={busy === 'redeem'}
                          onPress={() => void redeem(row.id)}
                          variant="secondary"
                        />
                      ) : null}
                    </View>
                  );
                }
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {new Intl.NumberFormat('he-IL').format(value)}
      </Text>
    </View>
  );
}

async function shareInvite(text: string, url: string) {
  const share = globalThis.navigator?.share;
  if (!share) {
    return false;
  }
  try {
    await globalThis.navigator.share({ text, url });
    return true;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'AbortError') {
      return true;
    }
    return false;
  }
}

async function copyInviteLink(url: string) {
  const write = globalThis.navigator?.clipboard?.writeText;
  if (!write) {
    Alert.alert('הזמנת עסק', url);
    return false;
  }
  await globalThis.navigator.clipboard.writeText(url);
  return true;
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    gap: TOKENS.space.lg,
    maxWidth: 980,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.lg,
    justifyContent: 'space-between',
  },
  headerStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  headerCopy: { flex: 1, gap: TOKENS.space.xs, minWidth: 0 },
  title: {
    ...TOKENS.typography.pageTitle,
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
  },
  subtitle: {
    ...TOKENS.typography.body,
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
  },
  note: {
    ...TOKENS.typography.secondaryBody,
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
  },
  notice: {
    ...TOKENS.typography.body,
    ...rtlBaseText,
    color: TOKENS.colors.success,
  },
  actions: {
    flexDirection: flexDirection.row,
    flexShrink: 0,
    gap: TOKENS.space.sm,
  },
  actionsStacked: { alignSelf: 'stretch' },
  metrics: {
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    borderTopWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    paddingVertical: TOKENS.space.md,
  },
  metric: { flex: 1, gap: 2, minWidth: 72 },
  metricLabel: {
    ...TOKENS.typography.metadata,
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
  },
  metricValue: {
    ...TOKENS.typography.sectionTitle,
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  section: {
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    gap: TOKENS.space.sm,
    paddingTop: TOKENS.space.md,
  },
  sectionTitle: {
    ...TOKENS.typography.sectionTitle,
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
  },
  empty: {
    ...TOKENS.typography.body,
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
  },
  historyRow: { gap: 2, paddingVertical: TOKENS.space.sm },
  row: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
    justifyContent: 'space-between',
    paddingVertical: TOKENS.space.sm,
  },
  rewardCopy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: {
    ...TOKENS.typography.cardTitle,
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
  },
  rowMeta: {
    ...TOKENS.typography.secondaryBody,
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
});

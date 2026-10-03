import { useAction, useQuery } from 'convex/react';
import {
  CalendarDays,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BusinessWebConfirmDialog } from '@/components/business-web/BusinessWebDialog';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  type BillingPeriod,
  type BusinessPlan,
  PLAN_ORDER,
  planConfig,
} from '@/lib/billing/productionContract';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { alignItems, flexDirection, ltrIslandText, selfStart } from '@/lib/rtl';

const YEARLY_COPY = 'בחיוב שנתי — משלמים על 10 חודשים ומקבלים 12';
const CANCELLATION_COPY =
  'ביטול מפסיק את החידוש הבא. הגישה נשארת פעילה עד סוף התקופה שכבר שולמה.';

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  trialing: 'תקופת ניסיון',
  past_due: 'נדרש טיפול בתשלום',
  canceled: 'בוטל — פעיל עד סוף התקופה',
  inactive: 'לא פעיל',
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
};

function formatDate(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '—';
  }
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function checkoutErrorMessage(code: unknown) {
  if (code === 'SUMIT_ACTIVE_SUBSCRIPTION_EXISTS') {
    return 'כבר קיים מנוי בתשלום. שינוי מסלול או מחזור חיוב עדיין לא זמין בגרסה זו.';
  }
  if (code === 'SUMIT_CONFIG_MISSING') {
    return 'סביבת התשלום עדיין אינה זמינה. אפשר לנסות שוב מאוחר יותר.';
  }
  if (code === 'SUMIT_PRODUCTION_NOT_ENABLED') {
    return 'סביבת התשלום עדיין אינה זמינה.';
  }
  return 'לא הצלחנו לפתוח את עמוד התשלום כרגע. נסו שוב.';
}

function cancellationErrorMessage(code: unknown) {
  if (code === 'SUMIT_CONFIG_MISSING') {
    return 'סביבת התשלום עדיין אינה זמינה. נסו שוב מאוחר יותר.';
  }
  return 'לא הצלחנו לבטל את החידוש כרגע. המנוי לא שונה.';
}

function openDocumentUrl(url: string | null) {
  if (url) {
    void Linking.openURL(url);
  }
}

export function BusinessWebBilling() {
  const { width } = useWindowDimensions();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const isOwner = activeBusiness?.staffRole === 'owner';
  const overview = useQuery(
    api.businessBilling.getBusinessBillingOverview,
    activeBusinessId && isOwner ? { businessId: activeBusinessId } : 'skip'
  );
  const createCheckout = useAction(api.sumitBilling.createSUMITCheckout);
  const cancelRecurring = useAction(api.sumitBilling.cancelSUMITRecurring);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [pendingPlan, setPendingPlan] = useState<BusinessPlan | null>(null);
  const [actionError, setActionError] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelNotice, setCancelNotice] = useState('');

  const documents = useMemo(() => overview?.documents ?? [], [overview]);

  async function handleCheckout(plan: BusinessPlan) {
    if (!activeBusinessId || pendingPlan || overview?.hasCurrentPaidAccess) {
      return;
    }
    setActionError('');
    setPendingPlan(plan);
    try {
      const result = await createCheckout({
        businessId: activeBusinessId,
        plan,
        billingPeriod,
      });
      if (
        result.ok === true &&
        result.hosted === true &&
        typeof result.paymentPageLink === 'string'
      ) {
        window.location.assign(result.paymentPageLink);
        return;
      }
      setActionError(checkoutErrorMessage(result.code));
    } catch {
      setActionError('לא הצלחנו לפתוח את עמוד התשלום כרגע. נסו שוב.');
    } finally {
      setPendingPlan(null);
    }
  }

  async function handleCancellation() {
    if (!activeBusinessId || isCanceling) {
      return;
    }
    setIsCanceling(true);
    setActionError('');
    setCancelNotice('');
    try {
      const result = await cancelRecurring({ businessId: activeBusinessId });
      if (result.ok === true) {
        setCancelNotice(
          'החידוש הבא בוטל. הגישה נשארת פעילה עד סוף התקופה ששולמה.'
        );
        setShowCancelDialog(false);
        return;
      }
      setActionError(cancellationErrorMessage(result.code));
      setShowCancelDialog(false);
    } catch {
      setActionError('לא הצלחנו לבטל את החידוש כרגע. המנוי לא שונה.');
      setShowCancelDialog(false);
    } finally {
      setIsCanceling(false);
    }
  }

  if (!activeBusinessId || !activeBusiness) {
    return (
      <PageState
        description="בחרו עסק כדי לצפות בחיוב ובחשבוניות שלו."
        title="לא נבחר עסק פעיל"
      />
    );
  }

  if (!isOwner) {
    return (
      <PageState
        description="רק בעלי העסק יכולים לצפות בפרטי המנוי ולבצע פעולות חיוב."
        title="החיוב זמין לבעלי העסק"
      />
    );
  }

  if (overview === undefined) {
    return (
      <View style={styles.pageState}>
        <ActivityIndicator color={TOKENS.colors.primary} size="large" />
        <Text style={styles.pageStateDescription}>טוענים את פרטי החיוב…</Text>
      </View>
    );
  }

  const plansStacked = width < 1040;
  const planName = overview?.plan
    ? planConfig[overview.plan as BusinessPlan]?.displayName
    : null;
  const status = overview?.status ?? 'inactive';
  const hasCurrentPaidAccess = overview?.hasCurrentPaidAccess === true;
  const isTrialing = overview?.isTrialing === true;
  const currentBillingPeriod: BillingPeriod | null =
    overview?.billingPeriod === 'monthly' ||
    overview?.billingPeriod === 'yearly'
      ? overview.billingPeriod
      : null;
  const displayedBillingPeriod: BillingPeriod =
    hasCurrentPaidAccess && currentBillingPeriod
      ? currentBillingPeriod
      : billingPeriod;

  return (
    <View style={styles.page}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCopy}>
          <Text style={styles.pageTitle}>חיוב וחשבוניות</Text>
          <Text style={styles.pageSubtitle}>
            ניהול המסלול, מחזור החיוב ומסמכי התשלום של {activeBusiness.name}.
          </Text>
        </View>
      </View>

      {actionError ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
          <Text style={styles.errorText}>{actionError}</Text>
        </View>
      ) : null}
      {cancelNotice ? (
        <View accessibilityLiveRegion="polite" style={styles.successBanner}>
          <Text style={styles.successText}>{cancelNotice}</Text>
        </View>
      ) : null}

      <SectionCard
        description="המידע מוצג לפי מצב המנוי הקנוני שנשמר ב-StampAix."
        icon={ShieldCheck}
        title="המנוי הנוכחי"
      >
        <View style={styles.detailsGrid}>
          <Detail
            label="מסלול"
            value={planName ?? 'אין מסלול פעיל'}
            ltr={true}
          />
          <Detail label="סטטוס" value={STATUS_LABELS[status] ?? 'לא פעיל'} />
          <Detail
            label="מחזור חיוב"
            value={
              overview?.billingPeriod
                ? PERIOD_LABELS[overview.billingPeriod]
                : '—'
            }
          />
          <Detail
            label={isTrialing ? 'סיום תקופת הניסיון' : 'סוף התקופה ששולמה'}
            value={formatDate(
              isTrialing ? overview?.trialEndsAt : overview?.currentPeriodEndAt
            )}
          />
        </View>
        {overview?.canceledAt ? (
          <Text style={styles.cancellationState}>
            החידוש בוטל בתאריך {formatDate(overview.canceledAt)}. הגישה אינה
            נפסקת לפני סוף התקופה ששולמה.
          </Text>
        ) : null}
        {overview?.canCancel ? (
          <View style={styles.subscriptionActions}>
            <Pressable
              accessibilityLabel="ביטול חידוש המנוי"
              accessibilityRole="button"
              onPress={() => setShowCancelDialog(true)}
              style={({ pressed }) => [
                styles.dangerOutlineButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.dangerOutlineText}>ביטול חידוש המנוי</Text>
            </Pressable>
            <View
              accessibilityState={{ disabled: true }}
              style={styles.disabledButton}
            >
              <CreditCard color={TOKENS.colors.textMuted} size={17} />
              <Text style={styles.disabledButtonText}>עדכון כרטיס — בקרוב</Text>
            </View>
          </View>
        ) : null}
      </SectionCard>

      <View style={styles.plansHeader}>
        <View style={styles.plansHeaderCopy}>
          <Text style={styles.sectionHeading}>בחירת מסלול</Text>
          <Text style={styles.sectionDescription}>
            {hasCurrentPaidAccess
              ? 'המנוי הנוכחי מוצג למטה. שינוי מסלול או מחזור חיוב עדיין לא זמין בגרסה זו.'
              : isTrialing
                ? '14 ימי הניסיון כוללים את יכולות Pro. אין חיוב אוטומטי בסיום; כדי להמשיך בוחרים מסלול ומשלמים בעמוד המאובטח של SUMIT.'
                : 'התשלום מתבצע בעמוד המאובטח של SUMIT. פרטי הכרטיס אינם מוזנים או נשמרים ב-StampAix.'}
          </Text>
        </View>
        <View accessibilityLabel="מחזור חיוב" style={styles.cadenceToggle}>
          {(['monthly', 'yearly'] as const).map((period) => {
            const selected = displayedBillingPeriod === period;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: hasCurrentPaidAccess,
                  selected,
                }}
                disabled={hasCurrentPaidAccess}
                key={period}
                onPress={() => setBillingPeriod(period)}
                style={[
                  styles.cadenceOption,
                  selected ? styles.cadenceOptionSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.cadenceOptionText,
                    selected ? styles.cadenceOptionTextSelected : null,
                  ]}
                >
                  {PERIOD_LABELS[period]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {displayedBillingPeriod === 'yearly' ? (
        <View style={styles.yearlyBanner}>
          <CalendarDays color={TOKENS.colors.success} size={19} />
          <Text style={styles.yearlyBannerText}>{YEARLY_COPY}</Text>
        </View>
      ) : null}

      <View
        style={[styles.planGrid, plansStacked ? styles.planGridStacked : null]}
      >
        {PLAN_ORDER.map((plan) => {
          const definition = planConfig[plan];
          const price = definition.pricing[displayedBillingPeriod];
          const isCurrent = hasCurrentPaidAccess && overview?.plan === plan;
          const busy = pendingPlan === plan;
          const checkoutDisabled = hasCurrentPaidAccess || pendingPlan !== null;
          return (
            <View
              key={plan}
              style={[
                styles.planCard,
                plan === 'pro' ? styles.planCardFeatured : null,
              ]}
            >
              {plan === 'pro' ? (
                <Text style={styles.featuredBadge}>הבחירה הפופולרית</Text>
              ) : null}
              <Text style={styles.planName}>{definition.displayName}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>
                  ₪{price.toLocaleString('he-IL')}
                </Text>
                <Text style={styles.pricePeriod}>
                  / {displayedBillingPeriod === 'monthly' ? 'חודש' : 'שנה'}
                </Text>
              </View>
              <View style={styles.planFacts}>
                <PlanFact
                  text={`עד ${definition.limits.maxCustomers.toLocaleString('he-IL')} לקוחות`}
                />
                <PlanFact
                  text={`עד ${definition.limits.maxCards} כרטיסי נאמנות`}
                />
                <PlanFact
                  text={
                    definition.limits.maxTeamSeats > 0
                      ? `עד ${definition.limits.maxTeamSeats} חברי צוות`
                      : 'ללא מושבי צוות'
                  }
                />
              </View>
              <Pressable
                accessibilityLabel={`בחירת מסלול ${definition.displayName}`}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: checkoutDisabled }}
                disabled={checkoutDisabled}
                onPress={() => void handleCheckout(plan)}
                style={({ pressed }) => [
                  styles.checkoutButton,
                  checkoutDisabled ? styles.checkoutButtonDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : null}
                <Text style={styles.checkoutButtonText}>
                  {busy
                    ? 'מעבירים לתשלום…'
                    : isCurrent
                      ? 'המסלול הנוכחי'
                      : hasCurrentPaidAccess
                        ? 'שינוי מסלול — בקרוב'
                        : isTrialing
                          ? 'בחירת מסלול והמשך לתשלום'
                          : 'המשך לתשלום מאובטח'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <SectionCard
        description="מסמכים שהתקבלו מתשלומים שאומתו על ידי השרת."
        icon={ReceiptText}
        title="חשבוניות וקבלות"
      >
        {documents.length === 0 ? (
          <Text style={styles.emptyDocuments}>אין עדיין מסמכים להצגה.</Text>
        ) : (
          <View style={styles.documentList}>
            {documents.map((document, index) => (
              <View
                key={`${document.documentNumber ?? 'document'}-${document.issuedAt}-${index}`}
                style={styles.documentRow}
              >
                <View style={styles.documentIcon}>
                  <FileText color={TOKENS.colors.primary} size={19} />
                </View>
                <View style={styles.documentCopy}>
                  <Text style={styles.documentTitle}>
                    {document.documentNumber
                      ? `מסמך ${document.documentNumber}`
                      : 'מסמך תשלום'}
                  </Text>
                  <Text style={styles.documentMeta}>
                    {formatDate(document.issuedAt)}
                    {document.documentType ? ` · ${document.documentType}` : ''}
                  </Text>
                </View>
                {document.documentUrl ? (
                  <Pressable
                    accessibilityLabel="פתיחת מסמך תשלום"
                    accessibilityRole="link"
                    onPress={() => openDocumentUrl(document.documentUrl)}
                    style={({ pressed }) => [
                      styles.documentLink,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <ExternalLink color={TOKENS.colors.primary} size={17} />
                    <Text style={styles.documentLinkText}>פתיחה</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <BusinessWebConfirmDialog
        busy={isCanceling}
        confirmLabel="ביטול החידוש"
        description={CANCELLATION_COPY}
        onCancel={() => setShowCancelDialog(false)}
        onConfirm={() => void handleCancellation()}
        title="לבטל את חידוש המנוי?"
        visible={showCancelDialog}
      />
    </View>
  );
}

function Detail({
  label,
  ltr = false,
  value,
}: {
  label: string;
  ltr?: boolean;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, ltr ? styles.ltrText : null]}>
        {value}
      </Text>
    </View>
  );
}

function PlanFact({ text }: { text: string }) {
  return (
    <View style={styles.planFact}>
      <Check color={TOKENS.colors.success} size={17} />
      <Text style={styles.planFactText}>{text}</Text>
    </View>
  );
}

function SectionCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof ShieldCheck;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Icon color={TOKENS.colors.primary} size={21} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function PageState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <View style={styles.pageState}>
      <View style={styles.pageStateIcon}>
        <ReceiptText color={TOKENS.colors.primary} size={26} />
      </View>
      <Text style={styles.pageStateTitle}>{title}</Text>
      <Text style={styles.pageStateDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    gap: TOKENS.space.xl,
    maxWidth: 1180,
    width: '100%',
  },
  pageHeader: { flexDirection: flexDirection.row },
  pageHeaderCopy: { flex: 1, gap: TOKENS.space.xs },
  pageTitle: {
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pageSubtitle: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorBanner: {
    backgroundColor: TOKENS.colors.dangerSubtle,
    borderColor: '#FECACA',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    padding: TOKENS.space.lg,
  },
  errorText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successBanner: {
    backgroundColor: TOKENS.colors.successSubtle,
    borderColor: '#A7F3D0',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    padding: TOKENS.space.lg,
  },
  successText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.success,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    ...TOKENS.shadow,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: TOKENS.space.xl,
    width: '100%',
  },
  cardHeader: {
    alignItems: alignItems.start,
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    paddingBottom: TOKENS.space.lg,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardHeaderCopy: { flex: 1, gap: 2 },
  cardTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardBody: { gap: TOKENS.space.lg, paddingTop: TOKENS.space.xl },
  detailsGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
  },
  detail: {
    backgroundColor: TOKENS.colors.subtleSurface,
    borderRadius: TOKENS.radii.md,
    flexGrow: 1,
    gap: TOKENS.space.xs,
    minWidth: 190,
    padding: TOKENS.space.lg,
  },
  detailLabel: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailValue: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ltrText: { ...ltrIslandText },
  cancellationState: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subscriptionActions: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
  },
  dangerOutlineButton: {
    borderColor: TOKENS.colors.danger,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: TOKENS.space.lg,
  },
  dangerOutlineText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.danger,
  },
  disabledButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.subtleSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    minHeight: 44,
    opacity: 0.75,
    paddingHorizontal: TOKENS.space.lg,
  },
  disabledButtonText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textMuted,
  },
  plansHeader: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.lg,
    justifyContent: 'space-between',
  },
  plansHeaderCopy: { flex: 1, gap: TOKENS.space.xs, minWidth: 260 },
  sectionHeading: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cadenceToggle: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    padding: 4,
  },
  cadenceOption: {
    borderRadius: TOKENS.radii.sm,
    minWidth: 88,
    paddingHorizontal: TOKENS.space.lg,
    paddingVertical: TOKENS.space.sm,
  },
  cadenceOptionSelected: { backgroundColor: TOKENS.colors.primary },
  cadenceOptionText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
    textAlign: 'center',
  },
  cadenceOptionTextSelected: { color: '#FFFFFF' },
  yearlyBanner: {
    alignItems: 'center',
    alignSelf: selfStart,
    backgroundColor: TOKENS.colors.successSubtle,
    borderRadius: TOKENS.radii.pill,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    paddingHorizontal: TOKENS.space.lg,
    paddingVertical: TOKENS.space.sm,
  },
  yearlyBannerText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.success,
    writingDirection: 'rtl',
  },
  planGrid: {
    alignItems: 'stretch',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.lg,
  },
  planGridStacked: { flexDirection: 'column' },
  planCard: {
    ...TOKENS.shadow,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: TOKENS.space.lg,
    minWidth: 0,
    padding: TOKENS.space.xl,
  },
  planCardFeatured: { borderColor: TOKENS.colors.primary, borderWidth: 2 },
  featuredBadge: {
    ...TOKENS.typography.metadata,
    alignSelf: selfStart,
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    color: TOKENS.colors.primary,
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.xs,
  },
  planName: {
    ...ltrIslandText,
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: flexDirection.rowReverse,
    gap: TOKENS.space.xs,
  },
  price: {
    ...ltrIslandText,
    ...TOKENS.typography.kpiValue,
    color: TOKENS.colors.textPrimary,
  },
  pricePeriod: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
  },
  planFacts: { flex: 1, gap: TOKENS.space.md },
  planFact: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  planFactText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    writingDirection: 'rtl',
  },
  checkoutButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: TOKENS.space.lg,
  },
  checkoutButtonDisabled: { opacity: 0.65 },
  checkoutButtonText: { ...TOKENS.typography.label, color: '#FFFFFF' },
  documentList: { gap: TOKENS.space.sm },
  documentRow: {
    alignItems: 'center',
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    minHeight: 66,
    paddingVertical: TOKENS.space.sm,
  },
  documentIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  documentCopy: { flex: 1, gap: 2 },
  documentTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  documentMeta: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  documentLink: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.xs,
    minHeight: 40,
    paddingHorizontal: TOKENS.space.sm,
  },
  documentLinkText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.primary,
  },
  emptyDocuments: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pageState: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: TOKENS.space.md,
    justifyContent: 'center',
    maxWidth: 520,
    minHeight: 360,
    padding: TOKENS.space.xl,
    width: '100%',
  },
  pageStateIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  pageStateTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageStateDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.82 },
});

import { useAction, useMutation, useQuery } from 'convex/react';
import {
  CalendarDays,
  Check,
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
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BusinessWebConfirmDialog,
  BusinessWebDialog,
} from '@/components/business-web/BusinessWebDialog';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  type BillingPeriod,
  type BusinessPlan,
  PLAN_ORDER,
  planConfig,
} from '@/lib/billing/productionContract';
import { WEB_TAX_POLICY } from '@/lib/billing/webTaxPolicy';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { WEB_LEGAL_VERSION } from '@/lib/legalWebContract';
import { WEB_LEGAL_DOCUMENTS } from '@/lib/legalWebDocuments';
import { alignItems, flexDirection, ltrIslandText, selfStart } from '@/lib/rtl';
import { WEB_BUSINESS_OPERATOR } from '@/lib/webBusinessOperator';

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

export function BusinessWebBilling({
  businessIdOverride,
  businessNameOverride,
  onBeforeCheckout,
}: {
  businessIdOverride?: Id<'businesses'>;
  businessNameOverride?: string;
  onBeforeCheckout?: () => Promise<void>;
} = {}) {
  const { width } = useWindowDimensions();
  const active = useActiveBusiness();
  const activeBusinessId = businessIdOverride ?? active.activeBusinessId;
  const businessName =
    businessNameOverride ?? active.activeBusiness?.name ?? '';
  // The override scopes onboarding to its draft. Every server call still
  // authorizes the authenticated owner independently of this UI condition.
  const isOwner =
    businessIdOverride !== undefined ||
    active.activeBusiness?.staffRole === 'owner';
  const overview = useQuery(
    api.businessBilling.getBusinessBillingOverview,
    activeBusinessId && isOwner ? { businessId: activeBusinessId } : 'skip'
  );
  const createCheckout = useAction(api.sumitBilling.createSUMITCheckout);
  const termsAcceptance = useQuery(
    api.businessBilling.getActivationTermsAcceptance,
    activeBusinessId && isOwner ? { businessId: activeBusinessId } : 'skip'
  );
  const acceptTerms = useMutation(api.businessBilling.acceptActivationTerms);
  const [checkedBusinessId, setCheckedBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const termsAccepted =
    termsAcceptance?.accepted === true ||
    checkedBusinessId === activeBusinessId;
  const checkoutAvailability = useQuery(
    api.businessBilling.getCheckoutAvailability,
    activeBusinessId && isOwner ? { businessId: activeBusinessId } : 'skip'
  );
  const cancelRecurring = useAction(api.sumitBilling.cancelSUMITRecurring);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [pendingPlan, setPendingPlan] = useState<BusinessPlan | null>(null);
  const [actionError, setActionError] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelNotice, setCancelNotice] = useState('');

  const documents = useMemo(() => overview?.documents ?? [], [overview]);

  async function handleCheckout(plan: BusinessPlan) {
    if (!activeBusinessId || pendingPlan || overview?.hasCurrentPaidAccess) {
      return;
    }
    if (checkoutAvailability?.available !== true || !termsAccepted) return;
    setActionError('');
    setPendingPlan(plan);
    try {
      await onBeforeCheckout?.();
      await acceptTerms({
        businessId: activeBusinessId,
        version: WEB_LEGAL_VERSION,
      });
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

  if (!activeBusinessId) {
    return (
      <PageState
        description="בחרו עסק כדי לצפות בחיוב ובמסמכי התשלום שלו."
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
  const visiblePlans = PLAN_ORDER.map((plan) => plan).sort(
    (left, right) =>
      planConfig[left].pricing[displayedBillingPeriod] -
      planConfig[right].pricing[displayedBillingPeriod]
  );

  const periodLabel = overview?.billingPeriod
    ? PERIOD_LABELS[overview.billingPeriod]
    : null;
  const statusSummary = [planName, periodLabel].filter(Boolean).join(' · ');
  const periodEndAt = isTrialing
    ? overview?.trialEndsAt
    : overview?.currentPeriodEndAt;
  function focusRenewalPlans() {
    if (typeof document === 'undefined') {
      return;
    }
    document
      .getElementById('billing-plans')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const bannerTone =
    status === 'active'
      ? 'success'
      : status === 'past_due' || status === 'canceled'
        ? 'warning'
        : status === 'trialing'
          ? 'neutral'
          : 'danger';

  return (
    <View style={styles.page}>
      <View
        accessibilityRole="summary"
        style={[
          styles.statusBanner,
          bannerTone === 'success'
            ? styles.statusBannerSuccess
            : bannerTone === 'warning'
              ? styles.statusBannerWarning
              : bannerTone === 'neutral'
                ? styles.statusBannerNeutral
                : styles.statusBannerDanger,
        ]}
      >
        <Text
          style={[
            styles.statusLabel,
            bannerTone === 'success'
              ? styles.statusLabelSuccess
              : bannerTone === 'warning'
                ? styles.statusLabelWarning
                : bannerTone === 'neutral'
                  ? styles.statusLabelNeutral
                  : styles.statusLabelDanger,
          ]}
        >
          {STATUS_LABELS[status] ?? 'לא פעיל'}
        </Text>
        <Text
          style={[
            styles.statusMeta,
            bannerTone === 'danger' ? styles.statusOnDanger : null,
          ]}
        >
          {statusSummary || 'אין מסלול פעיל'}
        </Text>
        {bannerTone === 'danger' ? (
          <Text style={styles.statusImpact}>
            לקוח חדש לא מצטרף ולא מקבל חותמת. מבצע חדש לא נפתח.
          </Text>
        ) : null}
        {typeof periodEndAt === 'number' ? (
          <Text
            style={[
              styles.statusNote,
              bannerTone === 'danger' ? styles.statusOnDanger : null,
            ]}
          >
            {isTrialing ? 'ניסיון עד' : 'פעיל עד'} {formatDate(periodEndAt)}
          </Text>
        ) : null}
        {overview?.canceledAt ? (
          <Text style={styles.statusNote}>
            החידוש בוטל ב-{formatDate(overview.canceledAt)}.
          </Text>
        ) : null}
        {overview?.canCancel ? (
          <Pressable
            accessibilityLabel="ביטול חידוש המנוי"
            accessibilityRole="button"
            onPress={() => setShowCancelDialog(true)}
            style={({ pressed }) => [
              styles.dangerOutlineButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.dangerOutlineText}>ביטול חידוש</Text>
          </Pressable>
        ) : null}
        {bannerTone === 'danger' ? (
          <Pressable
            accessibilityLabel="חידוש המנוי"
            accessibilityRole="button"
            onPress={focusRenewalPlans}
            style={({ pressed }) => [
              styles.renewButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.renewButtonText}>חידוש המנוי</Text>
          </Pressable>
        ) : null}
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

      {checkoutAvailability?.available === false && !hasCurrentPaidAccess ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
          <Text style={styles.errorText}>התשלום אינו זמין כרגע.</Text>
        </View>
      ) : null}

      <View nativeID="billing-plans" style={styles.plansBar}>
        <Text style={styles.sectionHeading}>מסלולים</Text>
        <Text style={styles.sectionDescription}>
          {WEB_TAX_POLICY.priceNotice}
        </Text>
        {!hasCurrentPaidAccess ? (
          <Text style={styles.sectionDescription}>
            הפעלה מחייבת חיוב מיידי בכרטיס אשראי. ב־14 הימים הראשונים מהתשלום
            הראשון אפשר לבקש החזר מלא דרך שירות הלקוחות. התשלום מתבצע בעמוד
            המאובטח של SUMIT.
          </Text>
        ) : null}
        {hasCurrentPaidAccess ? (
          <Text style={styles.sectionDescription}>
            שינוי מסלול או מחזור חיוב עדיין לא זמין בגרסה זו.
          </Text>
        ) : null}
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
        <Text style={styles.taxLine}>{WEB_TAX_POLICY.priceNotice}</Text>
      </View>
      {displayedBillingPeriod === 'yearly' ? (
        <Text style={styles.yearlyNote}>{YEARLY_COPY}</Text>
      ) : null}

      {!hasCurrentPaidAccess ? (
        <View style={styles.plansHeaderCopy}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted }}
            accessibilityLabel="אישור תנאי המנוי: חיוב מיידי ואפשרות להחזר מלא דרך השירות ב־14 הימים הראשונים"
            onPress={() =>
              setCheckedBusinessId(
                checkedBusinessId === activeBusinessId ? null : activeBusinessId
              )
            }
            disabled={
              termsAcceptance?.accepted === true || pendingPlan !== null
            }
          >
            <Text style={styles.sectionDescription}>
              {termsAccepted ? '☑' : '☐'} אני מאשר/ת את תנאי המנוי: חיוב מיידי,
              חידוש לפי המסלול שנבחר ואפשרות לבקש החזר מלא דרך השירות ב־14 הימים
              הראשונים מהתשלום הראשון.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => setShowTerms(true)}
          >
            <Text style={styles.planName}>קריאת תנאי המנוי וההחזר</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          void Linking.openURL(
            `mailto:${WEB_BUSINESS_OPERATOR.supportEmail}?subject=${encodeURIComponent(`בקשת שירות או החזר למנוי — ${businessName}`)}`
          )
        }
      >
        <Text style={styles.sectionDescription}>
          שירות לקוחות ובקשת החזר: {WEB_BUSINESS_OPERATOR.supportEmail}
        </Text>
      </Pressable>

      <View
        style={[styles.planGrid, plansStacked ? styles.planGridStacked : null]}
      >
        {visiblePlans.map((plan) => {
          const definition = planConfig[plan];
          const price = definition.pricing[displayedBillingPeriod];
          const fullYearPrice = definition.pricing.monthly * 12;
          const discount =
            displayedBillingPeriod === 'yearly'
              ? fullYearPrice - definition.pricing.yearly
              : 0;
          const isCurrent = hasCurrentPaidAccess && overview?.plan === plan;
          const busy = pendingPlan === plan;
          const checkoutDisabled =
            hasCurrentPaidAccess ||
            pendingPlan !== null ||
            checkoutAvailability?.available !== true ||
            !termsAccepted;
          const pulseYearlyPro =
            plan === 'pro' && displayedBillingPeriod === 'yearly';
          const card = (
            <View
              key={plan}
              nativeID={pulseYearlyPro ? 'yearly-pro-plan' : undefined}
              style={[
                styles.planCard,
                plan === 'pro' ? styles.planCardFeatured : null,
              ]}
            >
              <View style={styles.planTitleRow}>
                <Text style={styles.planName}>{definition.displayName}</Text>
                {pulseYearlyPro ? (
                  <Text style={styles.featuredBadge}>הנמכר ביותר</Text>
                ) : null}
              </View>
              <View style={styles.priceBlock}>
                {discount > 0 ? (
                  <View style={styles.priceCompare}>
                    <Text
                      accessibilityLabel={`מחיר לפני הנחה ${fullYearPrice} שקלים`}
                      style={styles.priceWas}
                    >
                      ₪{fullYearPrice.toLocaleString('he-IL')}
                    </Text>
                    <Text style={styles.discountLabel}>
                      הנחה ₪{discount.toLocaleString('he-IL')}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.price}>
                  ₪{price.toLocaleString('he-IL')}
                </Text>
                <Text style={styles.pricePeriod}>
                  {displayedBillingPeriod === 'monthly' ? 'לחודש' : 'לשנה'}
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
                        ? 'שינוי מסלול אינו זמין בגרסה זו'
                        : checkoutAvailability?.available !== true
                          ? 'התשלום אינו זמין כרגע'
                          : !termsAccepted
                            ? 'יש לאשר את תנאי העסק'
                            : isTrialing
                              ? 'בחירת מסלול והמשך לתשלום'
                              : 'לתשלום'}
                </Text>
              </Pressable>
            </View>
          );
          return (
            <View key={plan} style={styles.planSlot}>
              {card}
            </View>
          );
        })}
      </View>

      <BusinessWebDialog
        visible={showTerms}
        onDismiss={() => setShowTerms(false)}
        title="תנאי המנוי וההחזר"
        description={`גרסה ${WEB_LEGAL_VERSION}`}
        maxWidth={760}
      >
        <ScrollView
          style={{ maxHeight: 480 }}
          contentContainerStyle={{ gap: 16 }}
        >
          {WEB_LEGAL_DOCUMENTS.terms.sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionHeading}>{section.title}</Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} style={styles.sectionDescription}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </BusinessWebDialog>

      <SectionCard title="מסמכים">
        {documents.length === 0 ? (
          <Text style={styles.emptyDocuments}>אין מסמכים.</Text>
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

function PlanFact({ text }: { text: string }) {
  return (
    <View style={styles.planFact}>
      <View style={styles.planFactIcon}>
        <Check color={TOKENS.colors.success} size={16} />
      </View>
      <Text style={styles.planFactText}>{text}</Text>
    </View>
  );
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
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
    gap: 14,
    maxWidth: 980,
    width: '100%',
  },
  statusBanner: {
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: TOKENS.space.lg,
    paddingVertical: TOKENS.space.lg,
    width: '100%',
  },
  statusBannerDanger: {
    backgroundColor: '#B91C1C',
    borderColor: '#B91C1C',
  },
  statusBannerSuccess: {
    backgroundColor: TOKENS.colors.successSubtle,
    borderColor: '#A7F3D0',
  },
  statusBannerWarning: {
    backgroundColor: TOKENS.colors.warningSubtle,
    borderColor: '#FED7AA',
  },
  statusBannerNeutral: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderColor: TOKENS.colors.border,
  },
  statusLabel: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 30,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusLabelDanger: { color: '#FFFFFF' },
  statusOnDanger: { color: '#FFFFFF' },
  statusImpact: {
    ...TOKENS.typography.secondaryBody,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  renewButton: {
    alignSelf: selfStart,
    backgroundColor: '#FFFFFF',
    borderRadius: TOKENS.radii.sm,
    justifyContent: 'center',
    marginTop: TOKENS.space.sm,
    minHeight: 42,
    paddingHorizontal: TOKENS.space.md,
  },
  renewButtonText: {
    ...TOKENS.typography.label,
    color: '#B91C1C',
    textAlign: 'center',
  },
  statusLabelSuccess: { color: TOKENS.colors.success },
  statusLabelWarning: { color: TOKENS.colors.warning },
  statusLabelNeutral: { color: TOKENS.colors.primary },
  statusMeta: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusNote: {
    ...TOKENS.typography.secondaryBody,
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
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingTop: 12,
    width: '100%',
  },
  cardTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardBody: { gap: 10, paddingTop: 10 },
  dangerOutlineButton: {
    alignSelf: selfStart,
    borderColor: TOKENS.colors.danger,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    marginTop: TOKENS.space.sm,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: TOKENS.space.md,
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
    minHeight: 38,
    opacity: 0.75,
    paddingHorizontal: TOKENS.space.md,
  },
  disabledButtonText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textMuted,
  },
  plansBar: {
    gap: TOKENS.space.sm,
    width: '100%',
  },
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
    width: '100%',
  },
  cadenceOption: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.sm,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.sm,
  },
  cadenceOptionSelected: { backgroundColor: TOKENS.colors.primary },
  cadenceOptionText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
    textAlign: 'center',
  },
  cadenceOptionTextSelected: { color: '#FFFFFF' },
  taxLine: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  yearlyNote: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.success,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  termsGate: {
    alignItems: alignItems.start,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    gap: TOKENS.space.sm,
    padding: TOKENS.space.md,
  },
  termsGateText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  termsGateLink: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.primary,
    textAlign: 'right',
    textDecorationLine: 'underline',
    writingDirection: 'rtl',
  },
  planGrid: {
    alignItems: 'stretch',
    flexDirection: flexDirection.row,
    gap: 8,
    overflow: 'visible',
  },
  planGridStacked: { flexDirection: 'column' },
  planSlot: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  planCard: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planCardFeatured: { borderColor: TOKENS.colors.primary, borderWidth: 2 },
  planTitleRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: 8,
    justifyContent: 'space-between',
    width: '100%',
  },
  featuredBadge: {
    ...TOKENS.typography.metadata,
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    color: TOKENS.colors.primary,
    overflow: 'hidden',
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.xs,
  },
  planName: {
    ...ltrIslandText,
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  priceBlock: {
    gap: 0,
    width: '100%',
  },
  priceCompare: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: 8,
    width: '100%',
  },
  priceWas: {
    ...ltrIslandText,
    color: TOKENS.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textDecorationLine: 'line-through',
  },
  discountLabel: {
    color: TOKENS.colors.success,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    writingDirection: 'rtl',
  },
  price: {
    ...ltrIslandText,
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
    textAlign: 'right',
    width: '100%',
  },
  pricePeriod: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    width: '100%',
    writingDirection: 'rtl',
  },
  planFacts: { gap: 2, width: '100%' },
  planFact: {
    alignItems: alignItems.end,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    width: '100%',
  },
  planFactIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  planFactText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  checkoutButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 36,
    paddingHorizontal: TOKENS.space.md,
  },
  checkoutButtonDisabled: { opacity: 0.65 },
  checkoutButtonText: {
    ...TOKENS.typography.label,
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
  },
  documentList: { gap: TOKENS.space.sm },
  documentRow: {
    alignItems: 'center',
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    minHeight: 46,
    paddingVertical: TOKENS.space.sm,
  },
  documentIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    minHeight: 160,
    padding: TOKENS.space.lg,
    width: '100%',
  },
  pageStateIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
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
  cardHeader: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    paddingBottom: 8,
  },
  cardIcon: {
    display: 'none',
  },
  cardHeaderCopy: { flex: 1, gap: 2 },
  cardDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailsGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 8,
  },
  detail: {
    flexGrow: 1,
    gap: 1,
    minWidth: 140,
    paddingHorizontal: 12,
    paddingVertical: 2,
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
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 8,
  },
  plansHeader: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 8,
    justifyContent: 'space-between',
  },
  plansHeaderCopy: { flex: 1, gap: TOKENS.space.xs, minWidth: 260 },
  yearlyBanner: {
    alignItems: 'center',
    alignSelf: selfStart,
    backgroundColor: TOKENS.colors.successSubtle,
    borderRadius: TOKENS.radii.pill,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.sm,
  },
  yearlyBannerText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.success,
    writingDirection: 'rtl',
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: flexDirection.rowReverse,
    gap: TOKENS.space.xs,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

const TEXT = {
  title: 'מחיקת העסק לצמיתות',
  listSubtitle: 'ניהול בקשות מחיקה לעסקים שבבעלותך.',
  activeWarning:
    'העסק יפסיק לפעול מיד. הכרטיסים, החותמות, הלקוחות העסקיים, הצוות, הקמפיינים וההיסטוריה יימחקו לצמיתות. חשבונות הלקוחות והצוות לא יימחקו. לא ניתן לשחזר את העסק.',
  closedWarning:
    'העסק סגור כרגע. מחיקה לצמיתות תמחק את כל הנתונים שנשמרו ותבטל את אפשרות השחזור. חשבונות הלקוחות והצוות לא יימחקו.',
  canceledAccessWarning:
    'המנוי בוטל לחידוש, אך ייתכן שנותרה תקופת שימוש בתשלום. מחיקת העסק כעת תוותר על יתרת הגישה ולא ניתן לשחזר את העסק.',
  limitedRetention:
    'ייתכן שמידע טכני מצומצם ולא מזהה יישמר לזמן מוגבל לצורכי אבטחה, חיוב ובקרה.',
  continueDelete: 'המשך למחיקה',
  typedConfirmation: 'כדי לאשר, הקלידו בדיוק את שם העסק:',
  finalDelete: 'מחקו את העסק לצמיתות',
  accepted:
    'בקשת המחיקה התקבלה. העסק אינו זמין עוד והמחיקה מתבצעת ברקע.',
  completed: 'העסק נמחק לצמיתות.',
  completedSupport: 'לא ניתן לשחזר את העסק לאחר השלמת המחיקה.',
  failed: 'לא הצלחנו להשלים את מחיקת העסק.',
  failedSupport: 'העסק נשאר נעול למחיקה. ניתן לנסות שוב בבטחה.',
  retry: 'נסה שוב',
  billing:
    'יש לבטל תחילה את חידוש המנוי. לאחר שסטטוס המנוי יתעדכן ל״מבוטל״, ניתן יהיה למחוק את העסק לצמיתות.',
  manageSubscription: 'ניהול מנוי',
  subscriptionOpenFailed: 'לא הצלחנו לפתוח את ניהול המנוי. נסו שוב.',
  accountReturn:
    'העסקים נמחקו. ניתן לחזור ולהמשיך במחיקת החשבון.',
  returnToAccountDeletion: 'חזרה למחיקת החשבון',
  returnToSettings: 'חזרה להגדרות',
  returnToWallet: 'חזרה לארנק',
  unavailable: 'העסק אינו זמין.',
  unavailableSupport:
    'ייתכן שהמחיקה הושלמה, שהקישור אינו עדכני או שהעסק אינו עוד בבעלותך.',
  empty: 'אין עסקים בבעלותך שניתן לנהל כאן.',
  active: 'עסק פעיל',
  closed: 'עסק סגור',
  deleting: 'מחיקה בתהליך',
  deletionFailed: 'המחיקה נכשלה',
  preparing: 'מכינים את המחיקה',
  removing: 'מסירים נתוני העסק',
  finishing: 'מסיימים את המחיקה',
  cancel: 'ביטול',
  startDelete: 'מחיקה לצמיתות',
  authorizationError: 'אין הרשאה למחוק את העסק הזה.',
  nameMismatch: 'שם העסק שהוזן אינו תואם.',
  genericError: 'לא הצלחנו להתחיל את מחיקת העסק. ניתן לנסות שוב.',
  genericRetryError: 'לא הצלחנו להפעיל מחדש את המחיקה. ניתן לנסות שוב.',
  loading: 'טוענים את מצב המחיקה...',
};

type BusinessSnapshot = {
  businessId: Id<'businesses'>;
  name: string;
  businessExists: boolean;
  isActive?: boolean;
  billing?: {
    provider: string | null;
    status: string | null;
    endAt: number | null;
    renewalActive: boolean;
  };
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBusinessName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isDeletionJobStatus(value: unknown) {
  return value === 'queued' || value === 'running' || value === 'failed';
}

function getProgressLabel(phase: string | null | undefined) {
  if (phase === 'finalize' || phase === 'completed') {
    return TEXT.finishing;
  }
  if (
    phase == null ||
    phase.startsWith('capture_') ||
    phase === 'schedule_notifications' ||
    phase.startsWith('clear_active_')
  ) {
    return TEXT.preparing;
  }
  return TEXT.removing;
}

function errorHasCode(error: unknown, code: string) {
  return error instanceof Error && error.message.includes(code);
}

function businessRoute(
  businessId: string,
  returnToAccountDeletion: boolean
) {
  const params: {
    businessId: string;
    returnTo?: 'account-deletion';
  } = { businessId: String(businessId) };
  if (returnToAccountDeletion) {
    params.returnTo = 'account-deletion';
  }
  return {
    pathname: '/(authenticated)/business-permanent-deletion',
    params,
  } as const;
}

export default function BusinessPermanentDeletionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    businessId?: string | string[];
    returnTo?: string | string[];
  }>();
  const requestedBusinessId = firstParam(params.businessId)?.trim() || null;
  const returnToAccountDeletion =
    firstParam(params.returnTo) === 'account-deletion';

  const businesses = useQuery(
    api.businessDeletion.listMyBusinessesForPermanentDeletion
  );
  const requestDeletion = useMutation(
    api.businessDeletion.deleteBusinessPermanently
  );
  const retryDeletion = useMutation(
    api.businessDeletion.retryPermanentBusinessDeletion
  );

  const [warningAccepted, setWarningAccepted] = useState(false);
  const [confirmationName, setConfirmationName] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [retryingJobId, setRetryingJobId] =
    useState<Id<'businessDeletionJobs'> | null>(null);
  const [businessSnapshot, setBusinessSnapshot] =
    useState<BusinessSnapshot | null>(null);
  const [knownJob, setKnownJob] = useState<{
    businessId: string;
    jobId: Id<'businessDeletionJobs'>;
    status: string;
    phase: string;
  } | null>(null);
  const requestInFlightRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const lastRequestedBusinessIdRef = useRef(requestedBusinessId);

  useEffect(() => {
    if (lastRequestedBusinessIdRef.current === requestedBusinessId) {
      return;
    }
    lastRequestedBusinessIdRef.current = requestedBusinessId;
    setWarningAccepted(false);
    setConfirmationName('');
    setRequestError(null);
    setBusinessSnapshot(null);
    setKnownJob(null);
  }, [requestedBusinessId]);

  const selectedBusiness = useMemo(
    () =>
      requestedBusinessId
        ? businesses?.find(
            (business) => String(business.businessId) === requestedBusinessId
          ) ?? null
        : null,
    [businesses, requestedBusinessId]
  );

  useEffect(() => {
    if (!selectedBusiness || !requestedBusinessId) {
      return;
    }
    setBusinessSnapshot({
      businessId: selectedBusiness.businessId,
      name: selectedBusiness.name,
      businessExists: selectedBusiness.businessExists,
      isActive: selectedBusiness.isActive,
      billing: selectedBusiness.billing,
    });
    if (selectedBusiness.permanentDeletionJobId) {
      setKnownJob({
        businessId: requestedBusinessId,
        jobId: selectedBusiness.permanentDeletionJobId,
        status: selectedBusiness.permanentDeletionJobStatus ?? 'queued',
        phase: selectedBusiness.permanentDeletionPhase ?? 'capture_customers',
      });
    }
  }, [requestedBusinessId, selectedBusiness]);

  const displayBusiness =
    selectedBusiness ??
    (businessSnapshot &&
    String(businessSnapshot.businessId) === requestedBusinessId
      ? businessSnapshot
      : null);
  const jobId =
    selectedBusiness?.permanentDeletionJobId ??
    (knownJob?.businessId === requestedBusinessId ? knownJob.jobId : null);
  const job = useQuery(
    api.businessDeletion.getPermanentBusinessDeletionStatus,
    jobId ? { jobId } : 'skip'
  );
  useEffect(() => {
    if (!job || !jobId || !requestedBusinessId) {
      return;
    }
    setKnownJob((current) => {
      if (
        current?.businessId === requestedBusinessId &&
        current.jobId === jobId &&
        current.status === job.status &&
        current.phase === job.phase
      ) {
        return current;
      }
      return {
        businessId: requestedBusinessId,
        jobId,
        status: job.status,
        phase: job.phase,
      };
    });
  }, [job, jobId, requestedBusinessId]);
  const effectiveJobStatus =
    job?.status ??
    selectedBusiness?.permanentDeletionJobStatus ??
    (knownJob?.businessId === requestedBusinessId ? knownJob.status : null);
  const effectiveJobPhase =
    job?.phase ??
    selectedBusiness?.permanentDeletionPhase ??
    (knownJob?.businessId === requestedBusinessId ? knownJob.phase : null);
  const hasExistingJob = Boolean(jobId && effectiveJobStatus);
  const billingBlocked =
    displayBusiness?.billing?.renewalActive === true ||
    requestError === TEXT.billing;
  const hasCanceledPaidTime =
    displayBusiness?.billing?.status === 'canceled' &&
    displayBusiness.billing.endAt != null &&
    displayBusiness.billing.endAt > Date.now();
  const nameMatches =
    displayBusiness != null &&
    normalizeBusinessName(confirmationName) ===
      normalizeBusinessName(displayBusiness.name);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(
      returnToAccountDeletion
        ? '/(authenticated)/(customer)/settings'
        : '/(authenticated)/(customer)/wallet'
    );
  };

  const returnAfterCompletion = () => {
    if (returnToAccountDeletion) {
      router.replace({
        pathname: '/(authenticated)/business-permanent-deletion',
        params: { returnTo: 'account-deletion' },
      });
      return;
    }
    router.replace('/(authenticated)/(customer)/wallet');
  };

  const resumeAccountDeletion = () => {
    router.replace(
      '/(authenticated)/(customer)/settings?resumeAccountDeletion=true'
    );
  };

  const handleManageSubscription = async () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : Platform.OS === 'android'
          ? 'https://play.google.com/store/account/subscriptions'
          : null;
    if (!url) {
      Alert.alert(TEXT.subscriptionOpenFailed);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(TEXT.subscriptionOpenFailed);
    }
  };

  const handleRetry = async (targetJobId: Id<'businessDeletionJobs'>) => {
    if (retryInFlightRef.current) {
      return;
    }
    retryInFlightRef.current = true;
    setRetryingJobId(targetJobId);
    setRequestError(null);
    try {
      const result = await retryDeletion({ jobId: targetJobId });
      if (requestedBusinessId) {
        setKnownJob({
          businessId: requestedBusinessId,
          jobId: targetJobId,
          status: result.status,
          phase: result.phase,
        });
      }
    } catch (error) {
      setRequestError(
        errorHasCode(error, 'NOT_AUTHORIZED')
          ? TEXT.authorizationError
          : TEXT.genericRetryError
      );
    } finally {
      retryInFlightRef.current = false;
      setRetryingJobId(null);
    }
  };

  const handleFinalDelete = async () => {
    if (
      !selectedBusiness ||
      selectedBusiness.businessExists === false ||
      !nameMatches ||
      requestInFlightRef.current ||
      billingBlocked
    ) {
      return;
    }
    requestInFlightRef.current = true;
    setRequesting(true);
    setRequestError(null);
    try {
      const result = await requestDeletion({
        businessId: selectedBusiness.businessId,
        confirmationBusinessName: confirmationName,
      });
      setBusinessSnapshot({
        businessId: selectedBusiness.businessId,
        name: selectedBusiness.name,
        businessExists: true,
        isActive: selectedBusiness.isActive,
        billing: selectedBusiness.billing,
      });
      setKnownJob({
        businessId: String(selectedBusiness.businessId),
        jobId: result.jobId,
        status: result.status,
        phase: result.phase,
      });
    } catch (error) {
      if (errorHasCode(error, 'BUSINESS_SUBSCRIPTION_RENEWAL_ACTIVE')) {
        setRequestError(TEXT.billing);
      } else if (
        errorHasCode(error, 'BUSINESS_NAME_CONFIRMATION_MISMATCH')
      ) {
        setRequestError(TEXT.nameMismatch);
      } else if (errorHasCode(error, 'NOT_AUTHORIZED')) {
        setRequestError(TEXT.authorizationError);
      } else if (
        errorHasCode(error, 'BUSINESS_PERMANENT_DELETION_IN_PROGRESS')
      ) {
        setRequestError(TEXT.loading);
      } else {
        setRequestError(TEXT.genericError);
      }
    } finally {
      requestInFlightRef.current = false;
      setRequesting(false);
    }
  };

  const renderStatus = () => {
    if (jobId && job === undefined && !effectiveJobStatus) {
      return (
        <View style={styles.centerCard}>
          <ActivityIndicator color="#B42318" />
          <Text style={styles.centerText}>{TEXT.loading}</Text>
        </View>
      );
    }

    if (effectiveJobStatus === 'completed') {
      return (
        <View style={styles.statusCard}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#15803D" />
          <Text style={styles.completedTitle}>{TEXT.completed}</Text>
          <Text style={styles.statusBody}>{TEXT.completedSupport}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              returnToAccountDeletion
                ? TEXT.returnToAccountDeletion
                : TEXT.returnToWallet
            }
            onPress={returnAfterCompletion}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {returnToAccountDeletion
                ? TEXT.returnToAccountDeletion
                : TEXT.returnToWallet}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (effectiveJobStatus === 'failed' && jobId) {
      return (
        <View style={styles.statusCard}>
          <Ionicons name="alert-circle-outline" size={32} color="#B42318" />
          <Text style={styles.failedTitle}>{TEXT.failed}</Text>
          <Text style={styles.statusBody}>{TEXT.failedSupport}</Text>
          {requestError ? (
            <Text style={styles.errorText}>{requestError}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={TEXT.retry}
            accessibilityHint="מפעיל מחדש את בקשת מחיקת העסק"
            disabled={retryingJobId != null}
            onPress={() => void handleRetry(jobId)}
            style={({ pressed }) => [
              styles.dangerButton,
              pressed ? styles.pressed : null,
              retryingJobId ? styles.disabled : null,
            ]}
          >
            {retryingJobId ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.dangerButtonText}>{TEXT.retry}</Text>
            )}
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.statusCard}>
        <ActivityIndicator color="#B42318" />
        <Text style={styles.progressTitle}>
          {getProgressLabel(effectiveJobPhase)}
        </Text>
        <Text style={styles.statusBody}>{TEXT.accepted}</Text>
      </View>
    );
  };

  const renderList = () => {
    if (businesses === undefined) {
      return (
        <View style={styles.centerCard}>
          <ActivityIndicator color="#B42318" />
          <Text style={styles.centerText}>{TEXT.loading}</Text>
        </View>
      );
    }

    if (businesses.length === 0) {
      return (
        <View style={styles.centerCard}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#15803D" />
          <Text style={styles.emptyTitle}>
            {returnToAccountDeletion ? TEXT.accountReturn : TEXT.empty}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              returnToAccountDeletion
                ? TEXT.returnToAccountDeletion
                : TEXT.returnToSettings
            }
            onPress={
              returnToAccountDeletion ? resumeAccountDeletion : goBack
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {returnToAccountDeletion
                ? TEXT.returnToAccountDeletion
                : TEXT.returnToSettings}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.businessList}>
        {businesses.map((business) => {
          const status = business.permanentDeletionJobStatus;
          const isFailed = status === 'failed';
          const isDeleting = isDeletionJobStatus(status);
          const canStartNewDeletion =
            business.businessExists === true && !isDeleting;
          return (
            <View key={String(business.businessId)} style={styles.businessCard}>
              <View style={styles.businessCardHeader}>
                <View style={styles.businessIcon}>
                  <Ionicons name="storefront-outline" size={22} color="#7F1D1D" />
                </View>
                <View style={styles.businessCopy}>
                  <Text style={styles.businessName}>{business.name}</Text>
                  <Text
                    style={isFailed ? styles.failedBadge : styles.lifecycleText}
                  >
                    {isFailed
                      ? TEXT.deletionFailed
                      : isDeleting
                        ? TEXT.deleting
                        : business.isActive
                          ? TEXT.active
                          : TEXT.closed}
                  </Text>
                </View>
              </View>

              {isDeleting ? (
                <Text style={styles.cardStatusText}>
                  {isFailed
                    ? TEXT.failedSupport
                    : getProgressLabel(business.permanentDeletionPhase)}
                </Text>
              ) : null}

              {isFailed && business.permanentDeletionJobId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${TEXT.retry}: ${business.name}`}
                  disabled={retryingJobId != null}
                  onPress={() =>
                    void handleRetry(business.permanentDeletionJobId!)
                  }
                  style={({ pressed }) => [
                    styles.dangerButton,
                    pressed ? styles.pressed : null,
                    retryingJobId ? styles.disabled : null,
                  ]}
                >
                  {retryingJobId === business.permanentDeletionJobId ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.dangerButtonText}>{TEXT.retry}</Text>
                  )}
                </Pressable>
              ) : isDeleting ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`הצגת מצב המחיקה של ${business.name}`}
                  onPress={() =>
                    router.push(
                      businessRoute(
                        business.businessId,
                        returnToAccountDeletion
                      )
                    )
                  }
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>הצגת מצב</Text>
                </Pressable>
              ) : canStartNewDeletion ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${TEXT.startDelete}: ${business.name}`}
                  accessibilityHint="פותח אזהרה ואישור נפרדים לפני מחיקה"
                  onPress={() =>
                    router.push(
                      businessRoute(
                        business.businessId,
                        returnToAccountDeletion
                      )
                    )
                  }
                  style={({ pressed }) => [
                    styles.outlineDangerButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.outlineDangerButtonText}>
                    {TEXT.startDelete}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
      </View>
    );
  };

  const renderSpecificBusiness = () => {
    if (businesses === undefined) {
      return (
        <View style={styles.centerCard}>
          <ActivityIndicator color="#B42318" />
          <Text style={styles.centerText}>{TEXT.loading}</Text>
        </View>
      );
    }

    if (hasExistingJob || jobId) {
      return renderStatus();
    }

    if (
      !displayBusiness ||
      !selectedBusiness ||
      selectedBusiness.businessExists === false
    ) {
      return (
        <View style={styles.centerCard}>
          <Ionicons name="help-circle-outline" size={32} color="#64748B" />
          <Text style={styles.emptyTitle}>{TEXT.unavailable}</Text>
          <Text style={styles.centerText}>{TEXT.unavailableSupport}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={TEXT.returnToSettings}
            onPress={goBack}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{TEXT.returnToSettings}</Text>
          </Pressable>
        </View>
      );
    }

    if (billingBlocked) {
      return (
        <View style={styles.billingCard}>
          <Ionicons name="card-outline" size={30} color="#92400E" />
          <Text style={styles.billingTitle}>{TEXT.manageSubscription}</Text>
          <Text style={styles.billingText}>{TEXT.billing}</Text>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.cancel}
              onPress={goBack}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.actionButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{TEXT.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.manageSubscription}
              accessibilityHint="פותח את ניהול המנויים של חנות האפליקציות"
              onPress={() => void handleManageSubscription()}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.actionButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {TEXT.manageSubscription}
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!warningAccepted) {
      return (
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={32} color="#B42318" />
          <Text style={styles.warningTitle}>{TEXT.title}</Text>
          <Text style={styles.warningText}>
            {displayBusiness.isActive ? TEXT.activeWarning : TEXT.closedWarning}
          </Text>
          {hasCanceledPaidTime ? (
            <Text style={styles.paidTimeWarning}>
              {TEXT.canceledAccessWarning}
            </Text>
          ) : null}
          <Text style={styles.retentionText}>{TEXT.limitedRetention}</Text>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.cancel}
              onPress={goBack}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.actionButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{TEXT.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.continueDelete}
              onPress={() => setWarningAccepted(true)}
              style={({ pressed }) => [
                styles.warningButton,
                styles.actionButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.warningButtonText}>
                {TEXT.continueDelete}
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.confirmationCard}>
        <Text style={styles.confirmationTitle}>{TEXT.typedConfirmation}</Text>
        <Text style={styles.confirmationBusinessName}>
          {displayBusiness.name}
        </Text>
        <TextInput
          value={confirmationName}
          onChangeText={setConfirmationName}
          editable={!requesting}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={displayBusiness.name}
          placeholderTextColor="#9CA3AF"
          accessibilityLabel="הקלדת שם העסק לאישור מחיקה לצמיתות"
          accessibilityHint={`יש להקליד בדיוק את שם העסק ${displayBusiness.name}`}
          style={styles.confirmationInput}
        />
        {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TEXT.finalDelete}
          accessibilityHint="מוחק לצמיתות את העסק ואת נתוני מועדון הלקוחות שלו"
          disabled={!nameMatches || requesting}
          onPress={() => void handleFinalDelete()}
          style={({ pressed }) => [
            styles.dangerButton,
            !nameMatches || requesting ? styles.disabledDangerButton : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {requesting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={[
                styles.dangerButtonText,
                !nameMatches ? styles.disabledDangerButtonText : null,
              ]}
            >
              {TEXT.finalDelete}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (insets.bottom || 0) + 32 },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#FDF2F2"
        >
          <BusinessScreenHeader
            title={TEXT.title}
            subtitle={requestedBusinessId ? undefined : TEXT.listSubtitle}
            titleAccessory={<BackButton onPress={goBack} />}
          />
        </StickyScrollHeader>

        {requestedBusinessId ? renderSpecificBusiness() : renderList()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FDF2F2',
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  centerCard: {
    minHeight: 180,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyTitle: {
    color: '#1F2937',
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  businessList: {
    gap: 12,
  },
  businessCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0CACA',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 12,
  },
  businessCardHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  businessIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCopy: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 4,
  },
  businessName: {
    width: '100%',
    color: '#172033',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  lifecycleText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  failedBadge: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardStatusText: {
    color: '#7F1D1D',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  warningCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F5B8B2',
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 13,
    alignItems: alignItems.start,
  },
  warningTitle: {
    width: '100%',
    color: '#7F1D1D',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  warningText: {
    width: '100%',
    color: '#3F3F46',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  paidTimeWarning: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    color: '#9A3412',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    padding: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  retentionText: {
    width: '100%',
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmationCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F5B8B2',
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 12,
  },
  confirmationTitle: {
    color: '#3F3F46',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmationBusinessName: {
    color: '#7F1D1D',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmationInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusCard: {
    minHeight: 210,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F0CACA',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  progressTitle: {
    color: '#7F1D1D',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  completedTitle: {
    color: '#166534',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  failedTitle: {
    color: '#B42318',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  statusBody: {
    color: '#52525B',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  billingCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    padding: 18,
    gap: 12,
    alignItems: alignItems.start,
  },
  billingTitle: {
    width: '100%',
    color: '#92400E',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  billingText: {
    width: '100%',
    color: '#78350F',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actionRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  actionButton: {
    flex: 1,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  warningButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  dangerButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#991B1B',
    backgroundColor: '#B42318',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  outlineDangerButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineDangerButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  disabled: {
    opacity: 0.55,
  },
  disabledDangerButton: {
    borderColor: '#F0CACA',
    backgroundColor: '#FEECEC',
  },
  disabledDangerButtonText: {
    color: '#9F6B68',
  },
  pressed: {
    opacity: 0.86,
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

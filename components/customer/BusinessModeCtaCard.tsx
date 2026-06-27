import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { requiresBusinessOnboardingForRole } from '@/lib/activeBusinessShell';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

const TEXT = {
  hostTitle: 'רוצים לצרף את העסק שלכם?',
  hostSubtitle: 'הפעילו כרטיס נאמנות דיגיטלי והתחילו לצבור לקוחות חוזרים',
  hostButton: 'צור פרופיל לעסק שלך',
  existingBusinessSubtitle:
    'הפרופיל העסקי שלכם כבר מוכן. בלחיצה תעברו ישיר לניהול העסק',
  existingBusinessSetupSubtitle:
    'הפרופיל של העסק כבר נפתח. בלחיצה תמשיכו להשלמת ההגדרה',
  switchToBusinessButton: 'מעבר לעסק',
  switchToCustomerTitle: 'חזרה למצב לקוח',
  switchToCustomerSubtitle: 'מעבר מהיר לארנק ולהטבות האישיות שלכם',
  switchToCustomerButton: 'מעבר ללקוח',
  switchModeFailed: 'לא הצלחנו לעדכן מצב משתמש נסו שוב',
  errorTitle: 'שגיאה',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

function formatSwitchToBusinessTitle(businessName: string) {
  return `מעבר לעסק ${businessName}`;
}

function canAccessBusinessMode(staffRole: 'owner' | 'manager' | 'staff') {
  return resolveBusinessCapabilities(null, staffRole).access_dashboard === true;
}

type BusinessModeCtaCardProps = {
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accentButton?: boolean;
  forcePromotionalBanner?: boolean;
};

export default function BusinessModeCtaCard({
  disabled = false,
  style,
  accentButton = false,
  forcePromotionalBanner = false,
}: BusinessModeCtaCardProps) {
  const setActiveMode = useMutation(api.users.setActiveMode);
  const setActiveBusiness = useMutation(api.users.setActiveBusiness);
  const { appMode, setAppMode, isLoading: isAppModeLoading } = useAppMode();
  const sessionContext = useSessionContext();
  const [modeSwitchBusy, setModeSwitchBusy] = useState(false);
  const hostButtonScale = useRef(new Animated.Value(1)).current;

  const bizList = sessionContext?.businesses ?? [];
  const manageableBusinesses = bizList.filter((business) =>
    canAccessBusinessMode(business.staffRole)
  );
  const ownedBusinesses = manageableBusinesses.filter(
    (business) => business.staffRole === 'owner'
  );
  const activeManagedBusiness =
    (sessionContext?.activeBusinessId
      ? manageableBusinesses.find(
          (business) =>
            String(business.id) === String(sessionContext.activeBusinessId)
        )
      : null) ?? null;
  const targetBusinessForBusinessMode =
    activeManagedBusiness ??
    ownedBusinesses[0] ??
    manageableBusinesses[0] ??
    null;
  const hasManageableBusiness = manageableBusinesses.length > 0;
  const hasOwnedBusiness = ownedBusinesses.length > 0;
  const manageableBusinessName =
    targetBusinessForBusinessMode?.name.trim() ?? '';
  const hasNamedManagedBusiness = manageableBusinessName.length > 0;
  const businessOnboarded =
    (sessionContext?.user?.businessOnboardedAt ?? null) != null;
  const targetBusinessRequiresOnboarding = requiresBusinessOnboardingForRole(
    targetBusinessForBusinessMode?.staffRole ?? null,
    businessOnboarded
  );
  const shouldStartBusinessOnboarding =
    !hasManageableBusiness || targetBusinessRequiresOnboarding;
  const showExistingBusinessCta = hasNamedManagedBusiness;
  const isBusinessMode = appMode === 'business';
  // On discovery we keep the promotional banner for users who don't own a
  // business, even if they can access one as managers. Existing business access
  // is presented in customer settings, not inside the banner itself.
  const showPromotionalBanner =
    forcePromotionalBanner && !isBusinessMode && !hasOwnedBusiness;
  const hostActionDisabled = disabled || isAppModeLoading || modeSwitchBusy;
  const hostTitle =
    !showPromotionalBanner && showExistingBusinessCta
      ? formatSwitchToBusinessTitle(manageableBusinessName)
      : TEXT.hostTitle;
  const hostSubtitle =
    !showPromotionalBanner && showExistingBusinessCta
      ? shouldStartBusinessOnboarding
        ? TEXT.existingBusinessSetupSubtitle
        : TEXT.existingBusinessSubtitle
      : TEXT.hostSubtitle;
  const hostButtonLabel =
    !showPromotionalBanner && showExistingBusinessCta
      ? TEXT.switchToBusinessButton
      : TEXT.hostButton;
  const shouldUseAccentButton = !isBusinessMode || accentButton;

  useEffect(() => {
    if (isBusinessMode || hostActionDisabled) {
      hostButtonScale.stopAnimation();
      hostButtonScale.setValue(1);
      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(hostButtonScale, {
          toValue: 1.12,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(hostButtonScale, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
      hostButtonScale.stopAnimation();
      hostButtonScale.setValue(1);
    };
  }, [hostActionDisabled, hostButtonScale, isBusinessMode]);

  const handleSwitchToBusiness = async () => {
    const selectedBusiness = showPromotionalBanner
      ? null
      : targetBusinessForBusinessMode;
    if (hostActionDisabled) {
      return;
    }

    try {
      setModeSwitchBusy(true);

      if (selectedBusiness) {
        await setActiveBusiness({
          businessId: selectedBusiness.id,
        });
      }

      const shouldOpenOnboarding =
        selectedBusiness == null ||
        requiresBusinessOnboardingForRole(
          selectedBusiness.staffRole,
          businessOnboarded
        );

      if (shouldOpenOnboarding) {
        await setAppMode('business');
        if (selectedBusiness) {
          await setActiveMode({ mode: 'business' });
        }
        router.replace(BUSINESS_ONBOARDING_ROUTES.entry);
        return;
      }

      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      router.navigate('/(authenticated)/(business)/dashboard');
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.switchModeFailed)
      );
    } finally {
      setModeSwitchBusy(false);
    }
  };

  const handleSwitchToCustomer = async () => {
    if (hostActionDisabled) {
      return;
    }

    try {
      setModeSwitchBusy(true);
      await setAppMode('customer');
      router.replace('/(authenticated)/(customer)/wallet');
      void setActiveMode({ mode: 'customer' }).catch(async (error) => {
        await setAppMode('business');
        router.replace('/(authenticated)/(business)/dashboard');
        Alert.alert(
          TEXT.errorTitle,
          toErrorMessage(error, TEXT.switchModeFailed)
        );
      });
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.switchModeFailed)
      );
    } finally {
      setModeSwitchBusy(false);
    }
  };

  return (
    <View style={[styles.hostFrame, style]}>
      <Pressable
        onPress={
          isBusinessMode ? handleSwitchToCustomer : handleSwitchToBusiness
        }
        disabled={hostActionDisabled}
        style={({ pressed }) => [
          styles.hostCard,
          pressed ? styles.pressed : null,
          hostActionDisabled ? styles.disabled : null,
        ]}
      >
        <View style={styles.hostCardInner}>
          <View style={styles.hostIconShell}>
            <Ionicons
              name={isBusinessMode ? 'person-outline' : 'storefront-outline'}
              size={22}
              color="#111827"
            />
          </View>

          <View style={styles.hostTextWrap}>
            <Text style={styles.hostTitle} numberOfLines={2}>
              {isBusinessMode ? TEXT.switchToCustomerTitle : hostTitle}
            </Text>
            <Text style={styles.hostSubtitle} numberOfLines={3}>
              {isBusinessMode ? TEXT.switchToCustomerSubtitle : hostSubtitle}
            </Text>

            <Animated.View
              style={[
                styles.hostButton,
                shouldUseAccentButton ? styles.hostButtonAccent : null,
                !isBusinessMode
                  ? { transform: [{ scale: hostButtonScale }] }
                  : null,
              ]}
            >
              {modeSwitchBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.hostButtonText}>
                    {isBusinessMode
                      ? TEXT.switchToCustomerButton
                      : hostButtonLabel}
                  </Text>
                  <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
                </>
              )}
            </Animated.View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  hostFrame: {
    borderWidth: 2,
    borderColor: '#9DB6FF',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 6,
  },

  hostCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  hostCardInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  hostIconShell: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostTextWrap: { flex: 1, alignItems: alignItems.start, gap: 7 },
  hostTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
  },
  hostSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#52525B',
    textAlign: 'right',
  },
  hostButton: {
    marginTop: 2,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 118,
    ...rtlBaseView,
  },
  hostButtonAccent: {
    minWidth: 168,
    paddingHorizontal: 20,
    backgroundColor: '#2F6BFF',
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  hostButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

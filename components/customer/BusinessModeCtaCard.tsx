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

const TEXT = {
  hostTitle:
    '\u05e8\u05d5\u05e6\u05d9\u05dd \u05dc\u05e6\u05e8\u05e3 \u05d0\u05ea \u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc\u05db\u05dd?',
  hostSubtitle:
    '\u05d4\u05e4\u05e2\u05d9\u05dc\u05d5 \u05db\u05e8\u05d8\u05d9\u05e1 \u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9 \u05d5\u05d4\u05ea\u05d7\u05d9\u05dc\u05d5 \u05dc\u05e6\u05d1\u05d5\u05e8 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d7\u05d5\u05d6\u05e8\u05d9\u05dd',
  hostButton:
    '\u05e6\u05d5\u05e8 \u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05dc\u05e2\u05e1\u05e7 \u05e9\u05dc\u05da',
  existingBusinessSubtitle:
    '\u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05d4\u05e2\u05e1\u05e7\u05d9 \u05e9\u05dc\u05db\u05dd \u05db\u05d1\u05e8 \u05de\u05d5\u05db\u05df. \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4 \u05ea\u05e2\u05d1\u05e8\u05d5 \u05d9\u05e9\u05d9\u05e8 \u05dc\u05e0\u05d9\u05d4\u05d5\u05dc \u05d4\u05e2\u05e1\u05e7',
  existingBusinessSetupSubtitle:
    '\u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e9\u05dc \u05d4\u05e2\u05e1\u05e7 \u05db\u05d1\u05e8 \u05e0\u05e4\u05ea\u05d7. \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4 \u05ea\u05de\u05e9\u05d9\u05db\u05d5 \u05dc\u05d4\u05e9\u05dc\u05de\u05ea \u05d4\u05d4\u05d2\u05d3\u05e8\u05d4',
  switchToBusinessButton: '\u05de\u05e2\u05d1\u05e8 \u05dc\u05e2\u05e1\u05e7',
  switchToCustomerTitle:
    '\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e6\u05d1 \u05dc\u05e7\u05d5\u05d7',
  switchToCustomerSubtitle:
    '\u05de\u05e2\u05d1\u05e8 \u05de\u05d4\u05d9\u05e8 \u05dc\u05d0\u05e8\u05e0\u05e7 \u05d5\u05dc\u05d4\u05d8\u05d1\u05d5\u05ea \u05d4\u05d0\u05d9\u05e9\u05d9\u05d5\u05ea \u05e9\u05dc\u05db\u05dd',
  switchToCustomerButton:
    '\u05de\u05e2\u05d1\u05e8 \u05dc\u05dc\u05e7\u05d5\u05d7',
  switchModeFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e2\u05d3\u05db\u05df \u05de\u05e6\u05d1 \u05de\u05e9\u05ea\u05de\u05e9 \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
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
  return `\u05de\u05e2\u05d1\u05e8 \u05dc\u05e2\u05e1\u05e7 ${businessName}`;
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
  const manageableBusiness =
    bizList.find((business) => canAccessBusinessMode(business.staffRole)) ??
    null;
  const activeManagedBusiness =
    (sessionContext?.activeBusinessId
      ? bizList.find(
          (business) =>
            String(business.id) === String(sessionContext.activeBusinessId) &&
            canAccessBusinessMode(business.staffRole)
        )
      : null) ?? null;
  const targetBusinessForBusinessMode =
    activeManagedBusiness ?? manageableBusiness;
  const hasOwnerOrManager = manageableBusiness != null;
  const manageableBusinessName = manageableBusiness?.name.trim() ?? '';
  const hasNamedManagedBusiness = manageableBusinessName.length > 0;
  const businessOnboarded =
    (sessionContext?.user?.businessOnboardedAt ?? null) != null;
  const targetBusinessRequiresOnboarding = requiresBusinessOnboardingForRole(
    targetBusinessForBusinessMode?.staffRole ?? null,
    businessOnboarded
  );
  const shouldStartBusinessOnboarding =
    !hasOwnerOrManager || targetBusinessRequiresOnboarding;
  const showExistingBusinessCta = hasNamedManagedBusiness;
  const isBusinessMode = appMode === 'business';
  const showPromotionalBanner = forcePromotionalBanner && !isBusinessMode;
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
    if (hostActionDisabled) {
      return;
    }

    try {
      setModeSwitchBusy(true);

      if (!showPromotionalBanner && targetBusinessForBusinessMode) {
        await setActiveBusiness({
          businessId: targetBusinessForBusinessMode.id,
        });
      }

      if (showPromotionalBanner || shouldStartBusinessOnboarding) {
        await setAppMode('business');
        if (hasOwnerOrManager && !showPromotionalBanner) {
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
      await setActiveMode({ mode: 'customer' });
      await setAppMode('customer');
      router.navigate('/(authenticated)/(customer)/wallet');
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  hostIconShell: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostTextWrap: { flex: 1, alignItems: 'flex-end', gap: 7 },
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 118,
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
  },
});

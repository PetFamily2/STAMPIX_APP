import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import RedemptionBusinessMark from '@/components/customer/RedemptionBusinessMark';
import RedemptionShareCard from '@/components/customer/RedemptionShareCard';
import { useRedemptionShare } from '@/hooks/useRedemptionShare';
import {
  buildRedemptionPresentation,
  type RedemptionPresentation,
  type RedemptionPresentationInput,
} from '@/lib/redemptionPresentation';
import type { RedemptionShareError } from '@/lib/redemptionShare';
import {
  alignItems,
  flexDirection,
  rtlAutoText,
  rtlBaseText,
  selfStart,
} from '@/lib/rtl';

type RedemptionCelebrationProps = {
  source: RedemptionPresentationInput;
  style?: StyleProp<ViewStyle>;
};

type RedemptionCelebrationViewProps = {
  presentation: RedemptionPresentation;
  artboardRef: RefObject<View | null>;
  isSharing: boolean;
  shareError: RedemptionShareError | null;
  onSharePress: () => void;
  style?: StyleProp<ViewStyle>;
};

const STATE_ICONS = {
  expired: 'time-outline',
  revoked: 'close-circle-outline',
  unavailable: 'cloud-offline-outline',
} as const;

const SHARE_ERRORS = {
  'sharing-unavailable': 'השיתוף אינו זמין במכשיר הזה כרגע.',
  'capture-failed': 'לא הצלחנו להכין את כרטיס השיתוף. אפשר לנסות שוב.',
  'native-share-failed': 'לא הצלחנו לפתוח את השיתוף. אפשר לנסות שוב.',
} as const satisfies Record<RedemptionShareError, string>;

function CelebrationDetails({
  presentation,
}: {
  presentation: RedemptionPresentation;
}) {
  return (
    <View style={styles.detailsCard}>
      <View style={styles.decorations} accessible={false}>
        <View
          style={[
            styles.decorativeDot,
            styles.decorativeDotTop,
            { backgroundColor: presentation.palette.accent },
          ]}
        />
        <View
          style={[
            styles.decorativeDot,
            styles.decorativeDotBottom,
            { backgroundColor: presentation.palette.accent },
          ]}
        />
      </View>

      <View
        style={[
          styles.successIcon,
          {
            borderColor: presentation.palette.accent,
            backgroundColor: presentation.palette.glow,
          },
        ]}
        accessible={false}
      >
        <Ionicons
          name="checkmark"
          size={38}
          color={presentation.palette.accent}
        />
      </View>

      <Text style={styles.eyebrow} maxFontSizeMultiplier={1.5}>
        {presentation.copy.eyebrow}
      </Text>
      <Text style={styles.title} maxFontSizeMultiplier={1.5}>
        {presentation.copy.title}
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={1.6}>
        {presentation.copy.body}
      </Text>

      <View style={styles.businessRewardCard}>
        <View style={styles.businessRow}>
          <RedemptionBusinessMark
            businessName={presentation.businessName}
            businessLogoUrl={presentation.businessLogoUrl}
            businessMonogram={presentation.businessMonogram}
            size={58}
            color={presentation.palette.onSurface}
            borderColor={presentation.palette.keyline}
            backgroundColor={presentation.palette.surface}
          />
          <View style={styles.businessCopy}>
            <Text
              style={styles.businessName}
              numberOfLines={2}
              maxFontSizeMultiplier={1.5}
            >
              {presentation.businessName}
            </Text>
            {presentation.programDisplayName ? (
              <Text
                style={styles.programName}
                numberOfLines={2}
                maxFontSizeMultiplier={1.5}
              >
                {presentation.programDisplayName}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.rewardDivider} />
        <Text style={styles.rewardLabel} maxFontSizeMultiplier={1.5}>
          {presentation.copy.benefitLabel}
        </Text>
        <Text
          style={styles.rewardName}
          numberOfLines={4}
          maxFontSizeMultiplier={1.5}
        >
          {presentation.rewardDisplayName}
        </Text>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View
      style={styles.stateCard}
      accessible={true}
      accessibilityLabel="מכינים את רגע המימוש"
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color="#2F6BFF" />
      <Text style={styles.stateTitle} maxFontSizeMultiplier={1.5}>
        מכינים את רגע המימוש
      </Text>
      <Text style={styles.stateBody} maxFontSizeMultiplier={1.6}>
        הפרטים יופיעו כאן מיד.
      </Text>
      <View style={styles.skeletonGroup} accessible={false}>
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLineShort} />
        <View style={styles.skeletonPanel} />
      </View>
    </View>
  );
}

function UnavailableState({
  presentation,
}: {
  presentation: RedemptionPresentation;
}) {
  const state =
    presentation.state === 'normal' || presentation.state === 'loading'
      ? 'unavailable'
      : presentation.state;

  return (
    <View
      style={styles.stateCard}
      accessible={true}
      accessibilityLabel={presentation.accessibilityLabel}
    >
      <View style={styles.stateIcon}>
        <Ionicons name={STATE_ICONS[state]} size={34} color="#52627A" />
      </View>
      <Text style={styles.stateEyebrow} maxFontSizeMultiplier={1.5}>
        {presentation.copy.eyebrow}
      </Text>
      <Text style={styles.stateTitle} maxFontSizeMultiplier={1.5}>
        {presentation.copy.title}
      </Text>
      <Text style={styles.stateBody} maxFontSizeMultiplier={1.6}>
        {presentation.copy.body}
      </Text>

      <View style={styles.stateBusinessRow}>
        <RedemptionBusinessMark
          businessName={presentation.businessName}
          businessLogoUrl={presentation.businessLogoUrl}
          businessMonogram={presentation.businessMonogram}
          size={48}
          color="#FFFFFF"
          borderColor="#C9D8F5"
          backgroundColor={presentation.palette.surface}
        />
        <View style={styles.stateBusinessCopy}>
          <Text
            style={styles.stateBusinessName}
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
          >
            {presentation.businessName}
          </Text>
          <Text
            style={styles.stateRewardName}
            numberOfLines={3}
            maxFontSizeMultiplier={1.5}
          >
            {presentation.rewardDisplayName}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function RedemptionCelebrationView({
  presentation,
  artboardRef,
  isSharing,
  shareError,
  onSharePress,
  style,
}: RedemptionCelebrationViewProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isNarrow = width < 360;

  if (presentation.state === 'loading') {
    return (
      <View style={[styles.staticRoot, style]}>
        <LoadingState />
      </View>
    );
  }

  if (!presentation.canShare) {
    return (
      <View style={[styles.staticRoot, style]}>
        <UnavailableState presentation={presentation} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, style]}
      contentContainerStyle={[
        styles.content,
        isNarrow ? styles.contentNarrow : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.normalLayout,
          isTablet ? styles.normalLayoutTablet : null,
        ]}
      >
        <View
          style={[
            styles.detailsColumn,
            isTablet ? styles.detailsColumnTablet : null,
          ]}
        >
          <CelebrationDetails presentation={presentation} />
        </View>

        <View
          style={[
            styles.shareColumn,
            isTablet ? styles.shareColumnTablet : null,
          ]}
        >
          <View style={styles.shareHeading}>
            <Text style={styles.shareTitle} maxFontSizeMultiplier={1.5}>
              כרטיס מוכן לשיתוף
            </Text>
            <Text style={styles.shareSubtitle} maxFontSizeMultiplier={1.6}>
              תצוגת 9:16 שמתאימה לסטורי ושומרת על הפרטיות שלך.
            </Text>
          </View>

          <RedemptionShareCard ref={artboardRef} presentation={presentation} />

          <Pressable
            onPress={onSharePress}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel={presentation.copy.shareButton}
            accessibilityHint="פותח את אפשרויות השיתוף במכשיר"
            accessibilityState={{ disabled: isSharing, busy: isSharing }}
            style={({ pressed }) => [
              styles.shareButton,
              pressed ? styles.shareButtonPressed : null,
              isSharing ? styles.shareButtonDisabled : null,
            ]}
          >
            {isSharing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="share-outline" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.shareButtonText} maxFontSizeMultiplier={1.4}>
              {isSharing
                ? presentation.copy.sharingButton
                : presentation.copy.shareButton}
            </Text>
          </Pressable>

          <View style={styles.privacyRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color="#52627A"
            />
            <Text style={styles.shareHint} maxFontSizeMultiplier={1.5}>
              {presentation.copy.shareHint}
            </Text>
          </View>

          {shareError ? (
            <View
              style={styles.errorCard}
              accessibilityRole="alert"
              accessible={true}
            >
              <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>
                {SHARE_ERRORS[shareError]}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

export default function RedemptionCelebration({
  source,
  style,
}: RedemptionCelebrationProps) {
  const presentation = buildRedemptionPresentation(source);
  const { artboardRef, isSharing, shareError, share } = useRedemptionShare({
    enabled: presentation.canShare,
  });

  return (
    <RedemptionCelebrationView
      presentation={presentation}
      artboardRef={artboardRef}
      isSharing={isSharing}
      shareError={shareError}
      onSharePress={() => {
        void share();
      }}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  staticRoot: {
    flex: 1,
    backgroundColor: '#E9F0FF',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  contentNarrow: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  normalLayout: {
    gap: 24,
  },
  normalLayoutTablet: {
    flexDirection: flexDirection.row,
    alignItems: 'flex-start',
    gap: 28,
  },
  detailsColumn: {
    width: '100%',
  },
  detailsColumnTablet: {
    flex: 1,
    minWidth: 0,
  },
  shareColumn: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 14,
  },
  shareColumnTablet: {
    flexBasis: 380,
    flexGrow: 0,
    flexShrink: 1,
  },
  detailsCard: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#D3E0FA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: alignItems.start,
    gap: 9,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  decorations: {
    ...StyleSheet.absoluteFillObject,
  },
  decorativeDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.65,
  },
  decorativeDotTop: {
    top: 32,
    left: 34,
  },
  decorativeDotBottom: {
    top: 88,
    left: 72,
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.35,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  eyebrow: {
    width: '100%',
    ...rtlBaseText,
    color: '#2F6BFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  title: {
    width: '100%',
    ...rtlBaseText,
    color: '#0F172A',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  body: {
    width: '100%',
    ...rtlBaseText,
    color: '#52627A',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  businessRewardCard: {
    width: '100%',
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    backgroundColor: '#F8FAFF',
    padding: 16,
    gap: 8,
  },
  businessRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
  },
  businessCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
  },
  businessName: {
    width: '100%',
    ...rtlAutoText,
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  programName: {
    width: '100%',
    ...rtlBaseText,
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  rewardDivider: {
    height: 1,
    backgroundColor: '#DCE6F7',
    marginVertical: 4,
  },
  rewardLabel: {
    width: '100%',
    ...rtlBaseText,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  rewardName: {
    width: '100%',
    ...rtlAutoText,
    color: '#1E3A8A',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },
  shareHeading: {
    alignItems: alignItems.start,
    gap: 3,
  },
  shareTitle: {
    width: '100%',
    ...rtlBaseText,
    color: '#0F172A',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
  },
  shareSubtitle: {
    width: '100%',
    ...rtlBaseText,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  shareButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  shareButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  shareButtonDisabled: {
    backgroundColor: '#8EABEB',
  },
  shareButtonText: {
    ...rtlBaseText,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
  },
  privacyRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    alignSelf: selfStart,
    gap: 6,
  },
  shareHint: {
    flexShrink: 1,
    ...rtlBaseText,
    color: '#52627A',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1B8B2',
    backgroundColor: '#FFF5F4',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    width: '100%',
    ...rtlBaseText,
    color: '#9F2D23',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  stateCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#D3E0FA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 30,
    alignItems: alignItems.start,
    gap: 9,
  },
  stateIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  stateEyebrow: {
    width: '100%',
    ...rtlBaseText,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  stateTitle: {
    width: '100%',
    ...rtlBaseText,
    color: '#0F172A',
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
  },
  stateBody: {
    width: '100%',
    ...rtlBaseText,
    color: '#52627A',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
  },
  stateBusinessRow: {
    width: '100%',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 11,
  },
  stateBusinessCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
  },
  stateBusinessName: {
    width: '100%',
    ...rtlAutoText,
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  stateRewardName: {
    width: '100%',
    ...rtlAutoText,
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  skeletonGroup: {
    width: '100%',
    marginTop: 16,
    gap: 10,
  },
  skeletonLineWide: {
    width: '78%',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E1E8F4',
    alignSelf: selfStart,
  },
  skeletonLineShort: {
    width: '52%',
    height: 11,
    borderRadius: 6,
    backgroundColor: '#E1E8F4',
    alignSelf: selfStart,
  },
  skeletonPanel: {
    width: '100%',
    height: 108,
    borderRadius: 18,
    backgroundColor: '#EDF2F9',
    marginTop: 5,
  },
});

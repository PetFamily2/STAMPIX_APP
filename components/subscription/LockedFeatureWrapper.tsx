import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

export type RequiredPlan = 'starter' | 'pro' | 'premium' | null;

export type FeatureGateProps = {
  isLocked: boolean;
  requiredPlan?: RequiredPlan;
  onUpgradeClick?: () => void;
  title?: string;
  subtitle?: string;
  benefits?: string[];
  style?: ViewStyle;
  children: ReactNode;
};

const PLAN_LABEL: Record<'starter' | 'pro' | 'premium', string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  premium: 'Premium AI',
};

export function FeatureGate({
  isLocked,
  requiredPlan = null,
  onUpgradeClick,
  title = 'פיצר נעול במסלול הנוכחי',
  subtitle,
  benefits,
  style,
  children,
}: FeatureGateProps) {
  const requiredLabel = requiredPlan ? PLAN_LABEL[requiredPlan] : null;
  const resolvedSubtitle =
    subtitle ??
    (requiredLabel
      ? `זמין במסלול ${requiredLabel} ומעלה`
      : 'שדרגו כדי לפתוח את האפשרות הזו');

  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>{children}</View>
      {isLocked ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <BlurView
            intensity={35}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.scrim} />
          <View style={styles.lockCard}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={18} color="#1E3A8A" />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
            {Array.isArray(benefits) && benefits.length > 0 ? (
              <View style={styles.benefits}>
                {benefits.slice(0, 3).map((benefit) => (
                  <Text key={benefit} style={styles.benefitText}>
                    - {benefit}
                  </Text>
                ))}
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="שדרגו"
              onPress={onUpgradeClick}
              style={({ pressed }) => [
                styles.upgradeButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.upgradeButtonText}>שדרגו</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const LockedFeatureWrapper = FeatureGate;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
  },
  content: {
    minHeight: 64,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  lockCard: {
    width: '86%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE6F8',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 17,
  },
  benefits: {
    marginTop: 2,
    gap: 2,
    alignSelf: 'stretch',
  },
  benefitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right',
  },
  upgradeButton: {
    marginTop: 4,
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
});

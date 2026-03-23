import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import {
  DASHBOARD_CARD_STATES,
  DASHBOARD_TOKENS,
} from '@/lib/design/dashboardTokens';

type CardTone = 'default' | 'muted' | 'hero' | 'insight' | 'alert' | 'locked';

const toneStyle: Record<CardTone, ViewStyle> = {
  default: {
    backgroundColor: DASHBOARD_CARD_STATES.default.backgroundColor,
    borderColor: DASHBOARD_CARD_STATES.default.borderColor,
  },
  muted: {
    backgroundColor: DASHBOARD_TOKENS.sectionBackgroundMuted,
    borderColor: DASHBOARD_TOKENS.cardBorderColor,
  },
  hero: {
    backgroundColor: DASHBOARD_CARD_STATES.active.backgroundColor,
    borderColor: DASHBOARD_CARD_STATES.active.borderColor,
  },
  insight: {
    backgroundColor: '#EEF4FF',
    borderColor: '#D5E2FF',
  },
  alert: {
    backgroundColor: DASHBOARD_CARD_STATES.alert.backgroundColor,
    borderColor: DASHBOARD_CARD_STATES.alert.borderColor,
  },
  locked: {
    backgroundColor: DASHBOARD_CARD_STATES.locked.backgroundColor,
    borderColor: DASHBOARD_CARD_STATES.locked.borderColor,
  },
};

export function SurfaceCard({
  children,
  style,
  tone = 'default',
  padding = 'md',
  elevated = true,
  radius = 'md',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: CardTone;
  padding?: 'sm' | 'md' | 'lg';
  elevated?: boolean;
  radius?: 'md' | 'lg' | 'hero';
}) {
  return (
    <View
      style={[
        styles.base,
        toneStyle[tone],
        elevated
          ? DASHBOARD_TOKENS.cardShadow
          : DASHBOARD_TOKENS.cardShadowSoft,
        radius === 'hero'
          ? styles.radiusHero
          : radius === 'lg'
            ? styles.radiusLg
            : styles.radiusMd,
        padding === 'lg'
          ? styles.paddingLg
          : padding === 'sm'
            ? styles.paddingSm
            : styles.paddingMd,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    width: '100%',
  },
  radiusMd: {
    borderRadius: DASHBOARD_TOKENS.cardRadius,
  },
  radiusLg: {
    borderRadius: DASHBOARD_TOKENS.cardRadiusLarge,
  },
  radiusHero: {
    borderRadius: DASHBOARD_TOKENS.cardRadiusHero,
  },
  paddingSm: {
    padding: 14,
  },
  paddingMd: {
    padding: 18,
  },
  paddingLg: {
    padding: 20,
  },
});

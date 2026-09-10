import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import {
  SETTINGS_SUBTITLE_STYLE,
  SETTINGS_TITLE_STYLE,
  SETTINGS_TOKENS,
} from '@/components/business-settings/tokens';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { safeBack } from '@/lib/navigation';

type BusinessSettingsSubpageHeaderProps = {
  title: string;
  subtitle?: string;
  fallbackHref?: string;
  onBackPress?: () => void;
  leftAccessory?: ReactNode;
};

export function BusinessSettingsSubpageHeader({
  title,
  subtitle,
  fallbackHref = BUSINESS_ROUTES.settings,
  onBackPress,
  leftAccessory,
}: BusinessSettingsSubpageHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <StickyScrollHeader
      topPadding={(insets.top || 0) + 8}
      backgroundColor={SETTINGS_TOKENS.pageBackground}
      style={styles.sticky}
    >
      <View style={styles.headerPad}>
        <StandaloneBackTitleHeader
          title={title}
          subtitle={subtitle}
          onBackPress={onBackPress ?? (() => safeBack(fallbackHref))}
          leftAccessory={leftAccessory}
          titleStyle={SETTINGS_TITLE_STYLE}
          subtitleStyle={SETTINGS_SUBTITLE_STYLE}
          titleNumberOfLines={2}
          subtitleNumberOfLines={2}
        />
      </View>
    </StickyScrollHeader>
  );
}

const styles = StyleSheet.create({
  sticky: {
    paddingBottom: 10,
  },
  headerPad: {
    minHeight: SETTINGS_TOKENS.touchTarget,
  },
});

import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { ReactNode, RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { rtlBaseView } from '@/lib/rtl';

type SettingsPageShellProps = {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  keyboardAware?: boolean;
  maxWidth?: number;
};

export function SettingsPageShell({
  header,
  children,
  footer,
  overlay,
  scrollRef,
  keyboardAware = false,
  maxWidth = SETTINGS_TOKENS.maxWidth,
}: SettingsPageShellProps) {
  const tabBarHeight = useBottomTabBarHeight();
  const content = (
    <ScrollView
      ref={scrollRef}
      stickyHeaderIndices={[0]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: tabBarHeight + (footer ? 96 : 28),
          maxWidth,
        },
      ]}
    >
      {header}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
      {footer ? (
        <View style={[styles.footer, { bottom: tabBarHeight }]}>{footer}</View>
      ) : null}
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: SETTINGS_TOKENS.pageBackground,
    ...rtlBaseView,
  },
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: SETTINGS_TOKENS.pagePad,
  },
  body: {
    gap: SETTINGS_TOKENS.sectionGap,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: SETTINGS_TOKENS.pagePad,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: SETTINGS_TOKENS.pageBackground,
  },
});

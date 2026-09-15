import type { ReactNode, RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { useSettingsContentWidth } from '@/components/business-settings/useSettingsContentWidth';
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
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const contentWidth = useSettingsContentWidth(maxWidth);
  const content = (
    <ScrollView
      ref={scrollRef}
      stickyHeaderIndices={[0]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: safeBottom + (footer ? 96 : 28),
        },
      ]}
    >
      <View style={[styles.column, { width: contentWidth }]}>{header}</View>
      <View style={[styles.column, styles.body, { width: contentWidth }]}>
        {children}
      </View>
    </ScrollView>
  );
  const footerContent = footer ? (
    <View style={[styles.footer, { paddingBottom: safeBottom }]}>
      <View style={[styles.column, { width: contentWidth }]}>{footer}</View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {content}
          {footerContent}
        </KeyboardAvoidingView>
      ) : (
        <>
          {content}
          {footerContent}
        </>
      )}
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
    alignItems: 'center',
  },
  column: {
    alignSelf: 'center',
  },
  body: {
    gap: SETTINGS_TOKENS.sectionGap,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    alignItems: 'center',
    backgroundColor: SETTINGS_TOKENS.pageBackground,
  },
});

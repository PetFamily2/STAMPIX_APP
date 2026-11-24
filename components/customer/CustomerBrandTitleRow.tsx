import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StampAixBrand } from '@/components/StampAixBrand';
import { UserAvatar } from '@/components/UserAvatar';
import {
  alignItems,
  flexDirection,
  rtlAutoText,
  rtlBaseText,
  rtlBaseView,
} from '@/lib/rtl';

type CustomerBrandTitleRowProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
  brandAccessory?: ReactNode;
  showAvatar?: boolean;
  avatarUrl?: string | null;
  avatarFullName?: string | null;
  avatarSize?: number;
  titleNumberOfLines?: number;
  subtitleNumberOfLines?: number;
};

export default function CustomerBrandTitleRow({
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  titleAccessory,
  brandAccessory,
  showAvatar = false,
  avatarUrl,
  avatarFullName,
  avatarSize = 36,
  titleNumberOfLines = 1,
  subtitleNumberOfLines = 2,
}: CustomerBrandTitleRowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleZone}>
        {titleAccessory}
        <View style={styles.titleTextBlock}>
          <Text
            style={[styles.title, titleStyle]}
            numberOfLines={titleNumberOfLines}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={subtitleNumberOfLines}
              style={[styles.subtitle, subtitleStyle]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.brandWrap}>
        {showAvatar ? (
          <UserAvatar
            avatarUrl={avatarUrl}
            fullName={avatarFullName}
            size={avatarSize}
          />
        ) : null}
        {brandAccessory}
        <StampAixBrand showMark={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 30,
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  brandWrap: {
    flexDirection: flexDirection.rowReverse,
    alignItems: 'center',
    gap: 8,
    direction: 'ltr',
    flexShrink: 0,
  },
  titleZone: {
    flex: 1,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    ...rtlBaseView,
  },
  titleTextBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
  },
  title: {
    fontSize: Platform.OS === 'web' ? 22 : 24,
    lineHeight: Platform.OS === 'web' ? 28 : 30,
    fontWeight: Platform.OS === 'web' ? '600' : '900',
    color: Platform.OS === 'web' ? '#101936' : '#1A2B4A',
    width: '100%',
    ...rtlAutoText,
  },
  subtitle: {
    width: '100%',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Platform.OS === 'web' ? '#475569' : '#64748B',
    ...rtlBaseText,
  },
});

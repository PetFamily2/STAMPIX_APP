import { ActivityIndicator, Platform, View } from 'react-native';

import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';

export function FullScreenLoading() {
  const web = Platform.OS === 'web';
  return (
    <View
      className={
        web
          ? 'flex-1 items-center justify-center bg-[#F3F5F9]'
          : 'flex-1 items-center justify-center bg-[#E9F0FF]'
      }
    >
      <ActivityIndicator
        size="large"
        color={web ? T.colors.primary : '#2F6BFF'}
        accessibilityLabel="טוען"
      />
    </View>
  );
}

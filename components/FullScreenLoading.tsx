import { ActivityIndicator, View } from 'react-native';

export function FullScreenLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-[#E9F0FF]">
      <ActivityIndicator
        size="large"
        color="#2F6BFF"
        accessibilityLabel="טוען"
      />
    </View>
  );
}

import { ActivityIndicator, View } from 'react-native';

export function FullScreenLoading() {
  return (
    <View className="flex-1 bg-black items-center justify-center">
      <ActivityIndicator size="large" color="#4fc3f7" />
    </View>
  );
}

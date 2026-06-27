import { Stack } from 'expo-router';
import { rtlScreenContentStyle } from '@/lib/rtl';

export default function BusinessCardsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: rtlScreenContentStyle,
      }}
    />
  );
}

import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
export function WebManagementSurface({ children }: PropsWithChildren) {
  return (
    <BottomTabBarHeightContext.Provider value={0}>
      <View
        style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', flex: 1 }}
      >
        {children}
      </View>
    </BottomTabBarHeightContext.Provider>
  );
}

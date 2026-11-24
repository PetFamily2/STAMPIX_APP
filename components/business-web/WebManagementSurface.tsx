import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
export function WebManagementSurface({
  children,
  fullWidth = false,
}: PropsWithChildren<{ fullWidth?: boolean }>) {
  return (
    <BottomTabBarHeightContext.Provider value={0}>
      <View
        style={{
          width: '100%',
          maxWidth: fullWidth ? undefined : 1100,
          alignSelf: 'center',
          flex: fullWidth ? undefined : 1,
        }}
      >
        {children}
      </View>
    </BottomTabBarHeightContext.Provider>
  );
}

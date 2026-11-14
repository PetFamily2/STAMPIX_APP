import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';

// A direct Web details route can be mounted outside the bottom-tab navigator.
export function useCustomerTabBarHeight() {
  return useContext(BottomTabBarHeightContext) ?? 0;
}

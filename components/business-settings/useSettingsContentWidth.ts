import { useWindowDimensions } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { getSettingsContentWidth } from '@/lib/businessSettings/layout';

export function useSettingsContentWidth(
  maxWidth: number = SETTINGS_TOKENS.mainMaxWidth
) {
  const { width } = useWindowDimensions();
  return getSettingsContentWidth(width, maxWidth, SETTINGS_TOKENS.pagePad);
}

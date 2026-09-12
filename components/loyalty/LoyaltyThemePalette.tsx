import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CARD_THEMES } from '@/constants/cardThemes';
import { flexDirection } from '@/lib/rtl';
import {
  VISUAL_PICKER_COLUMNS,
  VISUAL_PICKER_GAP,
  VisualSelectionTile,
} from './VisualSelectionTile';

export function LoyaltyThemePalette({
  value,
  onChange,
  disabledThemeIds = [],
  disabled = false,
}: {
  value: string;
  onChange: (themeId: string) => void;
  disabledThemeIds?: readonly string[];
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const tileWidth = Math.max(
    44,
    (width - VISUAL_PICKER_GAP * (VISUAL_PICKER_COLUMNS - 1)) /
      VISUAL_PICKER_COLUMNS
  );
  const unavailable = new Set(disabledThemeIds);

  return (
    <View
      testID="loyalty-theme-palette"
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {CARD_THEMES.map((theme) => {
        const selected = value === theme.id;
        const inUse = unavailable.has(theme.id) && !selected;
        return (
          <VisualSelectionTile
            key={theme.id}
            width={tileWidth}
            label={`ערכת נושא ${theme.name}`}
            selected={selected}
            disabled={disabled || inUse}
            inUse={inUse}
            onPress={() => onChange(theme.id)}
          >
            <LinearGradient
              colors={theme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.swatch}
            />
          </VisualSelectionTile>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: VISUAL_PICKER_GAP,
  },
  swatch: { width: '100%', height: '100%' },
});

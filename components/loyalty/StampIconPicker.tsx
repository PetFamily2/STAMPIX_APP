import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { STAMP_ICON_CATALOG } from '@/constants/stampIcons';
import { flexDirection } from '@/lib/rtl';
import { StampIcon } from './StampIcon';
import {
  VISUAL_PICKER_COLUMNS,
  VISUAL_PICKER_GAP,
  VisualSelectionTile,
} from './VisualSelectionTile';

export function StampIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (iconId: string) => void;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const tileWidth = Math.max(
    44,
    (width - VISUAL_PICKER_GAP * (VISUAL_PICKER_COLUMNS - 1)) /
      VISUAL_PICKER_COLUMNS
  );

  return (
    <View
      testID="stamp-icon-picker"
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {STAMP_ICON_CATALOG.map((definition) => (
        <VisualSelectionTile
          key={definition.id}
          width={tileWidth}
          label={`אייקון חותמת ${definition.label}`}
          selected={value === definition.id}
          disabled={disabled}
          onPress={() => onChange(definition.id)}
        >
          <View style={styles.iconCanvas}>
            <StampIcon value={definition.id} size={30} color="#1E3A8A" />
          </View>
        </VisualSelectionTile>
      ))}
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
  iconCanvas: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

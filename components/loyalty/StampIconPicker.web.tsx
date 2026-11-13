import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { STAMP_ICON_CATALOG } from '@/constants/stampIcons';
import { flexDirection } from '@/lib/rtl';
import { ClassicStampGlyph } from './ClassicStampGlyph.web';
import {
  VISUAL_PICKER_COLUMNS,
  VISUAL_PICKER_GAP,
  VisualSelectionTile,
} from './VisualSelectionTile.web';

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
  const tileWidth =
    width > 0
      ? Math.floor(
          (width - VISUAL_PICKER_GAP * (VISUAL_PICKER_COLUMNS - 1)) /
            VISUAL_PICKER_COLUMNS
        )
      : 0;

  return (
    <View
      testID="stamp-icon-picker"
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {STAMP_ICON_CATALOG.map((definition) => (
        <VisualSelectionTile
          key={definition.id}
          width={tileWidth > 0 ? tileWidth : '18%'}
          label={`אייקון חותמת ${definition.label}`}
          selected={value === definition.id}
          disabled={disabled}
          onPress={() => onChange(definition.id)}
        >
          <View style={styles.iconCanvas}>
            <ClassicStampGlyph
              color="#1E3A8A"
              earned={false}
              icon={definition.id}
              paper="#F8FAFC"
            />
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

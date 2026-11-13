import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { STAMP_SHAPE_OPTIONS, type StampShape } from '@/constants/stampOptions';
import { flexDirection } from '@/lib/rtl';
import { ClassicStampGlyph } from './ClassicStampGlyph.web';
import {
  VISUAL_PICKER_COLUMNS,
  VISUAL_PICKER_GAP,
  VisualSelectionTile,
} from './VisualSelectionTile.web';

export function StampShapePicker({
  value,
  stampIcon,
  onChange,
  disabled = false,
}: {
  value: StampShape;
  stampIcon: string;
  onChange: (shape: StampShape) => void;
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
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {STAMP_SHAPE_OPTIONS.map((option) => (
        <VisualSelectionTile
          key={option.id}
          width={tileWidth > 0 ? tileWidth : '18%'}
          label={`צורת חותמת ${option.label}`}
          selected={value === option.id}
          disabled={disabled}
          onPress={() => onChange(option.id)}
        >
          {option.id === 'icon' ? (
            <View style={styles.iconSample}>
              <ClassicStampGlyph
                color="#1E3A8A"
                earned={false}
                icon={stampIcon}
                paper="#F8FAFC"
              />
            </View>
          ) : (
            <View style={[styles.shape, SHAPE_STYLES[option.id]]} />
          )}
        </VisualSelectionTile>
      ))}
    </View>
  );
}

const SHAPE_STYLES = StyleSheet.create({
  circle: { borderRadius: 999 },
  roundedSquare: { borderRadius: 8 },
  square: { borderRadius: 2 },
  hexagon: { borderRadius: 5, transform: [{ rotate: '45deg' }] },
  icon: {},
});

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: VISUAL_PICKER_GAP,
  },
  iconSample: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shape: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#1E3A8A',
    backgroundColor: '#DBEAFE',
  },
});

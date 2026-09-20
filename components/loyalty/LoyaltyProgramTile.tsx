import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveCardTheme } from '@/constants/cardThemes';
import { alignItems } from '@/lib/rtl';
import { StampIcon } from './StampIcon';

const PROGRAM_TILE_BORDER_WIDTH = 3;
const PROGRAM_TITLE_LINE_HEIGHT = 12;
const PROGRAM_TITLE_MAX_FONT_MULTIPLIER = 1.35;
const PROGRAM_LABEL_HEIGHT = Math.ceil(
  PROGRAM_TITLE_LINE_HEIGHT * 2 * PROGRAM_TITLE_MAX_FONT_MULTIPLIER
);
const PROGRAM_TILE_HEIGHT = 101;
const PROGRAM_ICON_CANVAS_SIZE = 30;
const PROGRAM_ICON_NOMINAL_SIZE = 27;

export function LoyaltyProgramTile({
  title,
  cardThemeId,
  stampIcon,
  selected,
  disabled,
  busy = false,
  width,
  onPress,
}: {
  title: string;
  cardThemeId?: string | null;
  stampIcon?: string | null;
  selected: boolean;
  disabled: boolean;
  busy?: boolean;
  width: number;
  onPress: () => void;
}) {
  const theme = resolveCardTheme(cardThemeId);
  return (
    <View
      style={[
        styles.shadowHost,
        { width },
        selected ? styles.selected : null,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`בחירת כרטיסייה ${title}`}
        accessibilityState={{ selected, disabled, busy }}
        style={({ pressed }) => [
          styles.root,
          { borderColor: selected ? '#2F6BFF' : theme.keyline },
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <LinearGradient
          colors={[theme.surface, theme.surfaceAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={styles.surface}
        >
          <View style={styles.selectionSlot}>
            {selected ? (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={11} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
          <View style={styles.iconCanvas}>
            <StampIcon
              value={stampIcon}
              size={PROGRAM_ICON_NOMINAL_SIZE}
              color={theme.accent}
            />
          </View>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={PROGRAM_TITLE_MAX_FONT_MULTIPLIER}
            style={[styles.title, { color: theme.titleColor }]}
          >
            {title}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowHost: {
    height: PROGRAM_TILE_HEIGHT,
    borderRadius: 13,
    backgroundColor: '#111827',
    overflow: 'visible',
    flexShrink: 0,
  },
  selected: {
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 5,
  },
  root: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
    borderWidth: PROGRAM_TILE_BORDER_WIDTH,
    backgroundColor: '#111827',
    overflow: 'hidden',
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.58 },
  surface: {
    flex: 1,
    width: '100%',
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  selectionSlot: {
    width: '100%',
    height: 16,
    alignItems: alignItems.start,
    justifyContent: 'center',
  },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#2F6BFF',
  },
  iconCanvas: {
    width: PROGRAM_ICON_CANVAS_SIZE,
    height: PROGRAM_ICON_CANVAS_SIZE,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  title: {
    width: '100%',
    height: PROGRAM_LABEL_HEIGHT,
    flexShrink: 0,
    fontSize: 10,
    lineHeight: PROGRAM_TITLE_LINE_HEIGHT,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveCardTheme } from '@/constants/cardThemes';
import { StampIcon } from './StampIcon';

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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`בחירת כרטיסייה ${title}`}
      accessibilityState={{ selected, disabled, busy }}
      style={({ pressed }) => [
        styles.root,
        { width, borderColor: selected ? '#2563EB' : theme.keyline },
        selected ? styles.selected : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <LinearGradient
        colors={[theme.surface, theme.surfaceAlt]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        style={styles.surface}
      >
        {selected ? (
          <View style={[styles.check, { backgroundColor: theme.accent }]}>
            <Ionicons name="checkmark" size={12} color={theme.onAccent} />
          </View>
        ) : null}
        <View style={[styles.iconRing, { backgroundColor: theme.accent }]}>
          <StampIcon value={stampIcon} size={22} color={theme.onAccent} />
        </View>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.35}
          style={[styles.title, { color: theme.titleColor }]}
        >
          {title}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 84,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: '#111827',
  },
  selected: {
    borderWidth: 3,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 5,
  },
  pressed: { opacity: 0.82 },
  surface: {
    flex: 1,
    width: '100%',
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  check: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  iconRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    width: '100%',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

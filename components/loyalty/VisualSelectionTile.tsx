import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const VISUAL_PICKER_COLUMNS = 5;
export const VISUAL_PICKER_GAP = 8;
export const VISUAL_PICKER_BORDER_WIDTH = 3;

export function VisualSelectionTile({
  label,
  selected,
  disabled = false,
  inUse = false,
  width,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  inUse?: boolean;
  width: number;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${inUse ? ', בשימוש' : ''}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          borderColor: selected ? '#DC2626' : 'transparent',
          opacity: disabled ? 0.48 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.visual}>{children}</View>
      {selected ? (
        <View style={styles.checkBadge}>
          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
        </View>
      ) : null}
      {inUse ? (
        <View style={styles.inUseBadge}>
          <Text style={styles.inUseText} numberOfLines={1}>
            בשימוש
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 68,
    borderRadius: 14,
    borderWidth: VISUAL_PICKER_BORDER_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  visual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  inUseBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    left: 2,
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(15,23,42,0.84)',
    paddingHorizontal: 2,
  },
  inUseText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});

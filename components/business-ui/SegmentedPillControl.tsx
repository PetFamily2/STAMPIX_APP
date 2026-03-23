import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';

export function SegmentedPillControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ key: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const isActive = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[
              styles.item,
              isActive ? styles.activeItem : styles.inactiveItem,
            ]}
          >
            <Text
              style={[
                styles.text,
                isActive ? styles.activeText : styles.inactiveText,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E2F8',
    backgroundColor: '#EEF3FF',
    padding: 4,
  },
  item: {
    flex: 1,
    borderRadius: 999,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  activeItem: {
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
  },
  inactiveItem: {
    backgroundColor: 'transparent',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeText: {
    color: '#FFFFFF',
  },
  inactiveText: {
    color: '#51617F',
  },
});

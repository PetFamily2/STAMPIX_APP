import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/business-ui';

export type DateSelectorItem = {
  key: string;
  anchor: number;
  weekdayLabel: string;
  dayNumber: string;
  shortMonth: string;
  isToday: boolean;
};

export type DatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days';

export function DateSelectorBar({
  items,
  selectedKey,
  selectedPresetLabel,
  onSelect,
  onSelectPreset,
}: {
  items: DateSelectorItem[];
  selectedKey: string;
  selectedPresetLabel: string;
  onSelect: (item: DateSelectorItem) => void;
  onSelectPreset: (preset: DatePresetKey) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const presets: Array<{ key: DatePresetKey; label: string }> = [
    { key: 'today', label: 'היום' },
    { key: 'yesterday', label: 'אתמול' },
    { key: 'last_7_days', label: '7 ימים' },
    { key: 'last_30_days', label: '30 ימים' },
  ];

  return (
    <View style={styles.wrap}>
      <SurfaceCard
        elevated={false}
        padding="sm"
        radius="hero"
        style={styles.card}
      >
        <View style={styles.barRow}>
          <View style={styles.daysWrap}>
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {items.map((item) => {
                const isSelected = item.key === selectedKey;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onSelect(item)}
                    style={[
                      styles.item,
                      isSelected ? styles.itemSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekday,
                        isSelected
                          ? styles.weekdaySelected
                          : styles.weekdayIdle,
                      ]}
                    >
                      {item.weekdayLabel}
                    </Text>
                    <Text
                      style={[
                        styles.dayNumber,
                        isSelected
                          ? styles.dayNumberSelected
                          : styles.dayNumberIdle,
                      ]}
                    >
                      {item.dayNumber}
                    </Text>
                    <Text
                      style={[
                        styles.month,
                        isSelected ? styles.monthSelected : styles.monthIdle,
                      ]}
                    >
                      {item.shortMonth}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.presetWrap}>
            <Pressable
              onPress={() => setMenuOpen((current) => !current)}
              style={styles.presetButton}
            >
              <Ionicons
                name={menuOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#0F172A"
              />
              <Text style={styles.presetLabel}>{selectedPresetLabel}</Text>
            </Pressable>

            {menuOpen ? (
              <SurfaceCard
                elevated={true}
                padding="sm"
                radius="lg"
                style={styles.dropdown}
              >
                {presets.map((preset, index) => (
                  <Pressable
                    key={preset.key}
                    onPress={() => {
                      setMenuOpen(false);
                      onSelectPreset(preset.key);
                    }}
                    style={[
                      styles.dropdownItem,
                      index < presets.length - 1
                        ? styles.dropdownDivider
                        : null,
                    ]}
                  >
                    <Text style={styles.dropdownLabel}>{preset.label}</Text>
                  </Pressable>
                ))}
              </SurfaceCard>
            ) : null}
          </View>
        </View>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: '#E4EAF4',
    overflow: 'visible',
  },
  barRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    overflow: 'visible',
  },
  daysWrap: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  item: {
    width: 44,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 6,
  },
  itemSelected: {
    backgroundColor: '#F3F0FF',
    borderColor: '#D6CCFF',
  },
  weekday: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  weekdaySelected: {
    color: '#4F46E5',
  },
  weekdayIdle: {
    color: '#64748B',
  },
  dayNumber: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
  },
  dayNumberSelected: {
    color: '#312E81',
  },
  dayNumberIdle: {
    color: '#111827',
  },
  month: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
  },
  monthSelected: {
    color: '#4F46E5',
  },
  monthIdle: {
    color: '#94A3B8',
  },
  presetWrap: {
    position: 'relative',
    alignItems: 'flex-end',
  },
  presetButton: {
    minWidth: 110,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8F4',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  presetLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#111827',
  },
  dropdown: {
    position: 'absolute',
    top: 54,
    width: 148,
    borderColor: '#E4EAF4',
    backgroundColor: '#FFFFFF',
  },
  dropdownItem: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  dropdownDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  dropdownLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#111827',
  },
});

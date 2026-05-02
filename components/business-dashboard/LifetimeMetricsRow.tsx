import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

type Tone = 'teal' | 'violet' | 'blue' | 'amber';
type LifetimeMetricIcon =
  | 'ticket-outline'
  | 'gift-outline'
  | 'person-add-outline'
  | 'people-outline'
  | 'scan-outline'
  | 'shield-checkmark-outline'
  | 'gift-outline-custom'
  | 'stamp-outline-custom';

const TONE_MAP: Record<
  Tone,
  { iconColor: string; helper: string; value: string }
> = {
  teal: {
    iconColor: '#16A34A',
    helper: '#16A34A',
    value: '#16A34A',
  },
  violet: {
    iconColor: '#5B3DF5',
    helper: '#16A34A',
    value: '#5B3DF5',
  },
  blue: {
    iconColor: '#1473E6',
    helper: '#16A34A',
    value: '#1473E6',
  },
  amber: {
    iconColor: '#F97316',
    helper: '#16A34A',
    value: '#F97316',
  },
};

function StampOutlineIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1.7c3 0 4.8 2.6 4.1 5.5-.5 2.1-1.7 4.3-2.6 6.3h-3c-.9-2-2.1-4.2-2.6-6.3-.7-2.9 1.1-5.5 4.1-5.5Z"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.1 13.4h5.8v1.2c0 1.3-1 2.3-2.3 2.3h-1.2c-1.3 0-2.3-1-2.3-2.3v-1.2Z"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.7 16.6h4.4c.5.7 1.5 1 2.9 1s2.4-.3 2.9-1h4.4c1.5 0 2.7 1.2 2.7 2.7S20.8 22 19.3 22H4.7C3.2 22 2 20.8 2 19.3s1.2-2.7 2.7-2.7Z"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.1 21.8h15.8l.9 1.5H3.2l.9-1.5Z"
        stroke={color}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GiftOutlineIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 7.3c-1.1-2.8-3.1-4-4.5-2.8-1.5 1.3.1 3 4.5 2.8Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 7.3c1.1-2.8 3.1-4 4.5-2.8 1.5 1.3-.1 3-4.5 2.8Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={12}
        y1={7.3}
        x2={12}
        y2={20}
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
      <Rect
        x={5}
        y={10}
        width={14}
        height={10}
        rx={1.3}
        stroke={color}
        strokeWidth={1.65}
      />
      <Path
        d="M4 10h16V8.6c0-.8-.7-1.5-1.5-1.5h-13C4.7 7.1 4 7.8 4 8.6V10Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line
        x1={5}
        y1={14.1}
        x2={19}
        y2={14.1}
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function LifetimeIcon({
  icon,
  color,
}: {
  icon: LifetimeMetricIcon;
  color: string;
}) {
  if (icon === 'stamp-outline-custom') {
    return <StampOutlineIcon color={color} />;
  }

  if (icon === 'gift-outline-custom') {
    return <GiftOutlineIcon color={color} />;
  }

  return <Ionicons name={icon} size={29} color={color} />;
}

export function LifetimeMetricsRow({
  layoutMode,
  metrics,
  showIcons = true,
}: {
  layoutMode: DashboardLayoutMode;
  metrics: Array<{
    key: string;
    label: string;
    value: string;
    icon: LifetimeMetricIcon;
    tone: 'teal' | 'violet' | 'blue' | 'amber';
    helperValue?: {
      amount: string;
      period: string;
    };
  }>;
  showIcons?: boolean;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View style={[styles.card, { borderRadius: layout.cardRadius }]}>
      <View style={styles.row}>
        {metrics.slice(0, 4).map((metric, index) => {
          const palette = TONE_MAP[metric.tone];

          return (
            <View
              key={metric.key}
              style={[
                styles.metricItem,
                index < 3 ? styles.metricDivider : null,
              ]}
            >
              {showIcons ? (
                <View style={styles.iconArea}>
                  <LifetimeIcon icon={metric.icon} color={palette.iconColor} />
                </View>
              ) : null}

              <View style={styles.labelArea}>
                <Text
                  className={tw.textStart}
                  numberOfLines={2}
                  style={styles.label}
                >
                  {metric.label}
                </Text>
              </View>

              <View style={styles.valueArea}>
                <Text
                  adjustsFontSizeToFit={true}
                  className={tw.textStart}
                  minimumFontScale={0.72}
                  numberOfLines={1}
                  style={[
                    styles.value,
                    {
                      color: palette.value,
                      fontSize: layout.kpiValueSize,
                      lineHeight: layout.kpiValueSize + 4,
                    },
                  ]}
                >
                  {metric.value}
                </Text>
              </View>

              <View style={styles.trendArea}>
                <View style={styles.helperRow}>
                  <Text
                    className={tw.textStart}
                    numberOfLines={1}
                    style={[
                      styles.helperPeriod,
                      styles.helperValue,
                      { color: palette.helper },
                    ]}
                  >
                    {metric.helperValue?.period ?? ''}
                  </Text>
                  <Text
                    className={tw.textStart}
                    numberOfLines={1}
                    style={[
                      styles.helperAmount,
                      styles.helperValue,
                      { color: palette.helper },
                    ]}
                  >
                    {metric.helperValue?.amount ?? ''}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 6,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 104,
    paddingHorizontal: 5,
  },
  metricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#EDF2F8',
  },
  iconArea: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelArea: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  valueArea: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  trendArea: {
    height: 16,
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 1,
  },
  value: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
    letterSpacing: 0,
    width: '100%',
  },
  label: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'center',
  },
  helperValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  helperAmount: {
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  helperPeriod: {
    textAlign: 'left',
    writingDirection: 'rtl',
  },
});

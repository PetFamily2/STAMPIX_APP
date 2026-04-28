import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

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
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={4.8} r={2.1} stroke={color} strokeWidth={1.65} />
      <Path
        d="M12 6.9v4.3"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
      <Path
        d="M9.2 11.2h5.6l1.4 3.4H7.8l1.4-3.4Z"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        x={6}
        y={14.6}
        width={12}
        height={2.8}
        rx={1.1}
        stroke={color}
        strokeWidth={1.65}
      />
      <Path
        d="M5.4 20h13.2"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
      />
      <Path
        d="M8.2 17.4v1.1M12 17.4v1.1M15.8 17.4v1.1"
        stroke={color}
        strokeWidth={1.45}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function GiftOutlineIcon({ color }: { color: string }) {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="none">
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

  return <Ionicons name={icon} size={26} color={color} />;
}

export function LifetimeMetricsRow({
  layoutMode,
  metrics,
}: {
  layoutMode: DashboardLayoutMode;
  metrics: Array<{
    key: string;
    label: string;
    value: string;
    icon: LifetimeMetricIcon;
    tone: 'teal' | 'violet' | 'blue' | 'amber';
    helperValue?: string;
  }>;
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
              <View style={styles.iconArea}>
                <LifetimeIcon icon={metric.icon} color={palette.iconColor} />
              </View>

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
                <Text
                  className={tw.textStart}
                  numberOfLines={1}
                  style={[styles.helperValue, { color: palette.helper }]}
                >
                  {metric.helperValue ?? ''}
                </Text>
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
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelArea: {
    height: 32,
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
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
    textAlign: 'center',
  },
});

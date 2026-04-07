import { SegmentedPillControl } from '@/components/business-ui';

export type DatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days';

export function DateSelectorBar({
  value,
  onChange,
}: {
  value: DatePresetKey;
  onChange: (preset: DatePresetKey) => void;
}) {
  return (
    <SegmentedPillControl
      items={[
        { key: 'today', label: 'היום' },
        { key: 'yesterday', label: 'אתמול' },
        { key: 'last_7_days', label: '7 ימים' },
        { key: 'last_30_days', label: '30 ימים' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

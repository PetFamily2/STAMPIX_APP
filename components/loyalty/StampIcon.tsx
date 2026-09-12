import { Ionicons } from '@expo/vector-icons';
import { resolveStampIcon } from '@/constants/stampIcons';

export function StampIcon({
  value,
  size = 28,
  color,
}: {
  value?: string | null;
  size?: number;
  color: string;
}) {
  const definition = resolveStampIcon(value);
  const opticalSize = Math.round(size * (definition.opticalScale ?? 1));
  return (
    <Ionicons
      name={definition.icon}
      size={opticalSize}
      color={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

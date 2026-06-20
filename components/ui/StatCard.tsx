import { Text, View } from 'react-native';

import { tw } from '@/lib/rtl';

type StatCardProps = {
  value: string;
  label: string;
  icon: string;
  accent?: string;
  className?: string;
};

export function StatCard({
  value,
  label,
  icon,
  accent = 'bg-blue-50',
  className = '',
}: StatCardProps) {
  return (
    <View
      className={`bg-white rounded-[26px] border border-gray-100 p-4 shadow-sm flex-1 min-w-[30%] ${tw.itemsStart} ${className}`}
    >
      <View
        className={`h-10 w-10 rounded-full items-center justify-center mb-3 ${accent}`}
      >
        <Text className="text-xl">{icon}</Text>
      </View>
      <Text className={`text-2xl font-black text-text-main ${tw.textStart}`}>
        {value}
      </Text>
      <Text className={`text-xs font-bold text-gray-400 ${tw.textStart}`}>
        {label}
      </Text>
    </View>
  );
}

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { tw } from '@/lib/rtl';

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, action, className = '' }: SectionHeaderProps) {
  return (
    <View className={`${tw.flexRow} items-center justify-between ${className}`}>
      <View>
        <Text className={`text-lg font-black text-text-main ${tw.textStart}`}>{title}</Text>
        {description ? (
          <Text className={`text-xs text-gray-400 ${tw.textStart}`}>{description}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}



import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { rtlBaseText, rtlBaseView, tw } from '@/lib/rtl';

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  action,
  className = '',
}: SectionHeaderProps) {
  return (
    <View
      className={`${tw.flexRow} items-center justify-between ${className}`}
      style={rtlBaseView}
    >
      <View className="flex-1" style={rtlBaseView}>
        <Text
          className={`text-lg font-black text-text-main ${tw.textStart}`}
          style={rtlBaseText}
        >
          {title}
        </Text>
        {description ? (
          <Text
            className={`text-xs text-gray-400 ${tw.textStart}`}
            style={rtlBaseText}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

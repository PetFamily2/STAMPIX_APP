import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { rtlAutoText, rtlBaseText, rtlBaseView, tw } from '@/lib/rtl';

type ListRowProps = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  trailing?: ReactNode;
  className?: string;
};

export function ListRow({
  leading,
  title,
  subtitle,
  subtitleClassName = 'text-gray-400',
  trailing,
  className = '',
}: ListRowProps) {
  return (
    <View
      className={`bg-white rounded-[30px] border border-gray-100 p-4 ${tw.flexRow} items-center justify-between shadow-sm ${className}`}
      style={rtlBaseView}
    >
      <View className={`${tw.flexRow} items-center gap-3 flex-1`}>
        {leading}
        <View className="flex-1">
          <Text
            className={`text-base font-bold text-text-main ${tw.textStart}`}
            style={rtlAutoText}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className={`text-xs font-bold ${subtitleClassName} ${tw.textStart}`}
              style={rtlBaseText}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing}
    </View>
  );
}

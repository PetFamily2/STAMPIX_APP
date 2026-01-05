import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';

type CardProps = PropsWithChildren<ViewProps & { className?: string }>;

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <View className={`rounded-[26px] border border-gray-100 bg-white ${className}`} {...props}>
      {children}
    </View>
  );
}


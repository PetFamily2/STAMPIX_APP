import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';

type PrimaryButtonProps = {
  title: string;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
} & ComponentProps<typeof TouchableOpacity>;

export function PrimaryButton({
  title,
  icon,
  loading = false,
  className = '',
  disabled,
  ...props
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      className={`w-full rounded-[28px] py-5 bg-blue-600 shadow-lg shadow-blue-600/30 flex-row items-center justify-center gap-3 active:scale-[0.98] ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <ActivityIndicator color="#fff" /> : (icon ?? null)}
      <Text className="text-white text-lg font-black">{title}</Text>
    </TouchableOpacity>
  );
}

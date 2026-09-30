import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { SumitReturnSurface } from '@/components/business-web/SumitReturnSurface';
import { BUSINESS_WEB_ROUTES } from '@/lib/businessWebNavigation';

export default function SumitCancelReturnScreen() {
  if (Platform.OS !== 'web') {
    return <Redirect href={BUSINESS_WEB_ROUTES.billing} />;
  }
  return <SumitReturnSurface state="canceled" />;
}

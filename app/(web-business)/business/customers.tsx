import { View } from 'react-native';
import { BusinessWebCustomers } from '@/components/business-web/BusinessWebCustomers';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebCustomersScreen() {
  const { activeBusinessId } = useActiveBusiness();

  return activeBusinessId ? (
    <View style={{ width: '100%', gap: 28 }}>
      <BusinessWebCustomers
        key={String(activeBusinessId)}
        activeBusinessId={activeBusinessId}
      />
    </View>
  ) : null;
}

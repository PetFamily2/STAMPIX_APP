import { useActiveBusinessContext } from '@/contexts/ActiveBusinessContext';

export function useActiveBusiness() {
  return useActiveBusinessContext();
}

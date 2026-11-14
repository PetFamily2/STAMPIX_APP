import { ClassicCardWizard } from '@/components/business-web/ClassicCardWizard';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';

export default function NewCard() {
  return (
    <WebManagementSurface>
      <ClassicCardWizard />
    </WebManagementSurface>
  );
}

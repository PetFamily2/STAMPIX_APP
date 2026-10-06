import Editor from '@/app/(authenticated)/(business)/cards/new';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function NewCard() {
  return (
    <WebManagementSurface>
      <Editor />
    </WebManagementSurface>
  );
}

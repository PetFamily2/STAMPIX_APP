import Editor from '@/app/(authenticated)/(business)/cards/[programId]';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function CardEditor() {
  return (
    <WebManagementSurface>
      <Editor />
    </WebManagementSurface>
  );
}

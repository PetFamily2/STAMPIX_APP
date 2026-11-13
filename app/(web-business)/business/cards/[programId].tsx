import Editor from '@/components/business-web/BusinessWebCardEditor.web';
import { WebManagementSurface } from '@/components/business-web/WebManagementSurface';
export default function CardEditor() {
  return (
    <WebManagementSurface fullWidth={true}>
      <Editor />
    </WebManagementSurface>
  );
}

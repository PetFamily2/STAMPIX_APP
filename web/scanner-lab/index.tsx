import { createRoot } from 'react-dom/client';
import QrScannerWeb from '../../components/web-scanner/QrScanner.web';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<QrScannerWeb />);
}

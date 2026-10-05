import { useEffect, useRef, useState } from 'react';
import {
  createLocalDecoder,
  type Decoder,
} from '../../lib/web-scanner/decoder';
import { createDecoderFixture } from '../../lib/web-scanner/fixture';

export default function DecoderFixture() {
  const decoder = useRef<Decoder | null>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState('תמונת QR סינתטית לבדיקת פענוח בלבד');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      decoder.current?.destroy();
    };
  }, []);
  const run = async () => {
    if (decoder.current) {
      return;
    }
    setBusy(true);
    try {
      decoder.current = createLocalDecoder();
      const result = await decoder.current.decode(createDecoderFixture());
      if (mounted.current) {
        setStatus(
          result
            ? `תמונת הבדיקה פוענחה בהצלחה · QR · ${result.length} תווים · לא סריקה במצלמה`
            : 'תמונת הבדיקה לא פוענחה'
        );
      }
    } catch {
      if (mounted.current) {
        setStatus('פענוח תמונת הבדיקה נכשל');
      }
    } finally {
      decoder.current?.destroy();
      decoder.current = null;
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  return (
    <section className="simulation">
      <p aria-live="polite">{status}</p>
      <button type="button" disabled={busy} onClick={() => void run()}>
        פענוח תמונת בדיקה
      </button>
    </section>
  );
}

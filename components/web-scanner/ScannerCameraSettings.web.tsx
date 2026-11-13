import { useState } from 'react';
import { cameraDisplayName } from '@/lib/web-scanner/presentation';
import {
  readSavedScannerCamera,
  saveScannerCamera,
} from '@/lib/web-scanner/savedCamera';

/** Saved scanner camera. Confirmation writes the choice; the scanner does not ask again. */
export function ScannerCameraSettings() {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const loadCameras = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('הדפדפן לא תומך במצלמה');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const video = devices
        .filter((device) => device.kind === 'videoinput' && device.deviceId)
        .map((device, index) => ({
          id: device.deviceId,
          label: cameraDisplayName(device.label, index),
        }));
      const stored = readSavedScannerCamera();
      setCameras(video);
      setSelected(
        video.some((camera) => camera.id === stored)
          ? stored
          : (video[0]?.id ?? '')
      );
    } catch {
      setError('לא הצלחנו לפתוח את המצלמה');
    } finally {
      for (const track of stream?.getTracks() ?? []) track.stop();
    }
  };

  return (
    <section dir="rtl" style={{ marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>מצלמת סריקה</h2>
      <button type="button" onClick={() => void loadCameras()}>
        בחירת מצלמה
      </button>
      {cameras.length > 0 ? (
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 8,
          }}
        >
          מצלמה
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setSaved(false);
            }}
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              saveScannerCamera(selected);
              setSaved(true);
            }}
          >
            אישור
          </button>
          {saved ? <span>הבחירה נשמרה</span> : null}
        </label>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  alertSnapshot,
  clearAlerts,
  closeAlert,
  subscribeAlerts,
} from '@/lib/alert.web';
export default function WebAlertHost() {
  const alert = useSyncExternalStore(
    subscribeAlerts,
    alertSnapshot,
    () => null
  );
  const dialog = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { activeBusinessId } = useActiveBusiness();
  const actorId = user?._id;
  const previousScope = useRef({ actorId, activeBusinessId });
  useEffect(() => {
    if (
      previousScope.current.actorId !== actorId ||
      previousScope.current.activeBusinessId !== activeBusinessId
    )
      clearAlerts();
    previousScope.current = { actorId, activeBusinessId };
  }, [actorId, activeBusinessId]);
  useEffect(() => {
    if (!alert) return;
    const previous = document.activeElement as HTMLElement | null;
    (
      dialog.current?.querySelector<HTMLButtonElement>('[data-cancel=true]') ??
      dialog.current?.querySelector<HTMLButtonElement>('button')
    )?.focus();
    return () => {
      previous?.focus();
    };
  }, [alert]);
  if (!alert) return null;
  const cancel = () => {
    if (alert.options?.cancelable === false) return;
    closeAlert(alert.id);
    alert.options?.onDismiss?.();
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#0008',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stampaix-alert-title"
        aria-describedby="stampaix-alert-message"
        dir="rtl"
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'white',
          borderRadius: 18,
          padding: 24,
          boxSizing: 'border-box',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
          if (event.key === 'Tab') {
            const buttons =
              dialog.current?.querySelectorAll<HTMLButtonElement>('button');
            if (!buttons?.length) return;
            const first = buttons[0],
              last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 id="stampaix-alert-title">{alert.title}</h2>
        <p id="stampaix-alert-message">{alert.message}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {alert.buttons.map((button, index) => (
            <button
              key={`${alert.id}-${index}`}
              type="button"
              data-cancel={button.style === 'cancel'}
              style={{
                minHeight: 44,
                padding: '8px 16px',
                color: button.style === 'destructive' ? '#b91c1c' : '#172033',
              }}
              onClick={() => {
                closeAlert(alert.id);
                void Promise.resolve(button.onPress?.()).catch(() => {});
              }}
            >
              {button.text ?? 'אישור'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

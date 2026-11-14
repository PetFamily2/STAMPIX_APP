import type { AlertButton, AlertOptions } from 'react-native';
export type WebAlert = {
  id: number;
  title: string;
  message: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};
let sequence = 0;
let alerts: WebAlert[] = [];
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
export const Alert = {
  alert(
    title: string,
    message = '',
    buttons: AlertButton[] = [{ text: 'אישור' }],
    options?: AlertOptions
  ) {
    alerts = [...alerts, { id: ++sequence, title, message, buttons, options }];
    notify();
  },
};
export const alertSnapshot = () => alerts[0] ?? null;
export function subscribeAlerts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function closeAlert(id: number) {
  alerts = alerts.filter((alert) => alert.id !== id);
  notify();
}
export function clearAlerts() {
  alerts = [];
  notify();
}

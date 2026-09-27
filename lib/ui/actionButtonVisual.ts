export function actionButtonUsesMutedSurface(
  disabled: boolean,
  loading: boolean
) {
  return disabled && !loading;
}

export function readableCtaIconColor(disabled: boolean) {
  return disabled ? '#334155' : '#FFFFFF';
}

import { IS_DEV_MODE } from '@/config/appConfig';

export type PreviewQueryParamValue = string | string[] | null | undefined;

export function isPreviewQueryParamEnabled(value: PreviewQueryParamValue) {
  if (Array.isArray(value)) {
    return value.includes('true');
  }

  return value === 'true';
}

type ResolvePreviewModeParams = {
  preview?: PreviewQueryParamValue;
  map?: PreviewQueryParamValue;
  isDevMode?: boolean;
};

export function resolvePreviewModeFromParams({
  preview,
  map,
  isDevMode = IS_DEV_MODE,
}: ResolvePreviewModeParams) {
  return (
    isDevMode &&
    (isPreviewQueryParamEnabled(preview) || isPreviewQueryParamEnabled(map))
  );
}

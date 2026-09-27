import { Redirect, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { resolveSignedInScreenRedirect } from '@/lib/auth/webAuthEntry';

export default function SignInScreen() {
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const previewValue = Array.isArray(preview) ? preview[0] : preview;
  const mapValue = Array.isArray(map) ? map[0] : map;

  return (
    <Redirect
      href={resolveSignedInScreenRedirect(Platform.OS, {
        preview: previewValue,
        map: mapValue,
      })}
    />
  );
}

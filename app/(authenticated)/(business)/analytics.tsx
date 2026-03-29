import { Redirect, useLocalSearchParams } from 'expo-router';

export default function BusinessAnalyticsRedirect() {
  const { filter, preview, map } = useLocalSearchParams<{
    filter?: string;
    preview?: string;
    map?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(authenticated)/(business)/customers',
        params: {
          ...(filter ? { filter } : {}),
          ...(preview ? { preview } : {}),
          ...(map ? { map } : {}),
        },
      }}
    />
  );
}

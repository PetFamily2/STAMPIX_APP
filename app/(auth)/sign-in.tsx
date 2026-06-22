import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SignInScreen() {
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(auth)/sign-up-email',
        params: {
          ...(preview ? { preview } : {}),
          ...(map ? { map } : {}),
          entry: 'sign-in',
        },
      }}
    />
  );
}

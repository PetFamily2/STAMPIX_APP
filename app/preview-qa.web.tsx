import { Redirect } from 'expo-router';

/** Legacy bookmarks now use ordinary authentication. Synthetic login is retired. */
export default function RetiredPreviewQa() {
  return <Redirect href="/sign-in" />;
}

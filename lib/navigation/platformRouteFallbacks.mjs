/** Expo Router rejects the whole route tree if a platform route lacks a sibling. */
export function missingPlatformRouteFallbacks(files) {
  const paths = new Set(files);
  return files.filter((file) => {
    const match = file.match(/^(.*)\.(web|ios|android)\.[jt]sx?$/);
    return (
      match &&
      !['tsx', 'ts', 'jsx', 'js'].some((ext) => paths.has(`${match[1]}.${ext}`))
    );
  });
}

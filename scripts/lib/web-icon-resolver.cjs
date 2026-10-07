// Only the Web package barrel is narrowed; every Native request is delegated unchanged.
function createWebIconResolver(previousResolver, entry, expoEntry) {
  return (context, moduleName, platform) => {
    if (platform === 'web' && moduleName === 'lucide-react-native')
      return { type: 'sourceFile', filePath: entry };
    if (platform === 'web' && moduleName === '@expo/vector-icons' && expoEntry)
      return { type: 'sourceFile', filePath: expoEntry };
    return previousResolver
      ? previousResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}
module.exports = { createWebIconResolver };

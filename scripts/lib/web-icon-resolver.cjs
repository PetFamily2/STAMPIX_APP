// Only the Web package barrel is narrowed; every Native request is delegated unchanged.
function createWebIconResolver(previousResolver, entry) {
  return (context, moduleName, platform) => {
    if (platform === 'web' && moduleName === 'lucide-react-native')
      return { type: 'sourceFile', filePath: entry };
    return previousResolver
      ? previousResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}
module.exports = { createWebIconResolver };

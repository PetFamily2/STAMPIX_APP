// Preserve the alternate entry point without maintaining a second resolver.
// The shared resolver delegates Native requests and specializes Web icons only.
module.exports = require('./metro.config.js');

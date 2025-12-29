import { defineConfig } from 'convex';

export default defineConfig({
  functions: {
    node: {
      externalPackages: [
        'cookie',
        'jose',
        'oauth4webapi',
        'preact',
        'preact-render-to-string',
        '@auth/core',
        '@convex-dev/auth',
      ],
    },
  },
});

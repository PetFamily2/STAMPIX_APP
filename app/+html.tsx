import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#2F6BFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="StampAix" />
        <link rel="stylesheet" href="/pwa/leaflet.css" />
        <link
          rel="preload"
          as="image"
          href="/pwa/welcome-logo.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/pwa/icon.png" />
        <link
          rel="preload"
          href="/pwa/fonts/Heebo-Variable.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <ScrollViewStyleReset />
        {process.env.EXPO_PUBLIC_PWA_ENABLED === 'true' ? (
          <script src="/pwa/install.js" defer={true} />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}

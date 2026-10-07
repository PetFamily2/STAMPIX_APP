import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { WelcomeContent } from '../../components/public-web/WelcomeContent';

/** A real public entry page with working links before the application is downloaded. */
export function exportPublicWelcome(output, pwaEnabled) {
  const html = renderToStaticMarkup(
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>StampAix — נאמנות דיגיטלית</title>
        <meta name="theme-color" content="#2F6BFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/pwa/icon.png" />
        <link
          rel="preload"
          as="image"
          href="/pwa/welcome-logo.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <style>
          {
            'html,body{margin:0;background:#fff}@font-face{font-family:Heebo;src:url(/pwa/fonts/Heebo-Variable.ttf) format("truetype");font-display:optional}'
          }
        </style>
      </head>
      <body>
        <WelcomeContent />
        {pwaEnabled && <script src="/pwa/welcome.js" defer />}
      </body>
    </html>
  );
  writeFileSync(path.join(output, 'welcome.html'), `<!doctype html>${html}`);
}

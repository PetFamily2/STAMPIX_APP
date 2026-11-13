import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { WelcomeContent } from '../../components/public-web/WelcomeContent';
import { manualQaClientEnabled } from '../../lib/auth/manualQaPolicy';
import { WEB_LEGAL_VERSION } from '../../lib/legalWebContract';

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
        <WelcomeContent
          manualQa={manualQaClientEnabled({
            platform: 'web',
            environment: process.env.EXPO_PUBLIC_APP_ENV,
            flag: process.env.EXPO_PUBLIC_MANUAL_QA_ENABLED,
            url: process.env.EXPO_PUBLIC_CONVEX_URL,
            previewUrl: process.env.EXPO_PUBLIC_MANUAL_QA_PREVIEW_URL,
            backend: process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND,
          })}
        />
        <aside
          hidden={true}
          data-privacy-notice="true"
          data-privacy-version={WEB_LEGAL_VERSION}
          dir="rtl"
          aria-label="פרטיות וקובצי Cookie"
          style={{
            position: 'fixed',
            bottom: 16,
            insetInlineStart: 16,
            width: 'min(360px, calc(100vw - 32px))',
            boxSizing: 'border-box',
            padding: 18,
            background: '#fff',
            color: '#101936',
            border: '1px solid #DFE5F0',
            borderRadius: 16,
            boxShadow: '0 6px 24px #1019361a',
            font: '14px Heebo,Arial,sans-serif',
            lineHeight: 1.5,
            textAlign: 'right',
            zIndex: 11000,
          }}
        >
          <strong>פרטיות וקובצי Cookie</strong>
          <p style={{ margin: '6px 0 10px' }}>
            מידע על השימוש בנתונים ובקובצי Cookie נמצא במדיניות הפרטיות. את
            ההרשאות אפשר לנהל בהגדרות.
          </p>
          <nav
            aria-label="מידע ובחירות פרטיות"
            style={{ display: 'flex', gap: 16, marginBottom: 12 }}
          >
            <a
              href="/legal?document=privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              מדיניות הפרטיות
            </a>
            <a href="/settings#browser-permissions">הרשאות והגדרות</a>
          </nav>
          <button
            data-privacy-accept="true"
            type="button"
            style={{
              width: '100%',
              minHeight: 44,
              border: 0,
              borderRadius: 10,
              background: '#1834AD',
              color: '#fff',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            אישור
          </button>
        </aside>
        <script src="/pwa/privacy-notice.js" defer={true} />
        {pwaEnabled && <script src="/pwa/welcome.js" defer={true} />}
        {pwaEnabled && <script src="/pwa/install.js" defer={true} />}
      </body>
    </html>
  );
  writeFileSync(path.join(output, 'welcome.html'), `<!doctype html>${html}`);
}

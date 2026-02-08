import { httpRouter } from 'convex/server';
import { api } from './_generated/api';
import { httpAction } from './_generated/server';
import { auth } from './auth';

const http = httpRouter();

// Register Convex auth routes so the client-side auth hooks work.
auth.addHttpRoutes(http);

// ---------------------------------------------------------------------------
// GET /join — Landing page for Business Join QR (fallback when app not installed)
// ---------------------------------------------------------------------------
http.route({
  path: '/join',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const bizId = url.searchParams.get('biz') ?? '';
    const src = url.searchParams.get('src') ?? '';
    const camp = url.searchParams.get('camp') ?? '';

    let businessName = 'STAMPIX';
    let logoUrl = '';
    let joinCode = '';

    if (bizId) {
      const business = await ctx.runQuery(
        api.memberships.resolveBusinessByPublicId,
        { businessPublicId: bizId }
      );
      if (business) {
        businessName = business.name ?? businessName;
        logoUrl = business.logoUrl ?? '';
        joinCode = business.joinCode ?? '';
      }
    }

    // Build the deep link that opens the app (same URL the user is on)
    const appDeepLink = `https://stampix.app/join?biz=${encodeURIComponent(bizId)}${src ? `&src=${encodeURIComponent(src)}` : ''}${camp ? `&camp=${encodeURIComponent(camp)}` : ''}`;

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>הצטרפו ל${escapeHtml(businessName)} ב-STAMPIX</title>
  <meta property="og:title" content="הצטרפו ל${escapeHtml(businessName)} ב-STAMPIX" />
  <meta property="og:description" content="סירקו כדי להצטרף למועדון הנאמנות של ${escapeHtml(businessName)}" />
  ${logoUrl ? `<meta property="og:image" content="${escapeHtml(logoUrl)}" />` : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #E9F0FF;
      color: #1A2B4A;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .logo { width: 72px; height: 72px; border-radius: 16px; margin: 0 auto 16px; object-fit: cover; }
    h1 { font-size: 22px; font-weight: 900; margin-bottom: 8px; }
    .sub { color: #5B6475; font-size: 14px; margin-bottom: 24px; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 14px;
      font-weight: 900;
      font-size: 16px;
      text-decoration: none;
      margin-bottom: 12px;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: #2F6BFF; color: #fff; }
    .btn-secondary { background: #D4EDFF; color: #2F6BFF; }
    .code-box {
      margin-top: 16px;
      padding: 12px;
      background: #F6F8FC;
      border-radius: 12px;
      border: 1px solid #E3E9FF;
    }
    .code-label { font-size: 12px; color: #5B6475; margin-bottom: 4px; }
    .code-value { font-size: 24px; font-weight: 900; letter-spacing: 3px; color: #2F6BFF; }
    .stores { display: flex; gap: 10px; justify-content: center; margin-top: 8px; }
    .stores a { font-size: 13px; color: #2F6BFF; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" />` : ''}
    <h1>${escapeHtml(businessName)}</h1>
    <p class="sub">הצטרפו למועדון הנאמנות ב-STAMPIX</p>
    <a class="btn btn-primary" href="${escapeHtml(appDeepLink)}">פתח באפליקציה</a>
    <div class="stores">
      <a href="https://apps.apple.com/app/stampix/id000000000" target="_blank">App Store</a>
      <a href="https://play.google.com/store/apps/details?id=com.stampix.app" target="_blank">Google Play</a>
    </div>
    ${joinCode ? `
    <div class="code-box">
      <div class="code-label">או הזינו קוד הצטרפות באפליקציה:</div>
      <div class="code-value">${escapeHtml(joinCode)}</div>
    </div>
    ` : ''}
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }),
});

/** Escape HTML special characters to prevent XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default http;

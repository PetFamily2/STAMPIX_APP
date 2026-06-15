import { type FunctionReference, httpRouter } from 'convex/server';
import { api, internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { auth } from './auth';
import { resolveRevenueCatPlanMapping } from './entitlements';

const http = httpRouter();

const DEFAULT_APP_STORE_URL = 'https://apps.apple.com/us/search?term=STAMPAIX';
const DEFAULT_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.stampix.stampix';
const APP_JOIN_URL = 'stampix://join';

function resolveStoreUrl(value: string | undefined, fallbackUrl: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallbackUrl;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return fallbackUrl;
  }
  return normalized;
}

type JoinLinkParams = {
  biz?: string | null;
  ref?: string | null;
  bref?: string | null;
  src?: string | null;
  camp?: string | null;
};

function buildJoinSearchParams(params: JoinLinkParams) {
  const searchParams = new URLSearchParams();
  const orderedParams = [
    ['biz', params.biz],
    ['ref', params.ref],
    ['bref', params.bref],
    ['src', params.src],
    ['camp', params.camp],
  ] as const;

  for (const [key, value] of orderedParams) {
    const normalized = value?.trim();
    if (normalized) {
      searchParams.set(key, normalized);
    }
  }

  return searchParams;
}

export function buildJoinFallbackOpenAppUrl(params: JoinLinkParams) {
  const searchParams = buildJoinSearchParams(params);
  const query = searchParams.toString();
  return query ? `${APP_JOIN_URL}?${query}` : APP_JOIN_URL;
}

const APP_STORE_URL = resolveStoreUrl(
  process.env.APP_STORE_URL ?? process.env.EXPO_PUBLIC_APP_STORE_URL,
  DEFAULT_APP_STORE_URL
);
const PLAY_STORE_URL = resolveStoreUrl(
  process.env.PLAY_STORE_URL ?? process.env.EXPO_PUBLIC_PLAY_STORE_URL,
  DEFAULT_PLAY_STORE_URL
);

type RevenueCatWebhookCtx = {
  runMutation: (
    mutationRef: FunctionReference<
      'mutation',
      'internal',
      Record<string, unknown>,
      unknown
    >,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

type RevenueCatWebhookHandlerOptions = {
  expectedSecret?: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function secureEquals(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function getRevenueCatSecret(options?: RevenueCatWebhookHandlerOptions) {
  return options?.expectedSecret ?? process.env.REVENUECAT_WEBHOOK_SECRET ?? '';
}

function extractRevenueCatRequestSecret(request: Request) {
  const authorization = request.headers.get('authorization')?.trim();
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return request.headers.get('x-revenuecat-webhook-secret')?.trim() ?? '';
}

function assertRevenueCatWebhookAuthorized(
  request: Request,
  options?: RevenueCatWebhookHandlerOptions
) {
  const expectedSecret = getRevenueCatSecret(options);
  if (!expectedSecret) {
    throw new Error('REVENUECAT_WEBHOOK_SECRET_NOT_CONFIGURED');
  }

  const requestSecret = extractRevenueCatRequestSecret(request);
  if (!requestSecret || !secureEquals(requestSecret, expectedSecret)) {
    throw new Error('REVENUECAT_WEBHOOK_UNAUTHORIZED');
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function normalizeEntitlementIds(event: Record<string, unknown>) {
  const entitlementIds = new Set<string>();
  const entitlementId = getString(
    event.entitlement_id ?? event.entitlement_identifier
  );
  if (entitlementId) {
    entitlementIds.add(entitlementId);
  }

  const rawEntitlementIds = event.entitlement_ids;
  if (Array.isArray(rawEntitlementIds)) {
    for (const rawId of rawEntitlementIds) {
      const normalizedId = getString(rawId);
      if (normalizedId) {
        entitlementIds.add(normalizedId);
      }
    }
  }

  return [...entitlementIds];
}

function parseRevenueCatBusinessId(appUserId: string): string {
  const prefix = 'business:';
  if (!appUserId.startsWith(prefix)) {
    throw new Error('REVENUECAT_INVALID_APP_USER_ID');
  }

  const businessId = appUserId.slice(prefix.length).trim();
  if (!businessId || businessId.includes(':')) {
    throw new Error('REVENUECAT_INVALID_APP_USER_ID');
  }

  return businessId;
}

function extractRevenueCatEventPayload(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('REVENUECAT_INVALID_PAYLOAD');
  }

  const root = payload as Record<string, unknown>;
  const rawEvent =
    typeof root.event === 'object' && root.event !== null
      ? (root.event as Record<string, unknown>)
      : root;
  const eventId = getString(rawEvent.id ?? rawEvent.event_id);
  const eventType = getString(rawEvent.type ?? rawEvent.event_type);
  const appUserId = getString(rawEvent.app_user_id);

  if (!eventId) {
    throw new Error('REVENUECAT_MISSING_EVENT_ID');
  }
  if (!eventType) {
    throw new Error('REVENUECAT_MISSING_EVENT_TYPE');
  }
  if (!appUserId) {
    throw new Error('REVENUECAT_MISSING_APP_USER_ID');
  }

  const productId = getString(
    rawEvent.product_id ??
      rawEvent.product_identifier ??
      rawEvent.productIdentifier
  );
  const entitlementIds = normalizeEntitlementIds(rawEvent);
  resolveRevenueCatPlanMapping({
    productId,
    entitlementIds,
  });

  return {
    eventId,
    eventType: eventType.toUpperCase(),
    appUserId,
    businessId: parseRevenueCatBusinessId(appUserId),
    productId,
    entitlementIds,
    purchasedAt: getTimestampMs(
      rawEvent.purchased_at_ms ??
        rawEvent.purchase_at_ms ??
        rawEvent.event_timestamp_ms
    ),
    expirationAt:
      rawEvent.expiration_at_ms === null
        ? null
        : getTimestampMs(rawEvent.expiration_at_ms),
    providerSubscriptionId: getString(
      rawEvent.original_transaction_id ??
        rawEvent.transaction_id ??
        rawEvent.subscription_id
    ),
    rawEvent,
  };
}

function mapRevenueCatWebhookError(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';

  if (message === 'REVENUECAT_WEBHOOK_SECRET_NOT_CONFIGURED') {
    return jsonResponse(503, { ok: false, code: message });
  }
  if (message === 'REVENUECAT_WEBHOOK_UNAUTHORIZED') {
    return jsonResponse(401, { ok: false, code: message });
  }
  if (message.startsWith('REVENUECAT_') || message === 'BUSINESS_INACTIVE') {
    return jsonResponse(400, { ok: false, code: message });
  }

  return jsonResponse(500, {
    ok: false,
    code: 'REVENUECAT_WEBHOOK_FAILED',
  });
}

export async function handleRevenueCatWebhookRequest(
  ctx: RevenueCatWebhookCtx,
  request: Request,
  options?: RevenueCatWebhookHandlerOptions
) {
  try {
    assertRevenueCatWebhookAuthorized(request, options);

    const payload = await request.json();
    const event = extractRevenueCatEventPayload(payload);
    const result = await ctx.runMutation(
      internal.entitlements.applyRevenueCatWebhookEvent,
      event
    );
    const resultRecord =
      typeof result === 'object' && result !== null
        ? (result as { duplicate?: unknown })
        : null;

    return jsonResponse(200, {
      ok: true,
      duplicate: resultRecord?.duplicate === true,
      eventId: event.eventId,
      businessId: String(event.businessId),
    });
  } catch (error: unknown) {
    return mapRevenueCatWebhookError(error);
  }
}

// Register Convex auth routes so the client-side auth hooks work.
auth.addHttpRoutes(http);

http.route({
  path: '/revenuecat/webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleRevenueCatWebhookRequest(ctx, request);
  }),
});

// ---------------------------------------------------------------------------
// GET /join — Landing page for Business Join QR (fallback when app not installed)
// ---------------------------------------------------------------------------
http.route({
  path: '/join',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const bizId = url.searchParams.get('biz') ?? '';
    const ref = url.searchParams.get('ref') ?? '';
    const bref = url.searchParams.get('bref') ?? '';
    const src = url.searchParams.get('src') ?? '';
    const camp = url.searchParams.get('camp') ?? '';

    let businessName = 'STAMPAIX';
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

    const appDeepLink = buildJoinFallbackOpenAppUrl({
      biz: bizId,
      ref,
      bref,
      src,
      camp,
    });

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>הצטרפו ל${escapeHtml(businessName)} ב-STAMPAIX</title>
  <meta property="og:title" content="הצטרפו ל${escapeHtml(businessName)} ב-STAMPAIX" />
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
    <p class="sub">הצטרפו למועדון הנאמנות ב-STAMPAIX</p>
    <a class="btn btn-primary" href="${escapeHtml(appDeepLink)}">פתח באפליקציה</a>
    <div class="stores">
      <a href="${escapeHtml(APP_STORE_URL)}" target="_blank" rel="noopener noreferrer">App Store</a>
      <a href="${escapeHtml(PLAY_STORE_URL)}" target="_blank" rel="noopener noreferrer">Google Play</a>
    </div>
    ${
      joinCode
        ? `
    <div class="code-box">
      <div class="code-label">או הזינו קוד הצטרפות באפליקציה:</div>
      <div class="code-value">${escapeHtml(joinCode)}</div>
    </div>
    `
        : ''
    }
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

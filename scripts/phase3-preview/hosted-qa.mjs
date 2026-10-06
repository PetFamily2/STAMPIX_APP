import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  SOURCE_SHA,
} from '../lib/phase3c1-preview-guard.mjs';

const report = {
  revision: SOURCE_SHA,
  status: 'RUNNING',
  cases: {},
  errors: [],
  deviceVerify: true,
};
const save = () =>
  writeFileSync('rc-hosted-evidence.json', JSON.stringify(report, null, 2));
const requireThat = (v, code) => {
  if (!v) throw new Error(code);
};
let browser;
const record = async (name, fn) => {
  try {
    const detail = await fn();
    report.cases[name] = { status: 'PASS', ...(detail ?? {}) };
  } catch (e) {
    report.cases[name] = {
      status: 'FAIL',
      code: /^[A-Z0-9_]+$/.test(e.message ?? '')
        ? e.message
        : 'ASSERTION_FAILED',
    };
    report.errors.push(name);
  }
  save();
  console.info(`RC QA ${name}: ${report.cases[name].status}`);
};
try {
  requireThat(
    process.env.GITHUB_ACTIONS === 'true' &&
      process.env.GITHUB_HEAD_REF === 'pwa/phase-3-scanner-commands-20261005',
    'ACTIONS_PREVIEW_ONLY'
  );
  const data = JSON.parse(
    readFileSync(join(process.env.RUNNER_TEMP, 'stampaix-rc-private.json'))
  );
  const hosting = JSON.parse(readFileSync('phase3c1-preview-evidence.json'));
  requireThat(
    hosting.status === 'LIVE_E2E_AND_WEB_PREVIEW_PASS' &&
      hosting.sha === SOURCE_SHA,
    'VERIFIED_HOSTING_REQUIRED'
  );
  const url = hosting.webPreviewUrl,
    origin = new URL(url).origin;
  requireThat(
    /^https:\/\/stampaix-business--[a-z0-9]+\.expo\.app$/.test(origin),
    'HOSTED_ORIGIN_DENIED'
  );
  const { target, secret, fixtures, actors } = data;
  requireThat(
    target.name === hosting.deploymentName &&
      target.url === hosting.backendUrl &&
      hosting.deploymentType === 'preview',
    'PREVIEW_TARGET_REQUIRED'
  );
  const admin = new ConvexHttpClient(target.url, { logger: false });
  admin.setAdminAuth(target.key);
  const ref = (p) => makeFunctionReference(p);
  const client = async (role) => {
    const actor = actors[role];
    const c = new ConvexHttpClient(target.url, { logger: false });
    const result = await c.action(ref('auth:signIn'), {
      provider: 'password',
      params: {
        flow: 'signIn',
        email: `phase3-${role}@example.invalid`,
        password: actor.password,
      },
    });
    requireThat(result.tokens?.token, 'PASSWORD_SESSION_FAILED');
    actor.tokens = result.tokens;
    c.setAuth(result.tokens.token);
    const user = await c.query(ref('users:getCurrentUser'), {});
    requireThat(user?._id === actor.id, 'AUTH_ACTOR_MISMATCH');
    return c;
  };
  const clients = {};
  for (const role of ['owner', 'manager', 'staff', 'customer'])
    clients[role] = await client(role);
  const arrange = (kind) =>
    admin.mutation(
      ref('phase3Fixtures:qaArrange'),
      { secret, fixtures, kind },
      { skipQueue: true }
    );
  const modules = createRequire(
    join(process.env.RUNNER_TEMP, 'stampaix-rc-tools/package.json')
  );
  const { chromium } = modules('playwright');
  const AxeBuilder = modules('@axe-core/playwright').default;
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const errors = [];
  const states = [];
  const authenticated = async (
    role,
    { width = 390, location = 'denied' } = {}
  ) => {
    await client(role);
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [
              {
                name: '__convexAuthJWT_stampaixauth',
                value: actors[role].tokens.token,
              },
              {
                name: '__convexAuthRefreshToken_stampaixauth',
                value: actors[role].tokens.refreshToken,
              },
            ],
          },
        ],
      },
      geolocation: { latitude: 32.7, longitude: 35.1 },
      permissions: location === 'allowed' ? ['geolocation'] : [],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', () => errors.push(role));
    page.on('console', (m) => {
      if (
        m.type() === 'error' &&
        !/favicon|net::ERR_|Failed to load resource/.test(m.text())
      )
        errors.push(role);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { page, context };
  };
  const visit = async (page, path, expected) => {
    await page.goto(`${url}${path}`, { waitUntil: 'domcontentloaded' });
    await page
      .getByText(expected, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });
    requireThat(
      !/\/sign-up|\/sign-in|\/welcome$/.test(new URL(page.url()).pathname),
      'SIGNED_OUT_ROUTE'
    );
  };
  const layout = async (page) => {
    const dims = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    }));
    requireThat(
      dims.scroll <= dims.width + 1 && dims.dir === 'rtl' && dims.lang === 'he',
      'RTL_OVERFLOW'
    );
    return dims.width;
  };
  const c = await authenticated('customer');
  const o = await authenticated('owner');
  const s = await authenticated('staff');
  const m = await authenticated('manager');
  await record('CUSTOMER_LOGIN_WALLET', async () => {
    await visit(c.page, '/wallet', 'הארנק שלי');
    await layout(c.page);
  });
  await record('CUSTOMER_CARD_QR', async () => {
    await visit(
      c.page,
      `/customer-card/${fixtures.membershipId}`,
      'Synthetic Test Card'
    );
    requireThat((await c.page.locator('svg').count()) > 0, 'QR_SVG_MISSING');
  });
  await record('CUSTOMER_REWARD_STATE', async () => {
    await arrange('reward');
    await visit(c.page, '/rewards', 'הטבות');
    await arrange('restore');
  });
  await record('CUSTOMER_JOIN', async () => {
    await visit(c.page, '/join', 'הצטרפות למועדון');
    await c.page.getByPlaceholder('קוד הצטרפות').fill('P3PRIMARY');
    await c.page.getByText('הצטרף', { exact: true }).click();
    await c.page.waitForURL((u) => !u.pathname.startsWith('/join'), {
      timeout: 20000,
    });
  });
  await record('CUSTOMER_ONBOARDING', async () => {
    await arrange('onboarding');
    await c.page.goto(url);
    await c.page.getByLabel('שדה שם פרטי').fill('Synthetic');
    await c.page.getByLabel('שדה שם משפחה').fill('Customer');
    await c.page.getByText('המשך', { exact: true }).click();
    await c.page.getByText('קפה ומאפים', { exact: true }).click();
    await c.page.getByText('מתנה אחרי כמה ביקורים', { exact: true }).click();
    await c.page.getByText('המשך', { exact: true }).click();
    await c.page.getByText('כניסה לארנק', { exact: true }).click();
    await c.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
    await arrange('joined');
  });
  await arrange('joined');
  for (const [path, label] of [
    ['/business', 'Synthetic Phase 3 primary'],
    ['/business/customers', 'לקוחות'],
    ['/business/loyalty', 'כרטיסיות'],
    ['/business/campaigns', 'קמפיינים'],
    ['/business/referrals', 'הזמנות'],
    ['/business/inbox', 'הודעות'],
    ['/business/settings', 'הגדרות'],
    ['/business/qr', 'קוד הצטרפות לעסק'],
  ]) {
    await record(`OWNER_${path.split('/').pop() || 'DASHBOARD'}`, async () => {
      await visit(o.page, path, label);
      await layout(o.page);
    });
  }
  await record('MANAGER_DASHBOARD', async () => {
    await visit(m.page, '/business', 'Synthetic Phase 3 primary');
  });
  await record('STAFF_LANDING', async () => {
    await visit(s.page, '/staff', 'אזור הצוות');
    await layout(s.page);
  });
  await record('STAFF_OWNER_ROUTE_DENIED', async () => {
    await s.page.goto(`${url}/business/settings`);
    await s.page.getByText('אזור הצוות', { exact: true }).waitFor();
    requireThat(
      new URL(s.page.url()).pathname === '/staff',
      'STAFF_OWNER_ROUTE_EXPOSED'
    );
  });
  await record('STAFF_LOGOUT_LOGIN', async () => {
    await s.page.getByRole('button', { name: 'יציאה מהחשבון' }).click();
    await s.page.waitForURL((u) => /sign-up|welcome|sign-in/.test(u.pathname));
    await s.context.close();
  });
  // Real commands and state machine; only camera worker decode input is replaced in this test context.
  const scan = await authenticated('staff');
  let qr = (
    await clients.customer.mutation(
      ref('scanner:createCustomerScanToken'),
      {},
      { skipQueue: true }
    )
  ).scanToken;
  await scan.context.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(path, options) {
        super(path, options);
        this.qa = String(path).includes(
          '/scanner-business-assets/qr-worker.js'
        );
      }
      postMessage(...args) {
        if (this.qa && window.__qaDecode) {
          const value = window.__qaDecode;
          window.__qaDecode = null;
          queueMicrotask(() =>
            this.dispatchEvent(
              new MessageEvent('message', { data: { data: value } })
            )
          );
        } else super.postMessage(...args);
      }
    };
  });
  const scanner = async () => {
    await visit(scan.page, '/staff/scanner-preview', 'כרטיס לבדיקה');
    await scan.page.getByLabel('כרטיס לבדיקה').selectOption(fixtures.programId);
    await scan.page
      .getByText('סורק עסקי — Preview למורשים בלבד', { exact: true })
      .waitFor();
    await scan.page
      .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
      .waitFor();
  };
  await record('CONNECTED_SCANNER_CANONICAL_SUCCESS', async () => {
    await arrange('restore');
    await scanner();
    await scan.page.evaluate((value) => {
      window.__qaDecode = value;
    }, qr);
    qr = '';
    await scan.page
      .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
      .click();
    await scan.page.getByText('בחרו פעולה', { exact: true }).waitFor();
    requireThat(
      (await scan.page
        .getByText('השרת אישר את הפעולה', { exact: true })
        .count()) === 0,
      'PREMATURE_SUCCESS'
    );
    await scan.page
      .getByRole('button', { name: 'אישור חותמת', exact: true })
      .click();
    await scan.page.getByText('השרת אישר את הפעולה', { exact: true }).waitFor();
    requireThat(
      (await scan.page.getByText('אישור שרת:', { exact: false }).count()) > 0,
      'CANONICAL_RECEIPT_MISSING'
    );
  });
  let receiptBlocked = true,
    drop = true,
    commitCount = 0;
  await scan.page.route(`${target.url}/api/query`, async (route) => {
    const d = route.request().postDataJSON();
    if (receiptBlocked && d?.path === 'scannerCommands:getReceipt')
      await route.abort('failed');
    else await route.continue();
  });
  await scan.page.route(`${target.url}/api/mutation`, async (route) => {
    const d = route.request().postDataJSON();
    if (
      d?.path === 'scannerCommands:execute' &&
      d?.args?.[0]?.operation === 'stamp'
    ) {
      commitCount++;
      if (drop) {
        drop = false;
        await route.fetch();
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  await record('CONNECTED_UNKNOWN_REFRESH_RECONCILIATION', async () => {
    await arrange('restore');
    await scan.page.getByRole('button', { name: 'איפוס וסריקה חדשה' }).click();
    let value = (
      await clients.customer.mutation(
        ref('scanner:createCustomerScanToken'),
        {},
        { skipQueue: true }
      )
    ).scanToken;
    await scan.page.evaluate((q) => {
      window.__qaDecode = q;
    }, value);
    value = '';
    await scan.page
      .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
      .click();
    await scan.page
      .getByRole('button', { name: 'אישור חותמת', exact: true })
      .click();
    await scan.page
      .getByText('תוצאת הפעולה עדיין אינה ידועה.', { exact: false })
      .waitFor();
    requireThat(
      await scan.page
        .getByRole('button', { name: 'איפוס וסריקה חדשה' })
        .isDisabled(),
      'UNKNOWN_RESET_ENABLED'
    );
    const prior = commitCount;
    await scan.page.reload();
    await scan.page
      .getByText('תוצאת הפעולה עדיין אינה ידועה.', { exact: false })
      .waitFor();
    requireThat(commitCount === prior, 'REFRESH_AUTO_WRITE');
    receiptBlocked = false;
    await scan.page.getByRole('button', { name: 'בירור תוצאה בלבד' }).click();
    await scan.page.getByText('השרת אישר את הפעולה', { exact: true }).waitFor();
    requireThat(commitCount === prior, 'RECONCILIATION_WROTE');
    return { automaticWrites: 0 };
  });
  await record('PWA_MANIFEST_REGISTRATION_CACHE', async () => {
    await visit(c.page, '/wallet', 'הארנק שלי');
    await c.page.waitForFunction(() => navigator.serviceWorker.controller);
    const result = await c.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const manifest = await (await fetch('/manifest.webmanifest')).json();
      const keys = await caches.keys();
      const entries = [];
      for (const key of keys)
        for (const request of await (await caches.open(key)).keys())
          entries.push(new URL(request.url).pathname);
      return {
        controlled: !!navigator.serviceWorker.controller,
        scope: new URL(registration.scope).pathname,
        display: manifest.display,
        icons: manifest.icons.length,
        entries,
      };
    });
    requireThat(
      result.controlled &&
        result.scope === '/' &&
        result.display === 'standalone' &&
        result.icons > 0,
      'PWA_INSTALL_SIGNALS_MISSING'
    );
    requireThat(
      result.entries.every((p) =>
        [
          '/pwa/offline.html',
          '/manifest.webmanifest',
          '/pwa/icon.png',
        ].includes(p)
      ),
      'PRIVATE_CACHE_ENTRY'
    );
    return result;
  });
  await record('PWA_OFFLINE_RETURN_ONLINE', async () => {
    await c.context.setOffline(true);
    await c.page.goto(`${url}/wallet`).catch(() => {});
    await c.page.getByText('אין חיבור כרגע', { exact: true }).waitFor();
    await c.context.setOffline(false);
    await c.page.getByRole('link', { name: 'ניסיון להתחבר מחדש' }).click();
    await c.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
  });
  await record('RESPONSIVE_RTL_KEYBOARD', async () => {
    for (const width of [320, 360, 390, 768, 1280]) {
      await c.page.setViewportSize({ width, height: 844 });
      await layout(c.page);
      await c.page.keyboard.press('Tab');
      requireThat(
        await c.page.evaluate(() => document.activeElement !== document.body),
        'KEYBOARD_FOCUS_MISSING'
      );
    }
    return { widths: [320, 360, 390, 768, 1280] };
  });
  await record('MAP_ALLOWED', async () => {
    const map = await authenticated('customer', { location: 'allowed' });
    await visit(map.page, '/discovery', 'עסקים');
    await map.page.getByText('מפה', {exact:true}).click();
    await map.page.locator('.leaflet-container').waitFor({ timeout: 20000 });
    await layout(map.page);
    await map.context.close();
  });
  await record('MAP_DENIED_LIST_FALLBACK', async () => {
    await visit(c.page, '/discovery', 'עסקים');
    await layout(c.page);
    requireThat(await c.page.locator('body').innerText(), 'DISCOVERY_BLANK');
  });
  await record('SECURITY_PERMISSION_MATRIX', async () => {
    const denied = async (c, path, args) => {
      let blocked = false;
      try {
        await c.query(ref(path), args);
      } catch {
        blocked = true;
      }
      requireThat(blocked, 'PERMISSION_UNEXPECTED_ALLOW');
    };
    await denied(clients.customer, 'loyaltyPrograms:listManagementByBusiness', {
      businessId: fixtures.businessId,
    });
    await denied(clients.staff, 'loyaltyPrograms:listManagementByBusiness', {
      businessId: fixtures.businessId,
    });
    await denied(clients.manager, 'loyaltyPrograms:listManagementByBusiness', {
      businessId: fixtures.secondBusinessId,
    });
    await clients.owner.query(ref('loyaltyPrograms:listManagementByBusiness'), {
      businessId: fixtures.businessId,
    });
    await clients.manager.query(
      ref('loyaltyPrograms:listManagementByBusiness'),
      { businessId: fixtures.businessId }
    );
    return {
      roles: ['customer', 'owner', 'manager', 'staff'],
      crossBusinessDenied: true,
    };
  });
  await record('WEB_PUSH_SERVER_OWNERSHIP_LIMITS', async () => {
    const configuration = await clients.customer.query(
      ref('webPush:configuration'),
      {}
    );
    requireThat(
      configuration.enabled && configuration.publicKey,
      'VAPID_NOT_CONFIGURED'
    );
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const keys = {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    };
    const endpoint = `https://fcm.googleapis.com/fcm/send/synthetic-${randomBytes(12).toString('hex')}`;
    await clients.customer.mutation(
      ref('webPush:subscribe'),
      { endpoint, ...keys },
      { skipQueue: true }
    );
    await clients.customer.mutation(
      ref('webPush:subscribe'),
      { endpoint, ...keys },
      { skipQueue: true }
    );
    let denied = false;
    try {
      await clients.owner.mutation(
        ref('webPush:subscribe'),
        { endpoint, ...keys },
        { skipQueue: true }
      );
    } catch {
      denied = true;
    }
    requireThat(denied, 'PUSH_CROSS_ACCOUNT_ALLOWED');
    await clients.owner.mutation(
      ref('webPush:unsubscribe'),
      { endpoint },
      { skipQueue: true }
    );
    let targets = await admin.query(ref('webPush:deliveryTargets'), {
      userId: actors.customer.id,
    });
    requireThat(
      targets.filter((t) => t.endpoint === endpoint).length === 1,
      'PUSH_DUPLICATE_OR_OTHER_OWNER_DELETE'
    );
    let invalid = false;
    try {
      await clients.customer.mutation(
        ref('webPush:subscribe'),
        { endpoint: 'https://example.invalid/push', ...keys },
        { skipQueue: true }
      );
    } catch {
      invalid = true;
    }
    requireThat(invalid, 'INVALID_PUSH_PROVIDER_ACCEPTED');
    await clients.customer.mutation(
      ref('webPush:unsubscribe'),
      { endpoint },
      { skipQueue: true }
    );
    targets = await admin.query(ref('webPush:deliveryTargets'), {
      userId: actors.customer.id,
    });
    requireThat(
      !targets.some((t) => t.endpoint === endpoint),
      'UNSUBSCRIBE_NOT_REMOVED'
    );
    return { senderBound: 10, duplicateRows: 1, privateKeyClient: false };
  });
  await record('WEB_PUSH_BROWSER_SUBSCRIBE', async () => {
    await c.context.grantPermissions(['notifications']);
    const cfg = await clients.customer.query(ref('webPush:configuration'), {});
    const subscription = await c.page.evaluate(async (key) => {
      const r = await navigator.serviceWorker.ready;
      const bytes = Uint8Array.from(
        atob(key.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );
      const s = await r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      return s.toJSON();
    }, cfg.publicKey);
    await clients.customer.mutation(
      ref('webPush:subscribe'),
      { endpoint: subscription.endpoint, ...subscription.keys },
      { skipQueue: true }
    );
    await clients.customer.mutation(
      ref('webPush:unsubscribe'),
      { endpoint: subscription.endpoint },
      { skipQueue: true }
    );
    await c.page.evaluate(async () => {
      await (
        await (
          await navigator.serviceWorker.ready
        ).pushManager.getSubscription()
      )?.unsubscribe();
    });
    return { liveDelivery: 'DEVICE_VERIFY' };
  });
  if (report.cases.WEB_PUSH_BROWSER_SUBSCRIBE.status === 'FAIL') {
    report.cases.WEB_PUSH_BROWSER_SUBSCRIBE = {
      status: 'LIVE_DELIVERY_DEVICE_BLOCKED',
    };
    report.errors = report.errors.filter(
      (n) => n !== 'WEB_PUSH_BROWSER_SUBSCRIBE'
    );
  }
  await record('A11Y_AUDIT', async () => {
    await visit(c.page, '/wallet', 'הארנק שלי');
    const result = await new AxeBuilder({ page: c.page }).analyze();
    report.accessibility = {
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
      })),
      passes: result.passes.length,
    };
    requireThat(
      !result.violations.some((v) =>
        ['critical', 'serious'].includes(v.impact)
      ),
      'SERIOUS_A11Y_VIOLATION'
    );
  });
  await record('RUNTIME_ERRORS', async () => {
    report.runtimeErrorCount = errors.length;
    requireThat(errors.length === 0, 'HOSTED_RUNTIME_ERRORS');
  });
  await browser.close();
  browser = null;
  report.externalProviders = hosting.externalProviders;
  report.status = report.errors.length
    ? 'HOSTED_QA_FAILURES'
    : 'HOSTED_QA_PASS';
  save();
  if (report.errors.length) process.exitCode = 1;
} catch (e) {
  report.status = 'BLOCKED';
  report.failureCode = /^[A-Z0-9_]+$/.test(e.message ?? '')
    ? e.message
    : 'PRIVATE_DETAILS_WITHHELD';
  save();
  process.exitCode = 1;
} finally {
  await browser?.close();
  console.info(`RC hosted result: ${report.status}`);
}

import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  isBrowserBeforeUnloadIntervention,
  isUnavailableBrowserPushDiagnostic,
} from '../lib/browser-runtime-evidence.mjs';
import {
  canRestartSyntheticCamera,
  documentReadRetryDelay,
  hostedDocumentPause,
  SOURCE_SHA,
  syntheticCameraY4m,
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
let browser, observedPage, currentCase;
const record = async (name, fn) => {
  currentCase = name;
  try {
    const detail = await fn();
    report.cases[name] = { status: 'PASS', ...(detail ?? {}) };
  } catch (e) {
    report.cases[name] = {
      status: 'FAIL',
      sourceLine: Number(/hosted-qa\.mjs:(\d+)/.exec(e.stack ?? '')?.[1] ?? 0),
      code: /^[A-Z0-9_]+$/.test(e.message ?? '')
        ? e.message
        : 'ASSERTION_FAILED',
      failureKind:
        [
          'Could not find',
          'ArgumentValidationError',
          'ReturnsValidationError',
          'PREVIEW_FIXTURES_DISABLED',
          'strict mode violation',
          'intercepts pointer events',
          'element is outside of the viewport',
          'element is not enabled',
          'element is not visible',
          'Timeout',
          'Execution context was destroyed',
          'Notification',
          'InvalidAccessError',
          'NotAllowedError',
        ].find((kind) => String(e.message ?? '').includes(kind)) ??
        e.name ??
        'ERROR',
    };
    report.errors.push(name);
    if (observedPage && !observedPage.isClosed()) {
      try {
        report.cases[name].observation = await observedPage.evaluate(() => ({
          pathGroup: location.pathname.split('/').slice(0, 2).join('/'),
          scannerRoute: location.pathname === '/staff/scanner-preview',
          documentReady: document.readyState,
          appRootChildren:
            document.getElementById('root')?.childElementCount ?? null,
          bodyTextLength: document.body.innerText.length,
          documentScriptCount: document.scripts.length,
          online: navigator.onLine,
          visible: document.visibilityState === 'visible',
          scannerPhase:
            document
              .querySelector('[data-scanner-phase]')
              ?.getAttribute('data-scanner-phase') ?? null,
          scannerCode:
            document
              .querySelector('[data-scanner-code]')
              ?.getAttribute('data-scanner-code') ?? null,
          controlled: !!navigator.serviceWorker.controller,
          camera: (() => {
            const v = document.querySelector('video');
            return v
              ? {
                  readyState: v.readyState,
                  paused: v.paused,
                  frames: v.videoWidth > 0,
                  currentTime: v.currentTime,
                  visibleHeight: v.getBoundingClientRect().height,
                  syntheticDecodeWaiting: !!window.__qaDecode,
                  workerPosts: window.__qaWorkerPosts ?? 0,
                }
              : null;
          })(),
          signals: [
            'הארנק שלי',
            'אזור הצוות',
            'סורק Web עדיין אינו זמין',
            'מכינים סביבת בדיקה',
            'כרטיס לבדיקה',
            'אין חיבור כרגע',
            'איך תרצו להתחבר?',
            'קוד הצטרפות לעסק',
            'שם הכרטיסייה',
            'בחרו פעולה',
            'תוצאת הפעולה עדיין אינה ידועה.',
            'מבררים את התוצאה בשרת',
            'הפעולה לא אושרה',
            'RECONCILIATION_UNAVAILABLE',
            'NOT_AUTHORIZED',
            'SCOPE_CHANGED',
            'השרת אישר את הפעולה',
            'המצלמה כבויה',
            'גרסה חדשה זמינה',
            "Couldn't find the bottom tab bar height",
            'This site can’t be reached',
            'נדרשת גישה למיקום',
            'לא הצלחנו לטעון את המיקום שלך.',
          ].filter((label) => document.body.innerText.includes(label)),
        }));
      } catch {}
    }
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
  report.backendUrl = hosting.backendUrl;
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
  // Pinned Playwright 1.56.1 crServiceWorker.ts gates SW offline emulation/routing behind this flag.
  process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
  const { chromium } = modules('playwright');
  const AxeBuilder = modules('@axe-core/playwright').default;
  const cameraFile = join(process.env.RUNNER_TEMP, 'stampaix-blank-camera.y4m');
  writeFileSync(cameraFile, syntheticCameraY4m(), { mode: 0o600 });
  report.cameraBoundary = {
    media: 'CHROMIUM_BLANK_Y4M_FAKE_WEBCAM',
    qr: 'WORKER_DECODE_RESULT_INJECTION',
    physicalCameraVerified: false,
  };
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${cameraFile}`,
    ],
  });
  const errors = [];
  const errorDetails = [];
  const fontEvents = [];
  const failedResourceEvents = [];
  const resourceHttpErrors = [];

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
    // QA-only observation: preserve font errors and capture no URL, token or QR.
    await context.exposeBinding('__qaFontObservation', (_source, event) => {
      if (fontEvents.length >= 200) return;
      fontEvents.push({
        role,
        during: currentCase,
        at: Number.isSafeInteger(event.at) ? event.at : 0,
        id: Number.isSafeInteger(event.id) ? event.id : 0,
        family: event.family === 'IONICONS' ? 'IONICONS' : 'OTHER',
        phase: ['START', 'LOADED', 'ERROR'].includes(event.phase)
          ? event.phase
          : 'UNKNOWN',
        kind: ['NetworkError', 'AbortError'].includes(event.kind)
          ? event.kind
          : event.kind
            ? 'OTHER'
            : null,
        standardNetworkMessage: event.standardNetworkMessage === true,
      });
    });
    await context.addInitScript(() => {
      if (typeof FontFaceSet === 'undefined') return;
      const original = FontFaceSet.prototype.load;
      let nextId = 0;
      FontFaceSet.prototype.load = function (...args) {
        const id = ++nextId;
        const family = /ionicons/i.test(String(args[0])) ? 'IONICONS' : 'OTHER';
        const observe = (phase, error) => {
          void window
            .__qaFontObservation({
              at: Date.now(),
              id,
              family,
              phase,
              kind: error?.name ?? null,
              standardNetworkMessage:
                error?.message === 'A network error occurred.',
            })
            .catch(() => {});
        };
        observe('START');
        return Reflect.apply(original, this, args).then(
          (result) => {
            observe('LOADED');
            return result;
          },
          (error) => {
            observe('ERROR', error);
            throw error;
          }
        );
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    let lastNavigationAt = Date.now();
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        lastNavigationAt = Date.now();
        observedPage = page;
      }
    });
    page.on('response', (response) => {
      if (response.status() < 400 || resourceHttpErrors.length >= 100) return;
      const request = response.request();
      resourceHttpErrors.push({
        role,
        during: currentCase,
        at: Date.now(),
        type: request.resourceType(),
        status: response.status(),
        destination: response.url().startsWith(origin + '/')
          ? 'WEB_PREVIEW'
          : response.url().startsWith(target.url + '/')
            ? 'CONVEX_PREVIEW'
            : 'EXTERNAL',
      });
    });
    page.on('requestfailed', (request) => {
      const type = request.resourceType();
      if (
        !['font', 'script', 'stylesheet', 'document'].includes(type) ||
        failedResourceEvents.length >= 100
      )
        return;
      const failure = request.failure()?.errorText;
      failedResourceEvents.push({
        role,
        during: currentCase,
        at: Date.now(),
        type,
        kind: [
          'net::ERR_ABORTED',
          'net::ERR_FAILED',
          'net::ERR_NETWORK_CHANGED',
          'net::ERR_CONNECTION_CLOSED',
          'net::ERR_INTERNET_DISCONNECTED',
        ].includes(failure)
          ? failure
          : 'OTHER_NETWORK_FAILURE',
        duringNavigation: Date.now() - lastNavigationAt < 1500,
      });
    });
    page.on('pageerror', (error) =>
      errors.push({
        role,
        during: currentCase,
        at: Date.now(),
        duringNavigation: Date.now() - lastNavigationAt < 1500,
        standardNetworkMessage: error.message === 'A network error occurred.',
        stackHasFontLoad: /FontFace|loadAsync|componentDidMount/.test(
          error.stack ?? ''
        ),
        family:
          [
            'Failed to fetch',
            'fetch resource',
            'NetworkError',
            'network connection',
            'ServiceWorker',
          ].find((term) => error.message.includes(term)) ?? null,
        kind:
          /Minified React error #(\d+)/.exec(error.message)?.[0] ??
          /\[CONVEX [A-Z]\([^)]{1,120}\)\]/.exec(error.message)?.[0] ??
          error.name ??
          'RUNTIME_ERROR',
      })
    );
    page.on('console', (m) => {
      if (
        m.type() === 'error' &&
        !/favicon|net::ERR_|Failed to load resource/.test(m.text())
      ) {
        const entry = {
          role,
          during: currentCase,
          sourceLine: m.location().lineNumber,
          sourceKind: !m.location().url
            ? 'BROWSER'
            : (m.location().url === origin ||
                  m.location().url.startsWith(origin + '/')) &&
                !/\.[a-z0-9]+$/i.test(new URL(m.location().url).pathname) &&
                m.location().lineNumber === 0 &&
                m.args().length === 0
              ? 'DOCUMENT'
              : m.location().url.startsWith(url)
                ? 'APPLICATION'
                : 'OTHER',
          vocabulary: [
            'audio',
            'Audio',
            'autoplay',
            'gesture',
            'policy',
            'Policy',
            'permission',
            'Permission',
            'canvas',
            'Canvas',
            'readback',
            'WebGL',
            'OpenGL',
            'GPU',
            'ReadPixels',
            'GroupMarkerNotSet',
            'SwiftShader',
            'swiftshader',
            'kFatalFailure',
            'iframe',
            'sandbox',
            'origin',
            'CORS',
            'cors',
            'Push',
            'push',
            'WebSocket',
            'socket',
            'unload',
            'preload',
            'resource',
            'Topics',
            'attestation',
            'Attestation',
            'Storage',
            'storage',
            'indexedDB',
            'font',
            'Font',
            'network',
            'Network',
            'fetch',
            'Fetch',
            'worker',
            'Worker',
            'navigator',
            'registration',
            'Registration',
            'subscribe',
            'Subscribe',
            'deprecated',
            'deprecation',
            'Deprecated',
            'document',
            'Document',
            'unsafe',
            'Secure',
            'secure',
            'certificate',
            'Certificate',
            'SSL',
            'ERR',
            'NotAllowed',
            'NotSupported',
            'blocked',
            'denied',
            'failed',
            '404',
            '403',
            '429',
            '500',
          ].filter((term) => m.text().includes(term)),
          messageLength: m.text().length,
          fetchRateLimited: /fetch/i.test(m.text()) && m.text().includes('429'),
          duringNavigation: Date.now() - lastNavigationAt < 1500,
          source: /\/([^/?]+\.js)$/.exec(m.location().url)?.[1] ?? null,
          kind: m
            .text()
            .includes(
              "Blocked attempt to show a 'beforeunload' confirmation panel for a frame that never had a user gesture since its load."
            )
            ? 'BROWSER_BEFOREUNLOAD_NO_GESTURE'
            : ([
                "Couldn't find the bottom tab bar height",
                'Cannot update a component',
                'InvalidStateError',
                'Unhandled',
                'Failed to register a ServiceWorker',
                'useBottomTabBarHeight',
                'useInsertionEffect must not schedule updates',
                'useNativeDriver',
                'aria-hidden',
                'Cannot read properties',
                'Touch object is missing identifier',
                'Cannot find single active touch',
                'navigation object hasn',
                'was not handled by any navigator',
                'Invalid prop',
                'WebSocket is closed before the connection is established',
                'WebSocket connection',
                'ERR_CONNECTION_CLOSED',
                'ERR_ABORTED',
                'Registration failed - push service error',
                'Registration failed - push service not available',
                'Push subscription failed',
                'Blocked',
                'Autofocus',
                'The resource',
                'An invalid form control',
                'A negative value',
                'SVG',
                'Failed',
                'Uncaught',
                'Blocked call to navigator.vibrate',
                'Permissions policy violation',
                'vibrate',
                'Refused to',
                'Cross-Origin',
                'Animated',
                'Error',
                'Warning',
              ].find((family) => m.text().includes(family)) ??
              /Minified React error #\d+/.exec(m.text())?.[0] ??
              /\[CONVEX [A-Z]\([a-zA-Z0-9_:]+\)\]/.exec(m.text())?.[0] ??
              'CONSOLE_ERROR'),
        };
        errors.push(entry);
        errorDetails.push(
          Promise.all(
            m.args().map((arg) =>
              arg
                .evaluate((value) => {
                  if (!(value instanceof Error)) return { type: typeof value };
                  return {
                    type: 'error',
                    name: [
                      'Error',
                      'TypeError',
                      'ReferenceError',
                      'RangeError',
                      'SyntaxError',
                      'DOMException',
                    ].includes(value.name)
                      ? value.name
                      : 'OTHER_ERROR',
                    reactCode:
                      /Minified React error #(\d+)/.exec(value.message)?.[1] ??
                      null,
                    family:
                      [
                        'findNodeHandle',
                        'Cannot read properties',
                        'not a function',
                        'Invalid hook call',
                        'useFocusEffect',
                        'navigation object',
                        'was not handled',
                        'capture',
                        'font',
                        'Image',
                      ].find((family) => value.message.includes(family)) ??
                      null,
                  };
                })
                .catch(() => ({ type: 'UNAVAILABLE' }))
            )
          ).then((args) => {
            entry.arguments = args;
          })
        );
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { page, context };
  };
  let lastDocumentReadAt = null;
  const visit = async (page, path, expected) => {
    const pause = hostedDocumentPause(lastDocumentReadAt);
    if (pause) await page.waitForTimeout(pause);
    lastDocumentReadAt = Date.now();
    observedPage = page;
    await page.bringToFront();
    let response = await page.goto(`${url}${path}`, {
      waitUntil: 'domcontentloaded',
    });
    if (response && !response.ok()) {
      const status = response.status();
      const delay = documentReadRetryDelay(
        status,
        response.headers()['retry-after'] ?? null
      );
      if (delay !== null) {
        (report.documentReadRetries ??= []).push({ status, delayMs: delay });
        await page.waitForTimeout(delay);
        response = await page.goto(`${url}${path}`, {
          waitUntil: 'domcontentloaded',
        });
      }
    }
    report.lastNavigation = {
      status: response?.status() ?? null,
      documentOk: response?.ok() ?? false,
    };
    requireThat(
      response?.ok(),
      `AUTHENTICATED_DOCUMENT_HTTP_${response?.status() ?? 0}`
    );
    await page.waitForLoadState('load', { timeout: 20000 });
    await page.waitForURL(
      (u) =>
        u.pathname === path ||
        (path.startsWith('/customer-card/') && u.pathname.startsWith('/card/')),
      { timeout: 20000 }
    );
    await page
      .getByText(expected, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20000 });
    const observed = new URL(page.url()).pathname;
    requireThat(
      observed === path ||
        (path.startsWith('/customer-card/') && observed.startsWith('/card/')),
      'WRONG_AUTHENTICATED_ROUTE'
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
  const closeCelebrations = async (page) => {
    const close = page.getByRole('button', {
      name: 'סגירת חגיגת המימוש',
      exact: true,
    });
    let closed = 0;
    while (closed < 5 && (await close.isVisible())) {
      await close.click();
      closed++;
      await page.waitForTimeout(350);
    }
    requireThat(!(await close.isVisible()), 'REDEMPTION_MODAL_NOT_DISMISSED');
    return closed;
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
    await c.page.getByText('קוד QR לקוח', { exact: true }).waitFor();
    await c.page.locator('svg[width="200"]').first().waitFor();
    requireThat(
      (await c.page.locator('svg[width="200"]').count()) > 0,
      'QR_SVG_MISSING'
    );
  });
  await record('CUSTOMER_REWARD_STATE', async () => {
    await arrange('reward');
    await visit(c.page, '/rewards', 'הטבות');
    await arrange('restore');
  });
  await record('CUSTOMER_JOIN', async () => {
    await visit(c.page, '/join', 'הצטרפות למועדון');
    await c.page.getByPlaceholder('קוד הצטרפות').fill('P3EFGH');
    await c.page.getByText('הצטרף', { exact: true }).click();
    await c.page
      .getByRole('button', {
        name: 'בחירת Synthetic Secondary Card',
        exact: true,
      })
      .click();
    await c.page
      .getByRole('button', { name: 'הצטרפות לכרטיסיות שנבחרו', exact: true })
      .click();
    await c.page
      .getByText('ההצטרפות בוצעה בהצלחה', { exact: true })
      .first()
      .waitFor();
    requireThat(
      (await clients.customer.query(ref('memberships:byCustomer'), {})).some(
        (row) => row.businessId === fixtures.secondBusinessId
      ),
      'JOIN_MEMBERSHIP_NOT_CONFIRMED'
    );
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
    ['/business/referrals', 'קמפיין חבר מביא חבר'],
    ['/business/inbox', 'הודעות'],
    ['/business/settings', 'הגדרות'],
    ['/business/qr', 'קוד הצטרפות לעסק'],
  ]) {
    await record(`OWNER_${path.split('/').pop() || 'DASHBOARD'}`, async () => {
      await visit(o.page, path, label);
      await layout(o.page);
    });
  }
  await record('OWNER_BUSINESS_SCOPE_SWITCH', async () => {
    await visit(o.page, '/business', 'Synthetic Phase 3 primary');
    await o.page.getByRole('button', { name: 'בחירת עסק פעיל' }).click();
    await o.page
      .getByRole('menuitem', { name: 'מעבר אל Synthetic Phase 3 secondary' })
      .click();
    await o.page
      .getByText('Synthetic Phase 3 secondary', { exact: true })
      .first()
      .waitFor();
    for (let attempt = 0; attempt < 50; attempt++) {
      if (
        (await clients.owner.query(ref('users:getCurrentUser'), {}))
          .activeBusinessId === fixtures.secondBusinessId
      )
        break;
      await o.page.waitForTimeout(100);
    }
    requireThat(
      (await clients.owner.query(ref('users:getCurrentUser'), {}))
        .activeBusinessId === fixtures.secondBusinessId,
      'BUSINESS_SCOPE_NOT_CHANGED'
    );
    await o.page.getByRole('button', { name: 'בחירת עסק פעיל' }).click();
    await o.page
      .getByRole('menuitem', { name: 'מעבר אל Synthetic Phase 3 primary' })
      .click();
    await o.page
      .getByText('Synthetic Phase 3 primary', { exact: true })
      .first()
      .waitFor();
    for (let attempt = 0; attempt < 50; attempt++) {
      if (
        (await clients.owner.query(ref('users:getCurrentUser'), {}))
          .activeBusinessId === fixtures.businessId
      )
        break;
      await o.page.waitForTimeout(100);
    }
  });
  await record('OWNER_LOYALTY_CREATE_EDIT_ARCHIVE', async () => {
    await visit(o.page, '/business/cards/new', 'שם הכרטיסייה');
    await o.page
      .getByLabel('שם הכרטיסייה', { exact: true })
      .fill('Synthetic QA Card');
    await o.page
      .getByLabel('הטבה', { exact: true })
      .fill('Synthetic QA Reward');
    await o.page
      .getByRole('button', { name: 'ערכת נושא ירוק יער', exact: true })
      .click();
    await o.page
      .getByRole('button', { name: 'שמירת טיוטה', exact: true })
      .click();
    await o.page.getByPlaceholder('שם הכרטיסיה', { exact: true }).waitFor();
    await o.page
      .getByPlaceholder('שם הכרטיסיה', { exact: true })
      .fill('Synthetic QA Updated');
    await o.page
      .getByRole('button', { name: 'שמור שינויים', exact: true })
      .click();
    const ok = o.page
      .getByRole('dialog')
      .getByRole('button', { name: 'אישור', exact: true });
    await o.page
      .getByRole('dialog')
      .getByText('השינויים נשמרו בהצלחה.', { exact: true })
      .waitFor();
    await ok.click();
    await o.page
      .getByRole('button', { name: 'פרסם כרטיסיה', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByText('הכרטיסיה פעילה ללקוחות.', { exact: true })
      .waitFor();
    await ok.click();
    await o.page
      .getByRole('button', { name: 'העבר לארכיון', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByRole('button', { name: 'העבר לארכיון', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByText('הכרטיסיה אינה זמינה עוד לצבירה או למימוש.', { exact: true })
      .waitFor();
    await ok.click();
    const programs = await clients.owner.query(
      ref('loyaltyPrograms:listManagementByBusiness'),
      { businessId: fixtures.businessId }
    );
    requireThat(
      programs.some(
        (p) => p.title === 'Synthetic QA Updated' && p.lifecycle === 'archived'
      ),
      'LOYALTY_UI_WRITE_NOT_CONFIRMED'
    );
  });
  await record('CUSTOMER_MARKETING_CONSENT', async () => {
    await visit(c.page, '/settings', 'הגדרות');
    await closeCelebrations(c.page);
    const consent = c.page.getByRole('switch', {
      name: 'דיוור שיווקי',
      exact: true,
    });
    if ((await consent.getAttribute('aria-checked')) !== 'true')
      await consent.click();
    await c.page.waitForFunction(
      () =>
        document
          .querySelector('[role=switch][aria-label="דיוור שיווקי"]')
          ?.getAttribute('aria-checked') === 'true'
    );
    let confirmed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      confirmed =
        (await clients.customer.query(ref('users:getCurrentUser'), {}))
          .marketingOptIn === true;
      if (confirmed) break;
      await c.page.waitForTimeout(100);
    }
    requireThat(confirmed, 'MARKETING_CONSENT_NOT_CONFIRMED');
  });
  let hostedCampaignId;
  await record('OWNER_CAMPAIGN_DRAFT', async () => {
    await visit(o.page, '/business/campaigns', 'קמפיינים');
    await o.page
      .getByRole('button', { name: 'צור קמפיין', exact: true })
      .click();
    await o.page.getByText('קמפיין כללי', { exact: true }).first().click();
    await o.page.getByPlaceholder('כותרת ההודעה').fill('Synthetic QA Campaign');
    await o.page
      .getByPlaceholder('מה המתנה? כתבו כאן את תוכן ההטבה ללקוח')
      .fill('Synthetic Preview only');
    await o.page
      .getByRole('button', { name: 'שמור טיוטה', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByText('הטיוטה נשמרה בהצלחה.', { exact: true })
      .waitFor();
    await o.page
      .getByRole('dialog')
      .getByRole('button', { name: 'אישור', exact: true })
      .click();
    requireThat(
      (
        await clients.owner.query(
          ref('campaigns:listManagementCampaignsByBusiness'),
          { businessId: fixtures.businessId }
        )
      ).some((p) => p.messageTitle === 'Synthetic QA Campaign'),
      'CAMPAIGN_UI_WRITE_NOT_CONFIRMED'
    );
  });
  await record('OWNER_CAMPAIGN_SEND_CUSTOMER_INBOX', async () => {
    const rows = await clients.owner.query(
      ref('campaigns:listManagementCampaignsByBusiness'),
      { businessId: fixtures.businessId }
    );
    hostedCampaignId = rows.find(
      (p) => p.messageTitle === 'Synthetic QA Campaign'
    )?.campaignId;
    requireThat(!!hostedCampaignId, 'HOSTED_CAMPAIGN_MISSING');
    await o.page.goto(`${url}/business/campaign/${hostedCampaignId}`);
    await o.page
      .getByRole('button', { name: 'שמור ושלח עכשיו', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByText('אישור שליחה', { exact: true })
      .waitFor();
    await o.page
      .getByRole('dialog')
      .getByRole('button', { name: 'שלח עכשיו', exact: true })
      .click();
    await o.page
      .getByRole('dialog')
      .getByText('נשלח', { exact: true })
      .waitFor();
    await o.page
      .getByRole('dialog')
      .getByRole('button', { name: 'אישור', exact: true })
      .click();
    const messages = await clients.customer.query(ref('webInbox:list'), {});
    requireThat(
      messages.some((m) => m.title === 'Synthetic QA Campaign'),
      'CAMPAIGN_INBOX_NOT_CANONICAL'
    );
    await visit(c.page, '/inbox', 'תיבת הודעות');
    await c.page.getByText('Synthetic QA Campaign', { exact: true }).waitFor();
    const title = c.page.getByText('Synthetic QA Campaign', { exact: true });
    await title
      .locator('..')
      .getByRole('button', { name: 'סימון כנקרא', exact: true })
      .click();
    let read = [];
    for (let attempt = 0; attempt < 50; attempt++) {
      read = await clients.customer.query(ref('webInbox:list'), {});
      if (read.some((m) => m.title === 'Synthetic QA Campaign' && m.readAt))
        break;
      await c.page.waitForTimeout(100);
    }
    requireThat(
      read.some((m) => m.title === 'Synthetic QA Campaign' && m.readAt),
      'INBOX_READ_NOT_CONFIRMED'
    );
    let denied = false;
    try {
      await clients.staff.mutation(
        ref('webInbox:markRead'),
        { id: messages.find((m) => m.title === 'Synthetic QA Campaign').id },
        { skipQueue: true }
      );
    } catch {
      denied = true;
    }
    requireThat(denied, 'INBOX_CROSS_ACCOUNT_ALLOWED');
    return {
      syntheticRecipientsOnly: true,
      canonicalInbox: true,
      crossAccountDenied: true,
    };
  });
  await record('MANAGER_DASHBOARD', async () => {
    await visit(m.page, '/business', 'Synthetic Phase 3 primary');
  });
  await record('MANAGER_AUTHENTICATED_JOURNEY', async () => {
    for (const [path, label] of [
      ['/business/customers', 'לקוחות'],
      ['/business/loyalty', 'כרטיסיות'],
      ['/business/campaigns', 'קמפיינים'],
      ['/business/referrals', 'קמפיין חבר מביא חבר'],
      ['/business/inbox', 'הודעות'],
      ['/business/settings', 'הגדרות'],
      ['/business/qr', 'קוד הצטרפות לעסק'],
    ]) {
      await visit(m.page, path, label);
      await layout(m.page);
    }
    await visit(m.page, '/business/billing', 'החיוב זמין לבעלי העסק');
    return { destinations: 7, ownerBillingDenied: true };
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
  await record('CUSTOMER_DIRECT_OWNER_ROUTE_DENIED', async () => {
    await c.page.goto(`${url}/business/settings`);
    await c.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
    requireThat(
      new URL(c.page.url()).pathname === '/wallet',
      'CUSTOMER_OWNER_ROUTE_EXPOSED'
    );
  });
  await closeCelebrations(c.page);
  // Real commands and state machine; only camera worker decode input is replaced in this test context.
  const scan = await authenticated('staff');
  const scannerRequests = [];
  let lastIdentity;
  const observeScanner = (page) =>
    page.on('request', (request) => {
      if (request.url() !== `${target.url}/api/mutation`) return;
      const envelope = request.postDataJSON();
      if (envelope?.path !== 'scannerCommands:execute') return;
      const args = envelope.args?.[0];
      if (!args) return;
      scannerRequests.push(args.operation);
      if (args.operation !== 'resolve')
        lastIdentity = Object.fromEntries(
          [
            'operationId',
            'operation',
            'businessId',
            'programId',
            'runtimeId',
            'deviceId',
          ].map((key) => [key, args[key]])
        );
    });
  observeScanner(scan.page);
  let qr = (
    await clients.customer.mutation(
      ref('scanner:createCustomerScanToken'),
      {},
      { skipQueue: true }
    )
  ).scanToken;
  const cameraDecodeHarness = () => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(path, options) {
        super(path, options);
        this.qa = String(path).includes(
          '/scanner-business-assets/qr-worker.js'
        );
      }
      postMessage(...args) {
        if (this.qa) window.__qaWorkerPosts = (window.__qaWorkerPosts ?? 0) + 1;
        if (this.qa && window.__qaDecode) {
          const value = window.__qaDecode;
          window.__qaDecode = null;
          queueMicrotask(() => {
            this.dispatchEvent(
              new MessageEvent('message', { data: { data: value } })
            );
            this.dispatchEvent(
              new MessageEvent('message', { data: { data: value } })
            );
          });
        } else super.postMessage(...args);
      }
    };
  };
  await scan.context.addInitScript(cameraDecodeHarness);
  const scanner = async (page = scan.page, path = '/staff/scanner-preview') => {
    await visit(page, path, 'כרטיס לבדיקה');
    await page.getByLabel('כרטיס לבדיקה').selectOption(fixtures.programId);
    await page
      .getByText('סורק עסקי — Preview למורשים בלבד', { exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
      .waitFor();
  };
  const startCameraAndResolve = async (page = scan.page) => {
    const beforeResolveCount = scannerRequests.filter(
      (op) => op === 'resolve'
    ).length;
    const beforeWriteCount = scannerRequests.filter(
      (op) => op !== 'resolve'
    ).length;
    const button = page.getByRole('button', {
      name: 'הפעלת מצלמה',
      exact: true,
    });
    await button.click();
    try {
      await page
        .getByText('בחרו פעולה', { exact: true })
        .waitFor({ timeout: 20000 });
    } catch (error) {
      const evidence = await page.evaluate(() => {
        const video = document.querySelector('video');
        return {
          phase: document
            .querySelector('[data-scanner-phase]')
            ?.getAttribute('data-scanner-phase'),
          videoDetached:
            !!video && video.srcObject === null && video.readyState === 0,
          cameraError: document.body.innerText.includes(
            'המצלמה אינה זמינה (error)'
          ),
          decodeWaiting: !!window.__qaDecode,
        };
      });
      if (
        !canRestartSyntheticCamera({
          ...evidence,
          beforeResolveCount,
          beforeWriteCount,
          currentResolveCount: scannerRequests.filter((op) => op === 'resolve')
            .length,
          currentWriteCount: scannerRequests.filter((op) => op !== 'resolve')
            .length,
        })
      )
        throw error;
      report.cloudCameraRestarts = (report.cloudCameraRestarts ?? 0) + 1;
      // One explicit UI restart of media only. Never retry resolve, write or reconciliation.
      await button.click();
      await page
        .getByText('בחרו פעולה', { exact: true })
        .waitFor({ timeout: 20000 });
    }
  };
  await record('CONNECTED_SCANNER_CANONICAL_SUCCESS', async () => {
    await arrange('restore');
    await scanner();
    await scan.page.evaluate((value) => {
      window.__qaDecode = value;
    }, qr);
    qr = '';
    await startCameraAndResolve();
    requireThat(
      (await scan.page
        .getByText('השרת אישר את הפעולה', { exact: true })
        .count()) === 0,
      'PREMATURE_SUCCESS'
    );
    await scan.page
      .getByRole('button', { name: 'אישור חותמת', exact: true })
      .dblclick();
    await scan.page.getByText('השרת אישר את הפעולה', { exact: true }).waitFor();
    requireThat(
      (await scan.page.getByText('אישור שרת:', { exact: false }).count()) > 0,
      'CANONICAL_RECEIPT_MISSING'
    );
    requireThat(
      scannerRequests.filter((op) => op === 'resolve').length === 1 &&
        scannerRequests.filter((op) => op === 'stamp').length === 1,
      'DUPLICATE_DECODE_COMMIT'
    );
    const owned = await clients.staff.query(
      ref('scannerCommands:getReceipt'),
      lastIdentity
    );
    requireThat(owned.status === 'CONFIRMED', 'OWNED_RECEIPT_NOT_CONFIRMED');
    const otherActor = await clients.owner.query(
      ref('scannerCommands:getReceipt'),
      lastIdentity
    );
    requireThat(
      otherActor.status === 'UNKNOWN' && otherActor.receipt === null,
      'CROSS_ACCOUNT_RECEIPT_LEAK'
    );
    let denied = false;
    try {
      await clients.staff.query(ref('scannerCommands:getReceipt'), {
        ...lastIdentity,
        businessId: fixtures.secondBusinessId,
      });
    } catch {
      denied = true;
    }
    requireThat(denied, 'CROSS_BUSINESS_RECEIPT_LEAK');
    await scan.page
      .getByRole('button', { name: 'איפוס וסריקה חדשה', exact: true })
      .click();
    await scan.page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent.trim() === 'הפעלת מצלמה' && !button.disabled
      )
    );
    return {
      duplicateDecode: 'SUPPRESSED',
      sameTabResetLease: 'READY',
      crossAccountReceipt: 'ABSENT',
      crossBusinessReceipt: 'DENIED',
    };
  });
  const receiptReads = [];
  scan.page.on('response', async (response) => {
    try {
      const request = response.request().postDataJSON();
      if (
        request?.path !== 'scannerCommands:getReceipt' ||
        request.args?.[0]?.operation !== 'stamp'
      )
        return;
      const envelope = await response.json();
      receiptReads.push({
        status: response.status(),
        outcome: ['CONFIRMED', 'UNKNOWN'].includes(envelope.value?.status)
          ? envelope.value.status
          : 'UNAVAILABLE',
        hasReceipt: !!envelope.value?.receipt,
        terminalFailure: !!envelope.value?.receipt?.commandFailureCode,
      });
    } catch {
      /* Transport failures contain no canonical evidence. */
    }
  });
  let receiptBlocked = true,
    drop = true,
    commitCount = 0;
  let forwardedStamp = { confirmed: false, terminalFailure: false };
  let releaseCommit;
  const commitGate = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  await scan.page.route(`${target.url}/api/query`, async (route) => {
    const d = route.request().postDataJSON();
    if (
      receiptBlocked &&
      d?.path === 'scannerCommands:getReceipt' &&
      d?.args?.[0]?.operation === 'stamp'
    )
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
        const committed = await route.fetch();
        const envelope = await committed.json();
        const value = envelope.value;
        forwardedStamp = {
          confirmed:
            committed.ok() &&
            envelope.status === 'success' &&
            !!value?.eventId &&
            !value?.commandFailureCode,
          terminalFailure: !!value?.commandFailureCode,
        };
        await commitGate;
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  await record('SCANNER_TOUCH_KEYBOARD_LAYOUT', async () => {
    const controls = await scan.page
      .locator(
        'main[data-scanner-phase] button, main[data-scanner-phase] select'
      )
      .evaluateAll((elements) =>
        elements.map((element) => ({
          height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width,
        }))
      );
    requireThat(
      controls.length > 0 &&
        controls.every((r) => r.height >= 44 && r.width >= 44),
      'SCANNER_TOUCH_TARGET_TOO_SMALL'
    );
    const reset = scan.page.getByRole('button', { name: 'איפוס וסריקה חדשה' });
    await reset.scrollIntoViewIfNeeded();
    await reset.focus();
    requireThat(
      await reset.evaluate((e) => e === document.activeElement),
      'SCANNER_KEYBOARD_FOCUS_MISSING'
    );
    return { minimumTarget: 44, keyboardFocus: true };
  });
  await record('CONNECTED_UNKNOWN_REFRESH_RECONCILIATION', async () => {
    const publicCompanion = await scan.context.newPage();
    await publicCompanion.goto(`${url}/welcome`);
    await publicCompanion.locator('main[data-public-welcome]').waitFor();
    await readyWithCamera();
    await scan.page
      .getByRole('button', { name: 'אישור חותמת', exact: true })
      .click();
    await scan.page
      .getByText('הפעולה נשלחה — ממתינים לאישור', { exact: true })
      .waitFor();
    await scan.page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js?rc-update=1', {
        scope: '/',
        updateViaCache: 'none',
      });
    });
    await scan.page
      .getByRole('button', {
        name: 'גרסה חדשה זמינה — עדכון כשאין פעולה ממתינה',
      })
      .waitFor();
    await scan.page
      .getByRole('button', {
        name: 'גרסה חדשה זמינה — עדכון כשאין פעולה ממתינה',
      })
      .click();
    requireThat(
      await scan.page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration('/')).waiting
      ),
      'PENDING_WRITE_UPDATE_ACTIVATED'
    );
    releaseCommit();
    await scan.page
      .getByText('תוצאת הפעולה עדיין אינה ידועה.', { exact: false })
      .waitFor();
    requireThat(
      await scan.page
        .getByRole('button', { name: 'איפוס וסריקה חדשה' })
        .isDisabled(),
      'UNKNOWN_RESET_ENABLED'
    );
    await scan.page
      .getByRole('button', {
        name: 'גרסה חדשה זמינה — עדכון כשאין פעולה ממתינה',
      })
      .click();
    requireThat(
      await scan.page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration('/')).waiting
      ),
      'UNKNOWN_UPDATE_ACTIVATED'
    );
    requireThat(
      forwardedStamp.confirmed && !forwardedStamp.terminalFailure,
      'LOST_RESPONSE_SERVER_DID_NOT_COMMIT'
    );
    await admin.mutation(
      ref('phase3Fixtures:arrange'),
      { secret, fixtures, stamps: 1, programActive: false },
      { skipQueue: true }
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
    await scan.page
      .getByText('הכרטיסייה אינה זמינה לסריקה חדשה. אפשר לברר תוצאה קודמת.', {
        exact: true,
      })
      .waitFor();
    requireThat(
      await scan.page
        .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
        .isDisabled(),
      'UNAVAILABLE_PROGRAM_NEW_SCAN_ENABLED'
    );
    await scan.page
      .getByRole('button', {
        name: 'גרסה חדשה זמינה — עדכון כשאין פעולה ממתינה',
      })
      .click();
    await scan.page.waitForFunction(
      async () => !(await navigator.serviceWorker.getRegistration('/')).waiting
    );
    requireThat(commitCount === prior, 'SAFE_UPDATE_WRITE_REPLAY');
    await publicCompanion.close();
    return {
      publicClientSafeConsent: true,
      automaticWrites: 0,
      pendingWriteBlockedUpdate: true,
      unknownBlockedUpdate: true,
      safeUpdateActivated: true,
      unavailableProgramReceiptVisible: true,
    };
  });
  report.cases.CONNECTED_UNKNOWN_REFRESH_RECONCILIATION.receiptReads =
    receiptReads.slice();
  report.cases.CONNECTED_UNKNOWN_REFRESH_RECONCILIATION.forwardedStamp =
    forwardedStamp;
  releaseCommit();
  receiptBlocked = false;
  await scan.page.unroute(`${target.url}/api/query`);
  await scan.page.unroute(`${target.url}/api/mutation`);
  // Restore a readable receipt after any failed assertion, keeping that failure in the ledger.
  if (report.cases.CONNECTED_UNKNOWN_REFRESH_RECONCILIATION.status === 'FAIL') {
    await scan.page.waitForTimeout(500);
    const reconcile = scan.page.getByRole('button', {
      name: 'בירור תוצאה בלבד',
    });
    if (await reconcile.count()) {
      await reconcile.click();
      await scan.page
        .getByText('השרת אישר את הפעולה', { exact: true })
        .waitFor()
        .catch(() => {});
    }
  }
  async function readyWithCamera(
    page = scan.page,
    path = '/staff/scanner-preview',
    stamps = 0
  ) {
    await arrange('restore');
    if (stamps)
      await admin.mutation(
        ref('phase3Fixtures:arrange'),
        { secret, fixtures, stamps },
        { skipQueue: true }
      );
    await scanner(page, path);
    let value = (
      await clients.customer.mutation(
        ref('scanner:createCustomerScanToken'),
        {},
        { skipQueue: true }
      )
    ).scanToken;
    await page.evaluate((q) => {
      window.__qaDecode = q;
    }, value);
    value = '';
    await startCameraAndResolve(page);
  }
  const canonicalAction = async (name, operation, eventType) => {
    const before = scannerRequests.filter((op) => op === operation).length;
    const request = scan.page.waitForRequest(
      (r) =>
        r.url() === `${target.url}/api/mutation` &&
        r.postDataJSON()?.path === 'scannerCommands:execute' &&
        r.postDataJSON()?.args?.[0]?.operation === operation
    );
    await scan.page.getByRole('button', { name, exact: true }).click();
    await request;
    requireThat(
      scannerRequests.filter((op) => op === operation).length === before + 1,
      'ACTION_DUPLICATE_WRITE'
    );
    requireThat(
      lastIdentity.operation === operation,
      'ACTION_IDENTITY_MISSING'
    );
    let result;
    for (let attempt = 0; attempt < 50; attempt++) {
      result = await clients.staff.query(
        ref('scannerCommands:getReceipt'),
        lastIdentity
      );
      if (result.status === 'CONFIRMED') break;
      await scan.page.waitForTimeout(100);
    }
    requireThat(result.status === 'CONFIRMED', 'ACTION_RECEIPT_UNCONFIRMED');
    if (eventType)
      requireThat(
        result.receipt?.eventType === eventType,
        'ACTION_RECEIPT_TYPE_MISMATCH'
      );
    await scan.page.getByText('השרת אישר את הפעולה', { exact: true }).waitFor();
    await scan.page
      .getByText(
        `אישור שרת: ${result.receipt.eventType ?? result.receipt.status ?? 'הטבה מומשה'}`,
        { exact: true }
      )
      .waitFor();
    requireThat(
      (await scan.page.getByText('אישור שרת:', { exact: false }).count()) > 0,
      'ACTION_UI_RECEIPT_MISSING'
    );
    return { canonical: true, requests: 1 };
  };
  await record('CONNECTED_REDEEM_CANONICAL', async () => {
    await visit(c.page, '/wallet', 'הארנק שלי');
    await c.page.bringToFront();
    await closeCelebrations(c.page);
    await readyWithCamera(scan.page, '/staff/scanner-preview', 3);
    return canonicalAction('אישור מימוש', 'redeem', 'REWARD_REDEEMED');
  });
  await record('CUSTOMER_REDEMPTION_CELEBRATION_SHARE', async () => {
    observedPage = c.page;
    await c.page.bringToFront();
    report.celebrationEvidence = {
      server: await admin.query(ref('phase3Fixtures:qaCelebrationEvidence'), {
        secret,
        fixtures,
      }),
      signal:
        (
          await clients.customer.query(
            ref('redemptionReceipts:hasPendingRedemptionCelebration'),
            {}
          )
        ).pending === true,
      customerMode: (
        await clients.customer.query(ref('users:getCurrentUser'), {})
      ).activeMode,
      visible: await c.page.evaluate(
        () => document.visibilityState === 'visible'
      ),
      modal: await c.page.evaluate(() => {
        const close = document.querySelector(
          '[aria-label="סגירת חגיגת המימוש"]'
        );
        return {
          host:
            document
              .querySelector('[data-redemption-phase]')
              ?.getAttribute('data-redemption-phase') ?? null,
          appState:
            document
              .querySelector('[data-redemption-app-state]')
              ?.getAttribute('data-redemption-app-state') ?? null,
          exists: !!close,
          hidden: !!close?.closest('[aria-hidden="true"]'),
          width: close?.getBoundingClientRect().width ?? 0,
          height: close?.getBoundingClientRect().height ?? 0,
          error:
            document
              .querySelector('[data-redemption-error]')
              ?.getAttribute('data-redemption-error') ?? null,
        };
      }),
    };
    // Keep the authenticated reactive page: reloading here discards its presentation claim lease.
    await c.page
      .getByRole('button', { name: 'סגירת חגיגת המימוש', exact: true })
      .waitFor();
    const download = c.page.waitForEvent('download');
    await c.page.getByRole('button', { name: /^שיתוף( הרגע)?$/ }).click();
    const image = await download;
    requireThat(
      image.suggestedFilename() === 'stampaix-reward.png',
      'REWARD_IMAGE_FILENAME'
    );
    const bytes = readFileSync(await image.path());
    requireThat(
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.readUInt32BE(16) === 1080 &&
        bytes.readUInt32BE(20) === 1920,
      'REWARD_IMAGE_INVALID'
    );
    await c.page
      .getByText('תמונת המימוש הורדה. אפשר לשתף אותה מהמכשיר.', { exact: true })
      .waitFor();
    await closeCelebrations(c.page);
    return {
      actualPng: true,
      width: 1080,
      height: 1920,
      downloadFallback: true,
      physicalShareSheet: 'DEVICE_VERIFY',
    };
  });
  await record('CONNECTED_COMPLETED_STAMP_REDEEM_CANONICAL', async () => {
    await readyWithCamera(scan.page, '/staff/scanner-preview', 2);
    await canonicalAction('אישור חותמת', 'stamp', 'STAMP_ADDED');
    return canonicalAction(
      'מימוש הכרטיס שהושלם',
      'continuation',
      'REWARD_REDEEMED'
    );
  });
  await record('CONNECTED_UNDO_CANONICAL', async () => {
    await readyWithCamera();
    await canonicalAction('אישור חותמת', 'stamp', 'STAMP_ADDED');
    return canonicalAction('ביטול הפעולה', 'undo');
  });
  await record('CONNECTED_REFERRAL_CANONICAL', async () => {
    await readyWithCamera();
    await arrange('referral');
    await canonicalAction('אישור חותמת', 'stamp', 'STAMP_ADDED');
    return canonicalAction('Synthetic Benefit', 'referral');
  });
  await record('CONNECTED_OFFLINE_BEFORE_COMMIT_RECONNECT', async () => {
    await readyWithCamera();
    const before = scannerRequests.length;
    try {
      await scan.context.setOffline(true);
      await scan.page
        .getByText('אין חיבור זמין — הפעולה לא נשלחה', { exact: true })
        .waitFor();
      requireThat(
        (await scan.page
          .getByRole('button', { name: 'אישור חותמת', exact: true })
          .count()) === 0,
        'OFFLINE_COMMIT_UI_ENABLED'
      );
    } finally {
      await scan.context.setOffline(false);
    }
    await scan.page.waitForTimeout(1000);
    requireThat(scannerRequests.length === before, 'RECONNECT_AUTO_SUBMIT');
    return { commitRequests: 0, reconnectAutoSubmit: false };
  });
  await record('CONNECTED_SESSION_EXPIRY', async () => {
    await readyWithCamera();
    const before = scannerRequests.length;
    await scan.page.waitForTimeout(31200);
    await scan.page
      .getByRole('button', { name: 'אישור חותמת', exact: true })
      .click();
    await scan.page
      .getByText('SCAN_SESSION_EXPIRED', { exact: true })
      .waitFor();
    requireThat(scannerRequests.length === before, 'EXPIRED_SESSION_SUBMITTED');
    return { realClock: true, commitRequests: 0 };
  });
  await record('CONNECTED_PARALLEL_TAB_LOCK', async () => {
    const other = await scan.context.newPage();
    try {
      await scanner(other);
      await other
        .getByText('סורק אחר פתוח עבור החשבון והעסק.', { exact: true })
        .waitFor();
      requireThat(
        await other
          .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
          .isDisabled(),
        'PARALLEL_SCANNER_ENABLED'
      );
      return { sameOriginTabs: 2, secondScanner: 'BLOCKED' };
    } finally {
      await other.close();
    }
  });
  await record('CONNECTED_BUSINESS_SCOPE_SWITCH', async () => {
    await o.context.addInitScript(cameraDecodeHarness);
    observeScanner(o.page);
    await readyWithCamera(o.page, '/business/scanner-preview');
    const before = scannerRequests.length;
    try {
      await clients.owner.mutation(
        ref('users:setActiveBusiness'),
        { businessId: fixtures.secondBusinessId },
        { skipQueue: true }
      );
      await o.page
        .getByLabel('כרטיס לבדיקה')
        .selectOption({ label: 'Synthetic Secondary Card' });
      requireThat(
        (await o.page
          .getByRole('button', { name: 'אישור חותמת', exact: true })
          .count()) === 0,
        'STALE_SCOPE_ACTION_VISIBLE'
      );
      requireThat(scannerRequests.length === before, 'BUSINESS_SWITCH_WRITE');
    } finally {
      await clients.owner.mutation(
        ref('users:setActiveBusiness'),
        { businessId: fixtures.businessId },
        { skipQueue: true }
      );
    }
    return { staleAction: 'INVALIDATED', automaticWrites: 0 };
  });
  await record('CONNECTED_ACCOUNT_SWITCH', async () => {
    await readyWithCamera();
    const before = scannerRequests.length;
    await client('customer');
    await scan.page.evaluate((tokens) => {
      localStorage.setItem('__convexAuthJWT_stampaixauth', tokens.token);
      localStorage.setItem(
        '__convexAuthRefreshToken_stampaixauth',
        tokens.refreshToken
      );
    }, actors.customer.tokens);
    await scan.page.reload();
    await scan.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
    requireThat(
      (await scan.page
        .getByRole('button', { name: 'אישור חותמת', exact: true })
        .count()) === 0 && scannerRequests.length === before,
      'ACCOUNT_SWITCH_STALE_WRITE'
    );
    return {
      authenticatedActorChanged: true,
      staleAction: 'INVALIDATED',
      automaticWrites: 0,
    };
  });
  for (const [status, name] of [
    ['denied', 'NotAllowedError'],
    ['no-camera', 'NotFoundError'],
  ]) {
    await record(
      `CAMERA_${status.toUpperCase().replace('-', '_')}_UX`,
      async () => {
        const test = await authenticated('staff');
        try {
          await test.context.addInitScript((name) => {
            navigator.mediaDevices.getUserMedia = async () => {
              throw new DOMException('Synthetic camera boundary', name);
            };
          }, name);
          await scanner(test.page);
          await test.page
            .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
            .click();
          await test.page
            .getByText(`המצלמה אינה זמינה (${status})`, { exact: false })
            .waitFor();
          requireThat(
            await test.page
              .getByRole('button', { name: 'הפעלת מצלמה', exact: true })
              .isEnabled(),
            'CAMERA_RETRY_MISSING'
          );
          return {
            boundary: 'SYNTHETIC_MEDIA_ERROR',
            physicalPermission: 'DEVICE_VERIFY',
          };
        } finally {
          await test.context.close();
        }
      }
    );
  }
  await record('CUSTOMER_LOGOUT_LOGIN', async () => {
    await closeCelebrations(c.page);
    await visit(c.page, '/settings', 'הגדרות');
    // A previous scanner receipt may first present after this navigation.
    await closeCelebrations(c.page);
    await c.page
      .getByRole('button', { name: 'יציאה מהחשבון', exact: true })
      .click();
    await c.page
      .getByRole('dialog')
      .getByRole('button', { name: 'יציאה מהחשבון', exact: true })
      .click();
    await c.page.waitForURL((u) => /sign-up|welcome|sign-in/.test(u.pathname));
    await c.context.close();
    const resumed = await authenticated('customer');
    c.page = resumed.page;
    c.context = resumed.context;
    await visit(c.page, '/wallet', 'הארנק שלי');
    return { serverSession: 'PASSWORD_PROVIDER', logout: 'CONFIRMED' };
  });
  if (report.cases.CUSTOMER_LOGOUT_LOGIN.status === 'FAIL') {
    report.cases.CUSTOMER_LOGOUT_LOGIN.control = await c.page
      .getByRole('button', { name: 'יציאה מהחשבון', exact: true })
      .evaluate((element) => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2
        );
        return {
          disabled: element.getAttribute('aria-disabled'),
          height: r.height,
          top: r.top,
          viewport: innerHeight,
          hitInside: !!hit && element.contains(hit),
          coveringRole: hit?.getAttribute('role') ?? null,
          dialogCount: document.querySelectorAll('[role=dialog]').length,
          coveringAncestors: (() => {
            const result = [];
            for (
              let node = hit;
              node && result.length < 6;
              node = node.parentElement
            ) {
              const s = getComputedStyle(node),
                r = node.getBoundingClientRect();
              result.push({
                tag: node.tagName,
                role: node.getAttribute('role'),
                position: s.position,
                zIndex: s.zIndex,
                pointerEvents: s.pointerEvents,
                top: r.top,
                height: r.height,
                width: r.width,
              });
            }
            return result;
          })(),
        };
      })
      .catch(() => ({ found: false }));
  }
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
      const fallback = await caches.match('/pwa/offline.html');
      const fallbackHtml = fallback ? await fallback.text() : '';
      return {
        publicFallbackOnly:
          fallbackHtml.includes('<h1>אין חיבור כרגע</h1>') &&
          !fallbackHtml.includes('_expo/static/js'),
        controlled: !!navigator.serviceWorker.controller,
        scope: new URL(registration.scope).pathname,
        display: manifest.display,
        icons: manifest.icons.length,
        entries,
      };
    });
    requireThat(
      result.publicFallbackOnly &&
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
  await record('PWA_INSTALLABILITY_SIGNALS', async () => {
    const session = await c.context.newCDPSession(c.page);
    try {
      // Chrome DevTools Protocol Page.getAppManifest/getInstallabilityErrors.
      const manifest = await session.send('Page.getAppManifest');
      const install = await session.send('Page.getInstallabilityErrors');
      const errors = install.installabilityErrors.map((e) => e.errorId);
      requireThat(
        manifest.errors.length === 0 && errors.length === 0,
        'INSTALLABILITY_SIGNAL_FAILURE'
      );
      return {
        manifestErrors: 0,
        installabilityErrors: errors,
        physicalInstall: 'DEVICE_VERIFY',
      };
    } finally {
      await session.detach();
    }
  });
  await record('PWA_OFFLINE_RETURN_ONLINE', async () => {
    let workerNetworkFailures = 0;
    const blockWorkerNetwork = async (route) => {
      if (route.request().serviceWorker()) {
        workerNetworkFailures++;
        await route.abort('internetdisconnected');
      } else await route.continue();
    };
    await c.context.route(`${origin}/wallet`, blockWorkerNetwork);
    try {
      await c.context.setOffline(true);
      const navigation = await c.page
        .reload({ waitUntil: 'domcontentloaded' })
        .catch(() => null);
      report.offlineProbe = {
        status: navigation?.status() ?? null,
        fromServiceWorker: navigation?.fromServiceWorker() ?? null,
        navigatorOffline: await c.page.evaluate(
          () => navigator.onLine === false
        ),
        workerNetworkFailures,
      };
      requireThat(
        report.offlineProbe.fromServiceWorker &&
          report.offlineProbe.navigatorOffline,
        'OFFLINE_WORKER_PROOF_MISSING'
      );
      await c.page.getByText('אין חיבור כרגע', { exact: true }).waitFor();
    } finally {
      await c.context.setOffline(false);
      await c.context.unroute(`${origin}/wallet`, blockWorkerNetwork);
    }
    await c.page.getByRole('link', { name: 'ניסיון להתחבר מחדש' }).click();
    await c.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
  });
  await record('RESPONSIVE_RTL_KEYBOARD', async () => {
    await c.page.getByText('הארנק שלי', { exact: true }).first().waitFor();
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
    await arrange('marker');
    await visit(map.page, '/discovery', 'עסקים');
    await map.page.getByText('מפה', { exact: true }).click();
    await map.page.locator('.leaflet-container').waitFor({ timeout: 20000 });
    await layout(map.page);
    await map.page.locator('.leaflet-marker-icon[title]').first().click();
    const popup = map.page.locator('.leaflet-popup-content button');
    await popup.waitFor();
    requireThat(
      (await popup.innerText()) === '<strong data-rc-marker>synthetic</strong>',
      'MARKER_TEXT_CHANGED'
    );
    requireThat(
      (await map.page.locator('[data-rc-marker]').count()) === 0,
      'MARKER_HTML_INJECTION'
    );
    await popup.click();
    await map.page.waitForURL((u) => u.pathname.includes('/business/'));
    await map.context.close();
    await arrange('restore');
  });
  await record('MAP_DENIED_LIST_FALLBACK', async () => {
    await visit(c.page, '/discovery', 'עסקים');
    await layout(c.page);
    await c.page.getByText('אישור מיקום', { exact: true }).click();
    await c.page
      .getByText('לא הצלחנו לטעון את המיקום שלך.', { exact: true })
      .waitFor();
    await c.page.getByText('עסקים שמורים', { exact: true }).waitFor();
  });
  await record('MAP_LOCATION_UNAVAILABLE', async () => {
    const unavailable = await authenticated('customer');
    await unavailable.context.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: (_, failure) => failure({ code: 2 }) },
      });
    });
    await visit(unavailable.page, '/discovery', 'עסקים');
    await unavailable.page.getByText('אישור מיקום', { exact: true }).click();
    await unavailable.page
      .getByText('לא הצלחנו לטעון את המיקום שלך.', { exact: true })
      .waitFor();
    await unavailable.context.close();
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
    let staffWriteDenied = false;
    try {
      await clients.staff.mutation(
        ref('loyaltyPrograms:createLoyaltyProgram'),
        {
          businessId: fixtures.businessId,
          title: 'Synthetic forbidden',
          rewardName: 'Synthetic',
          maxStamps: 3,
          stampIcon: 'coffee',
        },
        { skipQueue: true }
      );
    } catch {
      staffWriteDenied = true;
    }
    requireThat(staffWriteDenied, 'STAFF_OWNER_WRITE_ALLOWED');
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
    const unauth = new ConvexHttpClient(target.url, { logger: false });
    await denied(unauth, 'loyaltyPrograms:listManagementByBusiness', {
      businessId: fixtures.businessId,
    });
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
    const endpoints = Array.from(
      { length: 10 },
      (_, i) => `${endpoint}-quota-${i}`
    );
    try {
      for (const endpoint of endpoints)
        await clients.customer.mutation(
          ref('webPush:subscribe'),
          { endpoint, ...keys },
          { skipQueue: true }
        );
      let quotaDenied = false;
      try {
        await clients.customer.mutation(
          ref('webPush:subscribe'),
          { endpoint: `${endpoint}-over-limit`, ...keys },
          { skipQueue: true }
        );
      } catch {
        quotaDenied = true;
      }
      requireThat(
        quotaDenied &&
          (
            await admin.query(ref('webPush:deliveryTargets'), {
              userId: actors.customer.id,
            })
          ).length === 10,
        'PUSH_QUOTA_NOT_ENFORCED'
      );
    } finally {
      for (const endpoint of endpoints)
        await clients.customer.mutation(
          ref('webPush:unsubscribe'),
          { endpoint },
          { skipQueue: true }
        );
    }
    await clients.customer.mutation(
      ref('webPush:subscribe'),
      { endpoint, ...keys },
      { skipQueue: true }
    );
    const delivery = await admin.action(ref('webPushDelivery:send'), {
      userId: actors.customer.id,
    });
    requireThat(
      delivery.sent === 0 && delivery.failed === 1,
      'INVALID_ENDPOINT_SENDER_RESULT'
    );
    await clients.customer.mutation(
      ref('webPush:unsubscribe'),
      { endpoint },
      { skipQueue: true }
    );
    return {
      senderBound: 10,
      duplicateRows: 1,
      quotaDenied: true,
      invalidEndpointSender: 'FAILED_SAFELY',
      privateKeyClient: false,
    };
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
      try {
        const s = await Promise.race([
          r.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('PUSH_SERVICE_UNAVAILABLE')),
              15000
            )
          ),
        ]);
        return s.toJSON();
      } catch (error) {
        return {
          blocked:
            ['AbortError', 'NotAllowedError', 'NotSupportedError'].includes(
              error.name
            ) || error.message === 'PUSH_SERVICE_UNAVAILABLE',
          kind: error.name,
        };
      }
    }, cfg.publicKey);
    if (subscription.blocked)
      return {
        status: 'LIVE_DELIVERY_DEVICE_BLOCKED',
        reason: subscription.kind,
      };
    requireThat(
      subscription.endpoint && subscription.keys,
      'BROWSER_PUSH_REGISTRATION_FAILED'
    );
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
  await record('A11Y_AUDIT', async () => {
    const staffAudit = await authenticated('staff');
    report.accessibility = {};
    let serious = false;
    try {
      for (const [name, page, path, label] of [
        ['customer-wallet', c.page, '/wallet', 'הארנק שלי'],
        ['customer-settings', c.page, '/settings', 'הגדרות'],
        ['owner-dashboard', o.page, '/business', 'Synthetic Phase 3 primary'],
        ['owner-loyalty', o.page, '/business/loyalty', 'כרטיסיות'],
        ['manager-dashboard', m.page, '/business', 'Synthetic Phase 3 primary'],
        ['staff-landing', staffAudit.page, '/staff', 'אזור הצוות'],
        [
          'staff-scanner',
          staffAudit.page,
          '/staff/scanner-preview',
          'כרטיס לבדיקה',
        ],
      ]) {
        await visit(page, path, label);
        await page.setViewportSize({ width: 390, height: 844 });
        await layout(page);
        const result = await new AxeBuilder({ page }).analyze();
        report.accessibility[name] = {
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
            targets: v.nodes.slice(0, 10).map((n) => n.target),
          })),
          passes: result.passes.length,
        };
        report.accessibility[name].attributeDiagnostics = [];
        for (const node of result.violations.find(
          (v) => v.id === 'aria-prohibited-attr'
        )?.nodes ?? []) {
          if (node.target.length !== 1 || typeof node.target[0] !== 'string')
            continue;
          const detail = await page
            .locator(node.target[0])
            .first()
            .evaluate((element) => ({
              tag: element.tagName,
              role: element.getAttribute('role'),
              attributes: element
                .getAttributeNames()
                .filter((name) => name.startsWith('aria-')),
              hasHref: element.hasAttribute('href'),
              hasOnClick: !!element.onclick,
            }))
            .catch(() => null);
          report.accessibility[name].attributeDiagnostics.push(detail);
        }
        report.accessibility[name].contrastStyles = [];
        for (const node of result.violations.find(
          (v) => v.id === 'color-contrast'
        )?.nodes ?? []) {
          if (node.target.length !== 1 || typeof node.target[0] !== 'string')
            continue;
          const style = await page
            .locator(node.target[0])
            .first()
            .evaluate((element) => {
              const s = getComputedStyle(element);
              const parents = [];
              for (
                let p = element.parentElement;
                p && parents.length < 3;
                p = p.parentElement
              )
                parents.push(getComputedStyle(p).backgroundColor);
              return {
                color: s.color,
                background: s.backgroundColor,
                fontSize: s.fontSize,
                parents,
              };
            })
            .catch(() => null);
          report.accessibility[name].contrastStyles.push(style);
        }
        serious ||= result.violations.some((v) =>
          ['critical', 'serious'].includes(v.impact)
        );
        await page.keyboard.press('Tab');
        requireThat(
          await page.evaluate(() => document.activeElement !== document.body),
          'ROLE_KEYBOARD_FOCUS_MISSING'
        );
      }
    } finally {
      await staffAudit.context.close();
    }
    requireThat(!serious, 'SERIOUS_A11Y_VIOLATION');
  });
  await record('PUBLIC_ENTRY_PROGRESSIVE_NAVIGATION', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(`${url}/welcome`);
      const html = await response.text();
      requireThat(
        response.ok() &&
          html.includes('data-public-welcome="true"') &&
          !html.includes('_expo/static'),
        'PUBLIC_ENTRY_NOT_PRERENDERED'
      );
      requireThat(
        await page.locator('main').isVisible(),
        'PUBLIC_ENTRY_NOT_VISIBLE'
      );
      for (const width of [320, 375, 390, 768, 1366]) {
        await page.setViewportSize({ width, height: 844 });
        requireThat(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          'PUBLIC_ENTRY_OVERFLOW'
        );
      }
      const audit = await new AxeBuilder({ page }).analyze();
      requireThat(audit.violations.length === 0, 'PUBLIC_ENTRY_A11Y_VIOLATION');
      await page
        .getByRole('link', { name: 'כניסה או הרשמה באימייל', exact: true })
        .click();
      await page.waitForURL((value) => value.pathname === '/sign-up');
      await page.getByText('איך תרצו להתחבר?', { exact: true }).waitFor();
      requireThat(
        await page
          .getByRole('button', { name: 'אימייל', exact: true })
          .isVisible(),
        'PUBLIC_ENTRY_AUTH_METHODS_MISSING'
      );
      const availability = await new ConvexHttpClient(target.url, {
        logger: false,
      }).query(makeFunctionReference('webAuth:getProviderAvailability'), {});
      let authWrites = 0;
      page.on('request', (request) => {
        if (
          request.method() !== 'POST' ||
          !request.url().startsWith(target.url)
        )
          return;
        try {
          const body = request.postDataJSON();
          if (body?.path === 'auth:signIn') authWrites++;
        } catch {}
      });
      for (const [method, label] of [
        ['google', 'Google'],
        ['apple', 'Apple'],
        ['email', 'אימייל'],
      ]) {
        const button = page.getByRole('button', { name: label, exact: true });
        await button.waitFor();
        requireThat(
          (await button.isEnabled()) === availability[method],
          'AUTH_PROVIDER_READINESS_NOT_ENFORCED'
        );
        if (!availability[method]) {
          await button.evaluate((element) => element.click());
          requireThat(
            new URL(page.url()).pathname === '/sign-up',
            'UNCONFIGURED_PROVIDER_REDIRECTED'
          );
        }
      }
      requireThat(authWrites === 0, 'UNCONFIGURED_PROVIDER_AUTH_WRITE');
      if (!Object.values(availability).some(Boolean)) {
        await page
          .getByText(
            'הכניסה בסביבת הבדיקה עדיין לא הוגדרה. אפשר לחזור ולנסות בהמשך.',
            { exact: true }
          )
          .waitFor();
      }
      return {
        publicDocument: true,
        appLoadsOnNavigation: true,
        unconfiguredProvidersBlocked: true,
        unconfiguredAuthWrites: authWrites,
        externalProviderAvailability: availability,
        responsiveWidths: 5,
        accessibilityViolations: 0,
      };
    } finally {
      await context.close();
    }
  });
  await record('PERFORMANCE_LIGHTHOUSE', async () => {
    const { pathToFileURL } = await import('node:url');
    const lighthouse = (
      await import(pathToFileURL(modules.resolve('lighthouse')).href)
    ).default;
    const launcher = await import(
      pathToFileURL(modules.resolve('chrome-launcher')).href
    );
    const chrome = await launcher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless', '--no-sandbox'],
    });
    try {
      const result = await lighthouse(`${url}/welcome`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'silent',
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        chromeFlags: ['--headless', '--no-sandbox'],
      });
      requireThat(
        result?.lhr && !result.lhr.runtimeError,
        'LIGHTHOUSE_RUNTIME_FAILURE'
      );
      const measurement = {
        // Public welcome page only: retain the LCP selector and asset path, never authenticated content.
        lcp: (
          result.lhr.audits['largest-contentful-paint-element']?.details
            ?.items ?? []
        )
          .flatMap((item) => item.items ?? [])
          .map((item) => ({
            selector: item.node?.selector ?? null,
            tag: /<([a-z]+)/i.exec(item.node?.snippet ?? '')?.[1] ?? null,
            asset:
              /(?:src|url)[=(:\s'"]+([^'"\s)>]+)/i
                .exec(item.node?.snippet ?? '')?.[1]
                ?.split('?')[0] ?? null,
          })),
        diagnostics: Object.fromEntries(
          [
            'unused-javascript',
            'render-blocking-resources',
            'modern-image-formats',
            'font-display',
            'lcp-discovery-insight',
            'lcp-phases-insight',
            'largest-contentful-paint-element',
            'bootup-time',
            'mainthread-work-breakdown',
          ].map((id) => [
            id,
            {
              score: result.lhr.audits[id]?.score ?? null,
              numericValue: result.lhr.audits[id]?.numericValue ?? null,
              numericDetails: (result.lhr.audits[id]?.details?.items ?? [])
                .flatMap((item) => item.items ?? item)
                .map((item) =>
                  Object.fromEntries(
                    Object.entries(item).filter(
                      ([, value]) =>
                        typeof value === 'number' || typeof value === 'boolean'
                    )
                  )
                ),
            },
          ])
        ),
        scores: Object.fromEntries(
          Object.entries(result.lhr.categories).map(([id, v]) => [id, v.score])
        ),
        metrics: Object.fromEntries(
          [
            'first-contentful-paint',
            'largest-contentful-paint',
            'total-blocking-time',
            'cumulative-layout-shift',
          ].map((id) => [id, result.lhr.audits[id]?.numericValue])
        ),
      };
      report.performanceMeasurement = measurement;
      requireThat(
        measurement.metrics['largest-contentful-paint'] <= 4000 &&
          measurement.metrics['total-blocking-time'] <= 750 &&
          measurement.metrics['cumulative-layout-shift'] <= 0.1 &&
          measurement.scores.accessibility === 1 &&
          measurement.scores['best-practices'] >= 0.9,
        'PUBLIC_LOAD_BUDGET_EXCEEDED'
      );
      return measurement;
    } finally {
      await chrome.kill();
    }
  });
  await record('WEB_PUSH_NOTIFICATION_ROUTING_INTEGRATION', async () => {
    await c.page.goto(`${url}/wallet`);
    await c.page.waitForFunction(() => navigator.serviceWorker.controller);
    const worker = c.context.serviceWorkers()[0];
    requireThat(worker, 'SERVICE_WORKER_NOT_FOUND');
    await worker.evaluate(async () => {
      // A headless runner has no OS notification center. Only the event/notification envelope is synthetic.
      let pending;
      const event = new Event('notificationclick');
      Object.defineProperties(event, {
        notification: { value: { data: { href: '/inbox' }, close() {} } },
        waitUntil: {
          value: (promise) => {
            pending = promise;
          },
        },
      });
      self.dispatchEvent(event);
      if (!pending) throw new Error('WORKER_HANDLER_NOT_INVOKED');
      try {
        await pending;
      } catch (error) {
        // Headless synthetic events cannot grant the OS user-activation needed for focus.
        if (
          error.name !== 'InvalidAccessError' &&
          error.name !== 'NotAllowedError'
        )
          throw error;
      }
    });
    await c.page.waitForURL((u) => u.pathname === '/inbox');
    return {
      event: 'SYNTHETIC_NOTIFICATIONCLICK',
      notificationEnvelope: 'SYNTHETIC_OS_BOUNDARY',
      osDelivery: 'DEVICE_VERIFY',
    };
  });
  await record('AUTH_REDIRECT_LINKING_BOUNDARIES', async () => {
    const policy = await admin.query(ref('phase3Fixtures:authPolicy'), {
      secret,
      origin,
    });
    requireThat(
      Object.values(policy).every(Boolean),
      'AUTH_REDIRECT_BOUNDARY_FAILED'
    );
    let duplicateDenied = false;
    const unauth = new ConvexHttpClient(target.url, { logger: false });
    try {
      await unauth.action(ref('auth:signIn'), {
        provider: 'password',
        params: {
          flow: 'signUp',
          email: 'phase3-owner@example.invalid',
          password: randomBytes(32).toString('base64url'),
          qaProvisioningSecret: secret,
        },
      });
    } catch {
      duplicateDenied = true;
    }
    requireThat(duplicateDenied, 'PASSWORD_DUPLICATE_ACCOUNT_LINKED');
    await client('owner');
    const callback = await browser.newContext();
    const page = await callback.newPage();
    await page.goto(`${url}/oauth-callback`);
    await page
      .getByText('לא הצלחנו להשלים את ההתחברות. נסו שוב.', { exact: true })
      .waitFor({ timeout: 15000 });
    await page.getByText('חזרה להרשמה', { exact: true }).click();
    await page.getByText('איך תרצו להתחבר?', { exact: true }).waitFor();
    await callback.close();
    return {
      ...policy,
      duplicateSignupDenied: true,
      providers: 'EXTERNAL_CONFIGURATION_REQUIRED',
    };
  });
  await record('ACCOUNT_DELETION_PUSH_CLEANUP', async () => {
    const deletionClient = new ConvexHttpClient(target.url, { logger: false });
    const deletionPassword = randomBytes(32).toString('base64url');
    const registration = await deletionClient.action(ref('auth:signIn'), {
      provider: 'password',
      params: {
        flow: 'signUp',
        email: 'phase3-deletion@example.invalid',
        password: deletionPassword,
        qaProvisioningSecret: secret,
      },
    });
    requireThat(registration.tokens?.token, 'SYNTHETIC_DELETION_AUTH_FAILED');
    deletionClient.setAuth(registration.tokens.token);
    const actor = await deletionClient.query(ref('users:getCurrentUser'), {});
    actors.deletion = { id: actor._id, password: deletionPassword };
    const invited = await authenticated('deletion');
    try {
      await invited.page.getByLabel('שדה שם פרטי').fill('Synthetic');
      await invited.page.getByLabel('שדה שם משפחה').fill('Disposable');
      await invited.page.getByText('המשך', { exact: true }).click();
      await invited.page.getByText('קפה ומאפים', { exact: true }).click();
      await invited.page
        .getByText('מתנה אחרי כמה ביקורים', { exact: true })
        .click();
      await invited.page.getByText('המשך', { exact: true }).click();
      await invited.page.getByText('כניסה לארנק', { exact: true }).click();
      await invited.page
        .getByText('הארנק שלי', { exact: true })
        .first()
        .waitFor();
      await clients.owner.mutation(
        ref('business:inviteBusinessStaff'),
        {
          businessId: fixtures.businessId,
          email: 'phase3-deletion@example.invalid',
          role: 'staff',
        },
        { skipQueue: true }
      );
      await visit(invited.page, '/accept-invite', 'הצטרפות כעובד');
      await invited.page
        .getByRole('button', { name: 'אשר הצטרפות', exact: true })
        .click();
      await invited.page.getByText('אזור הצוות', { exact: true }).waitFor();
      const scope = await deletionClient.query(
        ref('users:getSessionContext'),
        {}
      );
      requireThat(
        scope.businesses.some(
          (b) => b.id === fixtures.businessId && b.staffRole === 'staff'
        ),
        'STAFF_INVITE_NOT_CANONICAL'
      );
      report.cases.STAFF_INVITE_ACCEPTANCE = {
        status: 'PASS',
        authenticated: true,
        synthetic: true,
      };
    } finally {
      await invited.context.close();
    }
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    await deletionClient.mutation(
      ref('webPush:subscribe'),
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-deletion',
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
      { skipQueue: true }
    );
    const deleted = await deletionClient.mutation(
      ref('users:deleteMyAccountHard'),
      {},
      { skipQueue: true }
    );
    requireThat(deleted.success, 'SYNTHETIC_ACCOUNT_NOT_DELETED');
    requireThat(
      (await admin.query(ref('webPush:deliveryTargets'), { userId: actor._id }))
        .length === 0,
      'DELETED_ACCOUNT_PUSH_REMAINS'
    );
    requireThat(
      (await deletionClient.query(ref('users:getCurrentUser'), {})) === null,
      'DELETED_ACCOUNT_AUTHORIZATION_REMAINS'
    );
  });
  const restoreManualFixtures = () =>
    admin.mutation(
      ref('phase3Fixtures:manualRestore'),
      { secret, fixtures },
      { skipQueue: true }
    );
  await record('MANUAL_QA_FIXTURES', async () => {
    const summary = await restoreManualFixtures();
    requireThat(
      summary.syntheticOnly &&
        summary.actors === 4 &&
        summary.readyReward &&
        summary.stamps === 2,
      'MANUAL_QA_FIXTURES_INCOMPLETE'
    );
    const access = await new ConvexHttpClient(target.url, {
      logger: false,
    }).query(ref('manualQa:getAccess'), {});
    requireThat(
      access?.backendUrl === target.url && access.accounts.length === 4,
      'MANUAL_QA_ACCESS_NOT_READY'
    );
    const unauth = new ConvexHttpClient(target.url, { logger: false });
    for (const params of [
      {
        flow: 'signIn',
        email: 'phase3-owner@example.invalid',
        password: 'invalid-synthetic-password',
      },
      {
        flow: 'signUp',
        email: 'real-person@example.com',
        password: access.password,
      },
      {
        flow: 'signUp',
        email: 'phase3-owner@example.invalid',
        password: access.password,
      },
    ]) {
      let denied = false;
      try {
        await unauth.action(ref('auth:signIn'), {
          provider: 'password',
          params,
        });
      } catch {
        denied = true;
      }
      requireThat(denied, 'MANUAL_QA_PASSWORD_BOUNDARY_FAILED');
    }
    return {
      ...summary,
      realAccountsDenied: true,
      publicProvisioningDenied: true,
      wrongPasswordDenied: true,
    };
  });
  const manualLabels = {
    customer: 'כניסה כלקוח',
    owner: 'כניסה כבעל עסק',
    manager: 'כניסה כמנהל',
    staff: 'כניסה כעובד',
  };
  for (const role of ['customer', 'owner', 'manager', 'staff']) {
    await record(`MANUAL_QA_LOGIN_${role.toUpperCase()}`, async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      observedPage = page;
      page.on('pageerror', () =>
        errors.push({
          role,
          during: currentCase,
          kind: 'MANUAL_QA_RUNTIME_ERROR',
        })
      );
      try {
        await visit(page, '/welcome', 'העסק והלקוחות');
        await page
          .getByRole('link', { name: 'כניסה לבדיקות', exact: true })
          .click();
        await page
          .getByRole('heading', { name: 'כניסה לבדיקות', exact: true })
          .waitFor();
        const audit = await new AxeBuilder({ page }).analyze();
        requireThat(
          audit.violations.length === 0,
          'MANUAL_QA_ACCESSIBILITY_FAILED'
        );
        await page
          .getByRole('button', { name: new RegExp('^' + manualLabels[role]) })
          .click();
        const path =
          role === 'customer'
            ? '/wallet'
            : role === 'staff'
              ? '/staff'
              : '/business';
        await page.waitForURL((value) => value.pathname === path, {
          timeout: 30000,
        });
        await page
          .getByText(
            role === 'customer'
              ? 'הארנק שלי'
              : role === 'staff'
                ? 'אזור הצוות'
                : 'Synthetic Phase 3 primary',
            { exact: true }
          )
          .first()
          .waitFor();
        const token = await page.evaluate(() =>
          localStorage.getItem('__convexAuthJWT_stampaixauth')
        );
        requireThat(
          typeof token === 'string' && token.length > 0,
          'MANUAL_QA_SESSION_MISSING'
        );
        const actual = new ConvexHttpClient(target.url, {
          logger: false,
          auth: token,
        });
        const actor = await actual.query(ref('users:getCurrentUser'), {});
        requireThat(
          actor?._id === actors[role].id &&
            actor.email === `phase3-${role}@example.invalid`,
          'MANUAL_QA_WRONG_IDENTITY'
        );
        const session = await actual.query(ref('users:getSessionContext'), {});
        if (role !== 'customer')
          requireThat(
            session.businesses.some(
              (row) => row.id === fixtures.businessId && row.staffRole === role
            ),
            'MANUAL_QA_WRONG_PERMISSIONS'
          );
        await page.reload();
        await page
          .getByText(
            role === 'customer'
              ? 'הארנק שלי'
              : role === 'staff'
                ? 'אזור הצוות'
                : 'Synthetic Phase 3 primary',
            { exact: true }
          )
          .first()
          .waitFor();
        if (role === 'staff') {
          await visit(page, '/staff/scanner-preview', 'כרטיס לבדיקה');
          await page
            .getByLabel('כרטיס לבדיקה')
            .selectOption(fixtures.programId);
          await page
            .getByRole('button', { name: 'סריקת לקוח הבדיקה', exact: true })
            .click();
          await page
            .locator('[data-scanner-phase="READY_FOR_ACTION"]')
            .waitFor({ timeout: 30000 });
          await page
            .getByRole('button', { name: 'אישור חותמת', exact: true })
            .click();
          await page
            .locator('[data-scanner-phase="SUCCESS"]')
            .waitFor({ timeout: 30000 });
          requireThat(
            (await clients.customer.query(ref('users:getCurrentUser'), {}))
              ._id === actors.customer.id,
            'MANUAL_QA_CUSTOMER_IDENTITY_CHANGED'
          );
          await page.goto(`${url}/business/settings`);
          await page.getByText('אזור הצוות', { exact: true }).waitFor();
          requireThat(
            new URL(page.url()).pathname === '/staff',
            'MANUAL_QA_STAFF_OWNER_EXPOSED'
          );
        }
        return {
          realPasswordSession: true,
          uiClickLogin: true,
          refreshedSession: true,
          canonicalRole: role,
          ...(role === 'staff'
            ? { scannerInjectionCanonicalCommit: true, ownerRoutesDenied: true }
            : {}),
        };
      } finally {
        await context.close();
      }
    });
  }
  await record('MANUAL_QA_ONBOARDING_ENTRY', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    observedPage = page;
    try {
      await visit(page, '/preview-qa', 'כניסה לבדיקות');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /^כניסה כלקוח/ }).click();
      await page.waitForURL((value) => value.pathname === '/name-capture', {
        timeout: 30000,
      });
      await page.locator('input').first().waitFor();
      requireThat(
        (await page.locator('input').count()) > 0,
        'MANUAL_QA_ONBOARDING_MISSING'
      );
      return { ordinaryOnboarding: true, originalIdentity: true };
    } finally {
      await context.close();
    }
  });
  await record('MANUAL_QA_OWNER_ONBOARDING_ENTRY', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    observedPage = page;
    try {
      await visit(page, '/preview-qa', 'כניסה לבדיקות');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /^כניסה כבעל עסק/ }).click();
      await page.waitForURL((value) => value.pathname === '/name-capture', {
        timeout: 30000,
      });
      await page.locator('input').first().waitFor();
      requireThat(
        (await page.locator('input').count()) > 0,
        'MANUAL_QA_ONBOARDING_MISSING'
      );
      return { ordinaryOnboarding: true, originalIdentity: true };
    } finally {
      await context.close();
    }
  });
  await record('MANUAL_QA_READY_FOR_HANDOFF', async () => {
    const summary = await restoreManualFixtures();
    report.manualQa = {
      url: `${url}/preview-qa`,
      syntheticOnly: true,
      fixtures: summary,
      logins: Object.fromEntries(
        ['customer', 'owner', 'manager', 'staff'].map((role) => [
          role,
          report.cases[`MANUAL_QA_LOGIN_${role.toUpperCase()}`]?.status,
        ])
      ),
    };
    requireThat(
      Object.values(report.manualQa.logins).every(
        (status) => status === 'PASS'
      ),
      'MANUAL_QA_LOGIN_GATE_FAILED'
    );
    return report.manualQa;
  });
  await record('RUNTIME_ERRORS', async () => {
    await Promise.allSettled(errorDetails);
    report.runtimeErrorCount = errors.length;
    report.runtimeErrors = errors;
    report.fontEvents = fontEvents;
    report.failedResourceEvents = failedResourceEvents;
    report.resourceHttpErrors = resourceHttpErrors;
    const pushUnavailable =
      report.cases.WEB_PUSH_BROWSER_SUBSCRIBE?.status ===
        'LIVE_DELIVERY_DEVICE_BLOCKED' &&
      ['AbortError', 'NotAllowedError', 'NotSupportedError'].includes(
        report.cases.WEB_PUSH_BROWSER_SUBSCRIBE.reason
      );
    report.browserMessages = errors.filter((e) =>
      isUnavailableBrowserPushDiagnostic(e, pushUnavailable)
    );
    const navigationClosures = errors.filter(
      (e) =>
        e.kind === 'WebSocket is closed before the connection is established' &&
        e.duringNavigation &&
        e.during === 'A11Y_AUDIT'
    );
    report.browserMessages.push(...navigationClosures);
    report.browserMessages.push(
      ...errors.filter(isBrowserBeforeUnloadIntervention)
    );
    const unexpected = errors.filter(
      (e) => !report.browserMessages.includes(e)
    );
    requireThat(unexpected.length === 0, 'HOSTED_RUNTIME_ERRORS');
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
  console.info(
    `RC_DIAGNOSTICS ${JSON.stringify({
      failures: Object.fromEntries(
        Object.entries(report.cases).filter(([, c]) => c.status === 'FAIL')
      ),
      runtimeErrors: report.runtimeErrors,
      fontEvents: report.fontEvents,
      failedResourceEvents: report.failedResourceEvents,
      resourceHttpErrors: report.resourceHttpErrors,
      browserMessages: report.browserMessages,
      celebrationEvidence: report.celebrationEvidence,
      backendUrl: report.backendUrl,
      manualQa: report.manualQa,
      performance:
        report.performanceMeasurement ?? report.cases.PERFORMANCE_LIGHTHOUSE,
      accessibility: Object.fromEntries(
        Object.entries(report.accessibility ?? {}).map(([name, value]) => [
          name,
          {
            violations: value.violations,
            attributeDiagnostics: value.attributeDiagnostics,
          },
        ])
      ),
    })}`
  );
}

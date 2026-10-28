import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Transpiler } from 'bun';
import {
  approvedPreviewGoogleEnvironment,
  canRestartSyntheticCamera,
  documentReadRetryDelay,
  hostedDocumentPause,
  PHASE3_BRANCH,
  PREVIEW_NAME,
  previewPublicEnvironment,
  requireActionsRevision,
  requireAuthorizedPreviewTarget,
  requireControlDelta,
  requirePreviewTarget,
  requireProjectPreviewKey,
  SOURCE_SHA,
  sanitizedPreviewFailure,
  selectPreviewDeployment,
  summarizeSyntheticResetScope,
  syntheticCameraY4m,
} from '../../scripts/lib/phase3c1-preview-guard.mjs';

describe('Phase 3C-1C isolated Preview guards', () => {
  test('the real runner loads its imports and cannot deploy outside verified Actions', () => {
    const isolated = mkdtempSync(join(tmpdir(), 'stampaix-runner-import-'));
    const evidence = join(isolated, 'phase3c1-preview-evidence.json');
    try {
      const result = spawnSync(
        process.execPath,
        [resolve('scripts/phase3c1-preview-e2e.mjs')],
        {
          cwd: isolated,
          env: { PATH: process.env.PATH, GITHUB_ACTIONS: 'false' },
          encoding: 'utf8',
          timeout: 15000,
        }
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        'Phase 3 Preview result: BLOCKED; stage: LOCAL_GUARDS'
      );
      const report = JSON.parse(readFileSync(evidence, 'utf8'));
      expect(report.deployed).toBe(false);
      expect(report.productionTouched).toBe(false);
      expect(report.devTouched).toBe(false);
    } finally {
      try {
        unlinkSync(evidence);
      } catch {}
      rmdirSync(isolated);
    }
  });
  test('Google credentials require an explicit owned exact-Preview binding', () => {
    const target = { url: 'https://synthetic-preview.convex.cloud' };
    const previous = {
      AUTH_GOOGLE_ID: '123-synthetic.apps.googleusercontent.com',
      AUTH_GOOGLE_SECRET: 'synthetic-secret',
    };
    expect(approvedPreviewGoogleEnvironment(previous, target, true)).toEqual(
      {}
    );
    const approved = {
      ...previous,
      PHASE3_GOOGLE_AUTH_PREVIEW_URL: target.url,
    };
    expect(approvedPreviewGoogleEnvironment(approved, target, true)).toEqual(
      approved
    );
    expect(() =>
      approvedPreviewGoogleEnvironment(approved, target, false)
    ).toThrow('GOOGLE_AUTH_PREVIEW_BINDING_MISMATCH');
    expect(() =>
      approvedPreviewGoogleEnvironment(
        {
          ...approved,
          PHASE3_GOOGLE_AUTH_PREVIEW_URL:
            'https://aware-llama-850.convex.cloud',
        },
        target,
        true
      )
    ).toThrow('GOOGLE_AUTH_PREVIEW_BINDING_MISMATCH');
    expect(() =>
      approvedPreviewGoogleEnvironment(
        { ...approved, AUTH_GOOGLE_ID: 'undefined' },
        target,
        true
      )
    ).toThrow('GOOGLE_AUTH_PREVIEW_CONFIGURATION_INVALID');
    expect(() =>
      approvedPreviewGoogleEnvironment(
        { ...approved, AUTH_GOOGLE_SECRET: '' },
        target,
        true
      )
    ).toThrow('GOOGLE_AUTH_PREVIEW_CONFIGURATION_INVALID');
  });
  test('pinned SDK accepts only project Preview keys', () => {
    expect(requireProjectPreviewKey('preview:team:project|synthetic')).toEqual({
      kind: 'teamAndProjectSlugs',
      teamSlug: 'team',
      projectSlug: 'project',
    });
    for (const key of [
      '',
      undefined,
      'dev:target|test',
      'prod:target|test',
      'preview:target|test',
      'preview:team:project|',
      'preview:team:project|test|extra',
      'preview:team:project|test\n',
    ])
      expect(() => requireProjectPreviewKey(key)).toThrow(
        'PROJECT_PREVIEW_KEY_REQUIRED'
      );
  });
  const claim = {
    deploymentName: 'synthetic-preview',
    instanceUrl: 'https://synthetic-preview.convex.cloud',
    adminKey: 'preview:synthetic-preview|synthetic',
  };
  const auth = {
    deploymentName: claim.deploymentName,
    url: claim.instanceUrl,
    adminKey: claim.adminKey,
    deploymentType: 'preview',
    reference: `preview/${PREVIEW_NAME}`,
  };
  test('an existing authorized Preview is reused without claiming a replacement', async () => {
    const calls = [];
    const result = await selectPreviewDeployment(
      async (path, body) => {
        calls.push(path);
        expect(body.previewName).toBe(PREVIEW_NAME);
        return auth;
      },
      {
        kind: 'teamAndProjectSlugs',
        teamSlug: 'synthetic',
        projectSlug: 'synthetic',
      }
    );
    expect(calls).toEqual(['deployment/authorize_preview']);
    expect(result.reused).toBe(true);
    expect(result.claim).toBeNull();
    expect(result.target.url).toBe(claim.instanceUrl);
  });
  test('only authoritative not-found allows creating the fixed named Preview', async () => {
    const calls = [];
    let first = true;
    const result = await selectPreviewDeployment(async (path, body) => {
      calls.push(path);
      if (first) {
        first = false;
        throw new Error('PREVIEW_MANAGEMENT_HTTP_404');
      }
      if (path === 'claim_preview_deployment') {
        expect(body.identifier).toBe(PREVIEW_NAME);
        return claim;
      }
      return auth;
    }, {});
    expect(calls).toEqual([
      'deployment/authorize_preview',
      'claim_preview_deployment',
      'deployment/authorize_preview',
    ]);
    expect(result.reused).toBe(false);
  });
  test.each([
    400, 401, 403, 500,
  ])('HTTP %s cannot recreate a target', async (status) => {
    const calls = [];
    await expect(
      selectPreviewDeployment(async (path) => {
        calls.push(path);
        throw new Error(`PREVIEW_MANAGEMENT_HTTP_${status}`);
      }, {})
    ).rejects.toThrow(`PREVIEW_MANAGEMENT_HTTP_${status}`);
    expect(calls).toEqual(['deployment/authorize_preview']);
  });
  test('existing authorization still rejects DEV/Production, unknown shape and wrong logical name', () => {
    expect(requireAuthorizedPreviewTarget(auth).url).toBe(claim.instanceUrl);
    for (const change of [
      { deploymentType: 'dev' },
      { deploymentType: 'prod' },
      { reference: 'preview/different' },
      { url: 'http://synthetic-preview.convex.cloud' },
      { adminKey: '' },
    ]) {
      expect(() =>
        requireAuthorizedPreviewTarget({ ...auth, ...change })
      ).toThrow('PREVIEW_TARGET_NOT_PROVEN');
    }
    for (const name of ['utmost-fennec-280', 'aware-llama-850']) {
      expect(() =>
        requireAuthorizedPreviewTarget({
          ...auth,
          deploymentName: name,
          url: `https://${name}.convex.cloud`,
        })
      ).toThrow('PREVIEW_TARGET_NOT_PROVEN');
    }
  });
  test('type, key, name and canonical URL must agree before any deploy', () => {
    expect(requirePreviewTarget(claim, auth).url).toBe(claim.instanceUrl);
    expect(
      requirePreviewTarget(claim, {
        ...auth,
        adminKey: 'preview:synthetic-preview|independently-issued',
      }).url
    ).toBe(claim.instanceUrl);
    expect(
      requirePreviewTarget(claim, {
        ...auth,
        adminKey: 'opaque-issued-admin-credential',
      }).url
    ).toBe(claim.instanceUrl);
    for (const change of [
      { deploymentType: 'dev' },
      { deploymentType: 'prod' },
      { url: 'http://synthetic-preview.convex.cloud' },
      { deploymentName: 'different' },
      { adminKey: '' },
      { adminKey: 'short' },
    ])
      expect(() =>
        requirePreviewTarget(claim, { ...auth, ...change })
      ).toThrow();
    for (const name of ['utmost-fennec-280', 'aware-llama-850'])
      expect(() =>
        requirePreviewTarget(
          {
            deploymentName: name,
            instanceUrl: `https://${name}.convex.cloud`,
            adminKey: `preview:${name}|synthetic`,
          },
          {
            deploymentName: name,
            url: `https://${name}.convex.cloud`,
            adminKey: `preview:${name}|synthetic`,
            deploymentType: 'preview',
          }
        )
      ).toThrow();
  });
  const sha = 'a'.repeat(40);
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'PetFamily2/STAMPIX_APP',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_HEAD_REF: PHASE3_BRANCH,
    PHASE3_SOURCE_SHA: SOURCE_SHA,
    PHASE3_PR_HEAD: sha,
    VERIFIED_HEAD_SHA: sha,
    PHASE3_PREVIEW_NAME: PREVIEW_NAME,
  };
  test('exact verified PR control revision and immutable source only; local invocation cannot provision', () => {
    expect(() => requireActionsRevision(env, sha, '1.31.5')).not.toThrow();
    for (const [k, v] of Object.entries(env))
      expect(() =>
        requireActionsRevision({ ...env, [k]: `${v}-wrong` }, sha, '1.31.5')
      ).toThrow();
    expect(() => requireActionsRevision(env, sha, '1.31.6')).toThrow();
  });
  test('client env receives only isolated public selectors, never deploy/auth credentials or Production', () => {
    const value = previewPublicEnvironment(
      {
        CONVEX_DEPLOY_KEY: 'secret',
        JWT_PRIVATE_KEY: 'secret',
        EXPO_PUBLIC_CONVEX_URL_DEV: 'https://utmost-fennec-280.convex.cloud',
        EXPO_PUBLIC_CONVEX_URL_PROD: 'https://aware-llama-850.convex.cloud',
        EXPO_PUBLIC_RC_API_KEY: 'prod',
        EXPO_PUBLIC_SENTRY_DSN: 'prod',
      },
      { url: claim.instanceUrl },
      ['synthetic-actor'],
      ['synthetic-business']
    );
    expect(value.EXPO_PUBLIC_CONVEX_URL_DEV).toBe(claim.instanceUrl);
    expect(value.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL).toBe(claim.instanceUrl);
    expect(value.EXPO_PUBLIC_WEB_SCANNER_BACKEND).toBe('verified-preview');
    expect(value.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(
      Object.keys(value).every(
        (k) => k.startsWith('EXPO_PUBLIC_') && !/PROD|RC_|SENTRY/.test(k)
      )
    ).toBe(true);
  });
  test('fixtures are internal, fail closed, generated outside ordinary Convex source', () => {
    const template = readFileSync(
      'scripts/phase3-preview/fixtures.ts.template',
      'utf8'
    );
    expect(template).toContain('internalMutation');
    expect(template).toContain('PHASE3_FIXTURE_SECRET');
    expect(template).toContain('CONVEX_CLOUD_URL');
    expect(template).toContain('example.invalid');
    expect(template).not.toMatch(
      /export const \w+ = (mutation|query|action)\(/
    );
    const workflow = readFileSync(
      '.github/workflows/branch-verify.yml',
      'utf8'
    );
    expect(workflow).toContain('shared-web:');
    expect(workflow).toContain('CONVEX_DEV_DEPLOY_KEY');
    expect(workflow).not.toMatch(/^\s+(push|schedule|workflow_dispatch):/m);
    expect(workflow).not.toContain('phase3c1-preview-e2e.mjs');
    expect(workflow).toContain("needs.verify.result == 'success'");
    expect(workflow).toContain('needs: verify');
    expect(workflow).not.toContain('createWorkflowDispatch');
  });
});

test('control changes cannot alter the immutable application or backend', () => {
  expect(() =>
    requireControlDelta(['.github/workflows/branch-verify.yml'])
  ).not.toThrow();
  for (const path of [
    'convex/scanner.ts',
    'convex/schema.ts',
    'package.json',
    'app/_layout.tsx',
    'components/QrScanner.tsx',
  ])
    expect(() => requireControlDelta([path])).toThrow();
  expect(() => requireControlDelta([])).toThrow();
});

const resetSource = readFileSync(
  'scripts/phase3-preview/fixtures.ts.template',
  'utf8'
)
  .split('export const reset = internalMutation({')[1]
  .split('const fixtureValidator')[0];
const makeReset = () => {
  const transpiler = new Transpiler({ loader: 'ts' });
  const code = transpiler.transformSync(
    'const reset = internalMutation({' + resetSource + ';'
  );
  return new Function(
    'internalMutation',
    'v',
    'schema',
    'guard',
    code + '; return reset;'
  )(
    (value) => value,
    {
      string: () => ({}),
      boolean: () => ({}),
      number: () => ({}),
      object: () => ({}),
    },
    {
      tables: {
        users: {},
        businesses: {},
        events: {},
        staffInvites: {},
        staffEvents: {},
      },
    },
    () => {}
  );
};
function resetContext(rows) {
  const deleted = [];
  return {
    deleted,
    db: {
      query: (table) => ({
        take: async (n) => (rows[table] ?? []).slice(0, n),
      }),
      delete: async (id) => deleted.push(id),
    },
  };
}
test('synthetic reset is atomic: rogue actor or business prevents every deletion', async () => {
  const reset = makeReset();
  for (const rows of [
    { users: [{ _id: 'u', email: 'real@example.com' }] },
    {
      users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
      businesses: [{ _id: 'b', externalId: 'unknown', ownerUserId: 'u' }],
    },
    {
      users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
      events: [{ _id: 'e', actorUserId: 'other' }],
    },
  ]) {
    const ctx = resetContext(rows);
    await expect(reset.handler(ctx, { secret: 'test' })).rejects.toThrow();
    expect(ctx.deleted).toEqual([]);
  }
});
test('synthetic reset clears only bounded verified fixtures', async () => {
  const reset = makeReset();
  const ctx = resetContext({
    users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
    businesses: [{ _id: 'b', externalId: 'phase3-primary', ownerUserId: 'u' }],
    events: [{ _id: 'e', actorUserId: 'u', businessId: 'b' }],
  });
  expect(await reset.handler(ctx, { secret: 'test' })).toEqual({
    syntheticOnly: true,
    deleted: 3,
  });
  expect(ctx.deleted).toEqual(['u', 'b', 'e']);
  const oversized = resetContext({
    users: Array.from({ length: 201 }, () => ({
      _id: 'u',
      email: 'phase3-owner@example.invalid',
    })),
  });
  await expect(reset.handler(oversized, { secret: 'test' })).rejects.toThrow(
    'SYNTHETIC_RESET_LIMIT'
  );
  expect(oversized.deleted).toEqual([]);
});

test('reset diagnostics contain counts only, including deleted actor references', () => {
  const report = summarizeSyntheticResetScope(
    new Map([
      [
        'users',
        [{ _id: 'private-actor', email: 'phase3-owner@example.invalid' }],
      ],
      [
        'businesses',
        [
          {
            _id: 'private-business',
            externalId: 'phase3-primary',
            ownerUserId: 'private-actor',
          },
        ],
      ],
      [
        'events',
        [
          {
            _id: 'private-event',
            actorUserId: 'deleted-private-actor',
            businessId: 'private-business',
            qr: 'private-qr',
          },
        ],
      ],
    ])
  );
  expect(report.unknownActors.actorUserId).toBe(1);
  expect(report.nonSyntheticActorCount).toBe(0);
  expect(report.nonSyntheticBusinessCount).toBe(0);
  expect(report.totalRows).toBe(3);
  expect(JSON.stringify(report)).not.toContain('private');
  expect(JSON.stringify(report)).not.toContain('example.invalid');
});
test('wrapped remote reset errors reveal only fixed known codes', () => {
  expect(
    sanitizedPreviewFailure(
      new Error('Server Error: RESET_UNKNOWN_ACTOR_SCOPE private-payload')
    )
  ).toBe('RESET_UNKNOWN_ACTOR_SCOPE');
  expect(sanitizedPreviewFailure(new Error('private-payload'))).toBe(
    'PRIVATE_ERROR_DETAILS_WITHHELD'
  );
  expect(
    sanitizedPreviewFailure(
      new Error('RESET_UNKNOWN_ACTOR_SCOPE_EXTRA private')
    )
  ).toBe('PRIVATE_ERROR_DETAILS_WITHHELD');
  expect(
    sanitizedPreviewFailure(
      new Error('RESET_UNKNOWN_ACTOR_SCOPE RESET_NON_SYNTHETIC_ACTOR')
    )
  ).toBe('PRIVATE_ERROR_DETAILS_WITHHELD');
});

function deletedSyntheticStaffRows() {
  return {
    users: [{ _id: 'owner', email: 'phase3-owner@example.invalid' }],
    businesses: [
      { _id: 'business', externalId: 'phase3-primary', ownerUserId: 'owner' },
    ],
    staffInvites: [
      {
        _id: 'invite',
        businessId: 'business',
        invitedByUserId: 'owner',
        invitedEmail: 'phase3-deletion@example.invalid',
        targetRole: 'staff',
        status: 'accepted',
        invitedUserId: 'deleted',
        acceptedByUserId: 'deleted',
        acceptedAt: 42,
      },
    ],
    staffEvents: [
      {
        _id: 'acceptance',
        businessId: 'business',
        actorUserId: 'deleted',
        targetUserId: 'deleted',
        targetInviteId: 'invite',
        eventType: 'invite_accepted',
        toRole: 'staff',
        toStatus: 'active',
        createdAt: 42,
      },
    ],
  };
}
test('synthetic reset accepts deleted staff only with matching canonical invitation evidence', async () => {
  const rows = deletedSyntheticStaffRows();
  const ctx = resetContext(rows);
  expect(await makeReset().handler(ctx, { secret: 'test' })).toEqual({
    syntheticOnly: true,
    deleted: 4,
  });
  expect(ctx.deleted).toEqual(['owner', 'business', 'invite', 'acceptance']);
});
test('deleted staff evidence cannot authorize mismatched, real, or unrelated actor references', async () => {
  const cases = [
    (rows) => {
      rows.staffInvites[0].invitedEmail = 'real@example.com';
    },
    (rows) => {
      rows.staffInvites[0].invitedByUserId = 'unknown';
    },
    (rows) => {
      rows.staffInvites[0].status = 'pending';
    },
    (rows) => {
      rows.staffInvites[0].targetRole = 'manager';
    },
    (rows) => {
      rows.staffInvites[0].invitedUserId = 'different';
    },
    (rows) => {
      rows.staffInvites[0].acceptedByUserId = 'different';
    },
    (rows) => {
      rows.staffEvents[0].businessId = 'different';
    },
    (rows) => {
      rows.staffEvents[0].targetInviteId = 'different';
    },
    (rows) => {
      rows.staffEvents[0].createdAt = 43;
    },
    (rows) => {
      rows.staffEvents[0].eventType = 'removed';
    },
    (rows) => {
      rows.staffEvents[0].targetUserId = 'different';
    },
    (rows) => {
      rows.staffEvents[0].actorUserId = 'different';
    },
    (rows) => {
      rows.staffEvents = [];
    },
    (rows) => {
      rows.events = [
        { _id: 'unrelated', businessId: 'business', actorUserId: 'deleted' },
      ];
    },
    (rows) => {
      rows.events = [
        { _id: 'unrelated', businessId: 'business', customerUserId: 'deleted' },
      ];
    },
  ];
  for (const mutate of cases) {
    const rows = deletedSyntheticStaffRows();
    mutate(rows);
    const ctx = resetContext(rows);
    await expect(makeReset().handler(ctx, { secret: 'test' })).rejects.toThrow(
      'RESET_UNKNOWN'
    );
    expect(ctx.deleted).toEqual([]);
  }
});

test('cloud camera restart cannot retry a decoded, pending or sent scanner operation', () => {
  const evidence = {
    phase: 'CAMERA_READY',
    videoDetached: true,
    cameraError: true,
    decodeWaiting: true,
    beforeResolveCount: 2,
    currentResolveCount: 2,
    beforeWriteCount: 1,
    currentWriteCount: 1,
  };
  expect(canRestartSyntheticCamera(evidence)).toBe(true);
  for (const changes of [
    { phase: 'RESOLVING' },
    { phase: 'READY_FOR_ACTION' },
    { phase: 'COMMITTING' },
    { phase: 'UNKNOWN_OUTCOME' },
    { phase: 'RECONCILING' },
    { phase: 'SUCCESS' },
    { videoDetached: false },
    { cameraError: false },
    { decodeWaiting: false },
    { currentResolveCount: 3 },
    { currentWriteCount: 2 },
  ]) {
    expect(canRestartSyntheticCamera({ ...evidence, ...changes })).toBe(false);
  }
});

test('one media restart requires live stalled fake capture and cannot repeat a scanner command', () => {
  const evidence = {
    phase: 'CAMERA_READY',
    videoStalled: true,
    liveVideoTracks: 1,
    decodeWaiting: true,
    beforeResolveCount: 0,
    currentResolveCount: 0,
    beforeWriteCount: 0,
    currentWriteCount: 0,
  };
  expect(canRestartSyntheticCamera(evidence)).toBe(true);
  for (const patch of [
    { currentResolveCount: undefined },
    { beforeWriteCount: -1 },
    { liveVideoTracks: 0 },
    { liveVideoTracks: 2 },
    { videoStalled: false },
    { decodeWaiting: false },
    { currentResolveCount: 1 },
    { currentWriteCount: 1 },
    { phase: 'UNKNOWN_OUTCOME' },
    { phase: 'COMMITTING' },
  ])
    expect(canRestartSyntheticCamera({ ...evidence, ...patch })).toBe(false);
});

test('document GET retries are bounded and exclude auth, app and unknown errors', () => {
  const now = Date.parse('2026-10-07T00:00:00Z');
  expect(documentReadRetryDelay(502, null, now)).toBe(3000);
  expect(documentReadRetryDelay(429, null, now)).toBe(15000);
  expect(documentReadRetryDelay(429, '', now)).toBe(15000);
  expect(documentReadRetryDelay(503, '2', now)).toBe(2000);
  expect(
    documentReadRetryDelay(504, 'Wed, 07 Oct 2026 00:00:05 GMT', now)
  ).toBe(5000);
  expect(documentReadRetryDelay(429, '30', now)).toBe(30000);
  for (const status of [
    0, 200, 400, 401, 403, 404, 408, 409, 422, 500, 501, 599,
  ]) {
    expect(documentReadRetryDelay(status, null, now)).toBeNull();
  }
  for (const header of [
    '31',
    '99',
    'invalid',
    '-1',
    'Wed, 07 Oct 2026 00:01:00 GMT',
  ]) {
    expect(documentReadRetryDelay(429, header, now)).toBeNull();
  }
});
test('fake webcam fixture has bounded blank YUV frames without QR or auth data', () => {
  const data = syntheticCameraY4m();
  const headerEnd = data.indexOf(10) + 1;
  expect(data.subarray(0, headerEnd).toString()).toBe(
    'YUV4MPEG2 W320 H240 F10:1 Ip A1:1 C420jpeg\n'
  );
  const pixels = 320 * 240;
  const bytesPerFrame = 6 + (pixels * 3) / 2;
  expect(data.length).toBe(headerEnd + 20 * bytesPerFrame);
  for (let frame = 0; frame < 20; frame++) {
    const offset = headerEnd + frame * bytesPerFrame;
    expect(data.subarray(offset, offset + 6).toString()).toBe('FRAME\n');
    expect(
      data
        .subarray(offset + 6, offset + 6 + pixels)
        .every((byte) => byte === 64 + frame)
    ).toBe(true);
    expect(
      data
        .subarray(offset + 6 + pixels, offset + bytesPerFrame)
        .every((byte) => byte === 128)
    ).toBe(true);
  }
});

test('hosted document pacing is bounded and affects reads only', () => {
  expect(hostedDocumentPause(null, 1000)).toBe(0);
  expect(hostedDocumentPause(1000, 1500)).toBe(9500);
  expect(hostedDocumentPause(1000, 3000)).toBe(8000);
  expect(hostedDocumentPause(1000, 4000)).toBe(7000);
  expect(hostedDocumentPause(1000, 11000)).toBe(0);
  expect(hostedDocumentPause(2000, 1000)).toBe(10000);
  for (const values of [
    [-1, 1000],
    [1000, -1],
    [NaN, 1000],
    [1000, Infinity],
  ])
    expect(() => hostedDocumentPause(...values)).toThrow(
      'INVALID_DOCUMENT_READ_CLOCK'
    );
});

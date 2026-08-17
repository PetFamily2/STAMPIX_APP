import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
} from './_generated/server';
import type { MutationCtx } from './_generated/server';

export type RevocableProvider = 'apple' | 'google';

export type OAuthTokenSetLike = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  id_token?: unknown;
};

export type EncryptedProviderCredentialCapture = {
  credentialVersion: 1;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: number;
};

type ProviderRevocationJob = {
  _id: Id<'providerRevocationJobs'>;
  provider: RevocableProvider;
  providerAccountId?: string;
  providerAccountFingerprint?: string;
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: number;
  credentialVersion: number;
  status: 'queued' | 'running' | 'completed' | 'manual_required';
  attemptCount: number;
  nextAttemptAt?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  purgeAfter?: number;
  terminalCode?: string;
};

type TokenEnvelope = {
  version: 1;
  iv: string;
  ciphertext: string;
};

const ENCRYPTION_VERSION = 1 as const;
const ENCRYPTION_KEY_ENV = 'AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY';
const TOKEN_AAD_PREFIX = 'stampix-provider-revocation';
const PROVIDER_FINGERPRINT_KEY_DOMAIN =
  'stampix-provider-identity-fingerprint:key:v1';
const PROVIDER_FINGERPRINT_INPUT_DOMAIN =
  'stampix-provider-identity-fingerprint:input:v1';
const TOKEN_IV_BYTES = 12;
const PROVIDER_HTTP_TIMEOUT_MS = 8_000;
const MAX_REVOCATION_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 15 * 60_000] as const;
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_RUNNING_MS = 15 * 60 * 1000;
const SWEEP_BATCH_SIZE = 50;
const MAX_OIDC_NUMERIC_DATE_SECONDS = 9_999_999_999;
// Matches oauth4webapi's default tolerance used by the installed Convex Auth flow.
export const OIDC_ISSUANCE_CLOCK_TOLERANCE_MS = 30_000;

export const PROVIDER_CREDENTIAL_PROFILE_FIELD =
  '__stampixEncryptedProviderCredential';
export const PROVIDER_OAUTH_ISSUED_AT_PROFILE_FIELD =
  '__stampixOAuthIssuedAt';
export const PROVIDER_REAUTH_RETRY_REQUIRED =
  'PROVIDER_REAUTH_RETRY_REQUIRED';

type ProviderRevocationRunResult =
  | { status: 'stale' }
  | { status: 'completed' | 'manual_required' }
  | { status: 'queued'; nextAttemptAt: number };

const internalProviderCredentialsApi = {
  runProviderRevocationInternal: makeFunctionReference<
    'action',
    { jobId: Id<'providerRevocationJobs'> },
    ProviderRevocationRunResult
  >('providerCredentials:runProviderRevocationInternal'),
  claimProviderRevocationJobInternal: makeFunctionReference<
    'mutation',
    { jobId: Id<'providerRevocationJobs'> },
    ProviderRevocationJob | null
  >('providerCredentials:claimProviderRevocationJobInternal'),
  retryProviderRevocationJobInternal: makeFunctionReference<
    'mutation',
    { jobId: Id<'providerRevocationJobs'>; terminalCode: string },
    ProviderRevocationRunResult
  >('providerCredentials:retryProviderRevocationJobInternal'),
  completeProviderRevocationJobInternal: makeFunctionReference<
    'mutation',
    {
      jobId: Id<'providerRevocationJobs'>;
      status: 'completed' | 'manual_required';
      terminalCode: string;
    },
    { status: 'stale' | 'completed' | 'manual_required' }
  >('providerCredentials:completeProviderRevocationJobInternal'),
} as const;

function isRevocableProvider(value: unknown): value is RevocableProvider {
  return value === 'apple' || value === 'google';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_INVALID');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function importEncryptionKey(
  usage: KeyUsage,
  env: Partial<Record<string, string | undefined>> = process.env
) {
  const encodedKey = env[ENCRYPTION_KEY_ENV]?.trim();
  if (!encodedKey) {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_MISSING');
  }
  const keyBytes = base64UrlToBytes(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_INVALID');
  }
  return await crypto.subtle.importKey(
    'raw',
    copyBytesToArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    [usage]
  );
}

async function importProviderFingerprintKey(
  env: Partial<Record<string, string | undefined>> = process.env
) {
  const encodedKey = env[ENCRYPTION_KEY_ENV]?.trim();
  if (!encodedKey) {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_MISSING');
  }
  const keyBytes = base64UrlToBytes(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_INVALID');
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    copyBytesToArrayBuffer(keyBytes),
    'HKDF',
    false,
    ['deriveKey']
  );
  const encoder = new TextEncoder();
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(PROVIDER_FINGERPRINT_KEY_DOMAIN),
      info: encoder.encode(`${PROVIDER_FINGERPRINT_KEY_DOMAIN}:hmac`),
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}

export async function createProviderAccountFingerprint(
  provider: RevocableProvider,
  providerAccountId: string,
  env: Partial<Record<string, string | undefined>> = process.env
) {
  const key = await importProviderFingerprintKey(env);
  const input = new TextEncoder().encode(
    `${PROVIDER_FINGERPRINT_INPUT_DOMAIN}:${provider}:${providerAccountId}`
  );
  const signature = await crypto.subtle.sign('HMAC', key, input);
  return bytesToBase64Url(new Uint8Array(signature));
}

async function tryCreateProviderAccountFingerprint(
  provider: RevocableProvider,
  providerAccountId: string,
  env: Partial<Record<string, string | undefined>> = process.env
) {
  try {
    return await createProviderAccountFingerprint(
      provider,
      providerAccountId,
      env
    );
  } catch {
    return undefined;
  }
}

function tokenAdditionalData(
  provider: RevocableProvider,
  providerAccountId: string,
  tokenKind: 'access' | 'refresh'
) {
  return new TextEncoder().encode(
    `${TOKEN_AAD_PREFIX}:v${ENCRYPTION_VERSION}:${provider}:${providerAccountId}:${tokenKind}`
  );
}

async function encryptToken(
  provider: RevocableProvider,
  providerAccountId: string,
  tokenKind: 'access' | 'refresh',
  token: string,
  env: Partial<Record<string, string | undefined>> = process.env
) {
  const key = await importEncryptionKey('encrypt', env);
  const iv = crypto.getRandomValues(new Uint8Array(TOKEN_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: copyBytesToArrayBuffer(iv),
      additionalData: tokenAdditionalData(
        provider,
        providerAccountId,
        tokenKind
      ),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(token)
  );
  const envelope: TokenEnvelope = {
    version: ENCRYPTION_VERSION,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptProviderToken(
  provider: RevocableProvider,
  providerAccountId: string,
  tokenKind: 'access' | 'refresh',
  serializedEnvelope: string,
  env: Partial<Record<string, string | undefined>> = process.env
) {
  let envelope: TokenEnvelope;
  try {
    envelope = JSON.parse(serializedEnvelope) as TokenEnvelope;
  } catch {
    throw new Error('PROVIDER_TOKEN_ENVELOPE_INVALID');
  }
  if (
    envelope.version !== ENCRYPTION_VERSION ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('PROVIDER_TOKEN_ENVELOPE_INVALID');
  }
  const key = await importEncryptionKey('decrypt', env);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copyBytesToArrayBuffer(base64UrlToBytes(envelope.iv)),
        additionalData: tokenAdditionalData(
          provider,
          providerAccountId,
          tokenKind
        ),
        tagLength: 128,
      },
      key,
      copyBytesToArrayBuffer(base64UrlToBytes(envelope.ciphertext))
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('PROVIDER_TOKEN_DECRYPTION_FAILED');
  }
}

function resolveAccessTokenExpiresAt(
  tokens: OAuthTokenSetLike,
  now: number
): number | undefined {
  if (typeof tokens.expires_at === 'number' && Number.isFinite(tokens.expires_at)) {
    return Math.floor(tokens.expires_at * 1000);
  }
  if (typeof tokens.expires_in === 'number' && Number.isFinite(tokens.expires_in)) {
    return now + Math.floor(tokens.expires_in * 1000);
  }
  return undefined;
}

export async function encryptProviderCredentialCapture(
  provider: RevocableProvider,
  providerAccountId: string,
  tokens: OAuthTokenSetLike,
  options: {
    env?: Partial<Record<string, string | undefined>>;
    now?: number;
  } = {}
): Promise<EncryptedProviderCredentialCapture | null> {
  const accessToken = normalizeOptionalString(tokens.access_token);
  const refreshToken = normalizeOptionalString(tokens.refresh_token);
  if (!accessToken && !refreshToken) {
    return null;
  }
  const env = options.env ?? process.env;
  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    accessToken
      ? encryptToken(provider, providerAccountId, 'access', accessToken, env)
      : Promise.resolve(undefined),
    refreshToken
      ? encryptToken(provider, providerAccountId, 'refresh', refreshToken, env)
      : Promise.resolve(undefined),
  ]);
  return {
    credentialVersion: ENCRYPTION_VERSION,
    encryptedAccessToken,
    encryptedRefreshToken,
    accessTokenExpiresAt: accessToken
      ? resolveAccessTokenExpiresAt(tokens, options.now ?? Date.now())
      : undefined,
  };
}

export function readEncryptedProviderCredentialCapture(
  profile: Record<string, unknown>
): EncryptedProviderCredentialCapture | null {
  const value = profile[PROVIDER_CREDENTIAL_PROFILE_FIELD];
  if (!value || typeof value !== 'object') {
    return null;
  }
  const capture = value as Partial<EncryptedProviderCredentialCapture>;
  if (capture.credentialVersion !== ENCRYPTION_VERSION) {
    return null;
  }
  const encryptedAccessToken = normalizeOptionalString(
    capture.encryptedAccessToken
  );
  const encryptedRefreshToken = normalizeOptionalString(
    capture.encryptedRefreshToken
  );
  if (!encryptedAccessToken && !encryptedRefreshToken) {
    return null;
  }
  return {
    credentialVersion: ENCRYPTION_VERSION,
    encryptedAccessToken,
    encryptedRefreshToken,
    accessTokenExpiresAt:
      typeof capture.accessTokenExpiresAt === 'number' &&
      Number.isFinite(capture.accessTokenExpiresAt)
        ? capture.accessTokenExpiresAt
        : undefined,
  };
}

function isValidProviderIssuedAtMilliseconds(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_OIDC_NUMERIC_DATE_SECONDS * 1000
  );
}

export function readProviderOAuthIssuedAt(
  profile: Record<string, unknown>
): number | null {
  const value = profile[PROVIDER_OAUTH_ISSUED_AT_PROFILE_FIELD];
  return isValidProviderIssuedAtMilliseconds(value) ? value : null;
}

export function resolveOAuthProviderIssuedAt(profile: Record<string, unknown>) {
  const issuedAtSeconds = profile.iat;
  const expiresAtSeconds = profile.exp;
  if (
    typeof issuedAtSeconds !== 'number' ||
    !Number.isSafeInteger(issuedAtSeconds) ||
    issuedAtSeconds <= 0 ||
    issuedAtSeconds > MAX_OIDC_NUMERIC_DATE_SECONDS ||
    typeof expiresAtSeconds !== 'number' ||
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= issuedAtSeconds ||
    expiresAtSeconds > MAX_OIDC_NUMERIC_DATE_SECONDS
  ) {
    return null;
  }
  return issuedAtSeconds * 1000;
}

function revocationJobBlocksFreshOAuth(
  job: Pick<ProviderRevocationJob, 'status' | 'completedAt'>,
  providerIssuedAt: number
) {
  if (job.status === 'queued' || job.status === 'running') {
    return true;
  }
  if (job.status === 'manual_required') {
    return false;
  }
  const earliestPlausibleIssuanceAt =
    providerIssuedAt - OIDC_ISSUANCE_CLOCK_TOLERANCE_MS;
  return (
    typeof job.completedAt !== 'number' ||
    job.completedAt >= earliestPlausibleIssuanceAt
  );
}

export async function providerReauthRetryRequired(
  ctx: Pick<MutationCtx, 'db'>,
  args: {
    provider: RevocableProvider;
    providerAccountId: string;
    providerIssuedAt: number | null;
    env?: Partial<Record<string, string | undefined>>;
  }
) {
  const providerIssuedAt = args.providerIssuedAt;
  if (!isValidProviderIssuedAtMilliseconds(providerIssuedAt)) {
    return true;
  }
  const providerAccountFingerprint =
    await createProviderAccountFingerprint(
      args.provider,
      args.providerAccountId,
      args.env
    );
  const fingerprintMatches = await ctx.db
    .query('providerRevocationJobs')
    .withIndex('by_provider_providerAccountFingerprint', (q) =>
      q
        .eq('provider', args.provider)
        .eq('providerAccountFingerprint', providerAccountFingerprint)
    )
    .collect();

  if (
    fingerprintMatches.some((job) =>
      revocationJobBlocksFreshOAuth(job, providerIssuedAt)
    )
  ) {
    return true;
  }

  for (const status of ['queued', 'running'] as const) {
    const activeJobs = await ctx.db
      .query('providerRevocationJobs')
      .withIndex('by_status_updatedAt', (q) => q.eq('status', status))
      .collect();
    if (
      activeJobs.some(
        (job) =>
          job.provider === args.provider &&
          job.providerAccountFingerprint === undefined &&
          job.providerAccountId === args.providerAccountId
      )
    ) {
      return true;
    }
  }

  return false;
}

export async function upsertProviderRevocationCredential(
  ctx: any,
  args: {
    userId: Id<'users'>;
    provider: RevocableProvider;
    providerAccountId: string;
    capture: EncryptedProviderCredentialCapture;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const existing = await ctx.db
    .query('providerRevocationCredentials')
    .withIndex('by_provider_providerAccountId', (q: any) =>
      q
        .eq('provider', args.provider)
        .eq('providerAccountId', args.providerAccountId)
    )
    .unique();
  const credentialValues = {
    encryptedAccessToken: args.capture.encryptedAccessToken,
    accessTokenExpiresAt: args.capture.accessTokenExpiresAt,
    credentialVersion: args.capture.credentialVersion,
    updatedAt: now,
    ...(args.capture.encryptedRefreshToken
      ? { encryptedRefreshToken: args.capture.encryptedRefreshToken }
      : {}),
  };
  if (existing) {
    await ctx.db.patch(existing._id, {
      userId: args.userId,
      ...credentialValues,
    });
    return existing._id;
  }
  return await ctx.db.insert('providerRevocationCredentials', {
    userId: args.userId,
    provider: args.provider,
    providerAccountId: args.providerAccountId,
    ...credentialValues,
    createdAt: now,
  });
}

function credentialKey(provider: RevocableProvider, providerAccountId: string) {
  return `${provider}:${providerAccountId}`;
}

export async function prepareProviderRevocationsForUser(
  ctx: any,
  userId: Id<'users'>,
  now = Date.now()
) {
  const credentials = await ctx.db
    .query('providerRevocationCredentials')
    .withIndex('by_userId', (q: any) => q.eq('userId', userId))
    .collect();
  const identities = await ctx.db
    .query('userIdentities')
    .withIndex('by_userId', (q: any) => q.eq('userId', userId))
    .collect();
  const authAccounts = (
    await Promise.all(
      (['apple', 'google'] as const).map((provider) =>
        ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (q: any) =>
            q.eq('userId', userId).eq('provider', provider)
          )
          .collect()
      )
    )
  ).flat();

  const candidateMap = new Map<
    string,
    { provider: RevocableProvider; providerAccountId: string }
  >();
  for (const identity of identities) {
    if (
      isRevocableProvider(identity.provider) &&
      typeof identity.providerUserId === 'string'
    ) {
      candidateMap.set(
        credentialKey(identity.provider, identity.providerUserId),
        {
          provider: identity.provider,
          providerAccountId: identity.providerUserId,
        }
      );
    }
  }
  for (const account of authAccounts) {
    if (
      isRevocableProvider(account.provider) &&
      typeof account.providerAccountId === 'string'
    ) {
      candidateMap.set(
        credentialKey(account.provider, account.providerAccountId),
        {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        }
      );
    }
  }
  const credentialsByKey = new Map<string, any>();
  for (const credential of credentials) {
    if (isRevocableProvider(credential.provider)) {
      const key = credentialKey(
        credential.provider,
        credential.providerAccountId
      );
      credentialsByKey.set(key, credential);
      candidateMap.set(key, {
        provider: credential.provider,
        providerAccountId: credential.providerAccountId,
      });
    }
  }

  const queuedProviders = new Set<RevocableProvider>();
  const manualFallbackProviders = new Set<RevocableProvider>();
  let createdJobs = 0;
  for (const [key, candidate] of candidateMap) {
    const credential = credentialsByKey.get(key);
    const providerAccountFingerprint =
      await tryCreateProviderAccountFingerprint(
        candidate.provider,
        candidate.providerAccountId
      );
    const hasRefreshToken = Boolean(credential?.encryptedRefreshToken);
    const hasUsableAccessToken = Boolean(
      credential?.encryptedAccessToken &&
        (!credential.accessTokenExpiresAt ||
          credential.accessTokenExpiresAt > now)
    );
    if (!hasRefreshToken && !hasUsableAccessToken) {
      await ctx.db.insert('providerRevocationJobs', {
        provider: candidate.provider,
        providerAccountFingerprint,
        credentialVersion: ENCRYPTION_VERSION,
        status: 'manual_required',
        attemptCount: 0,
        terminalCode: credential ? 'NO_USABLE_TOKEN' : 'LEGACY_NO_TOKEN',
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        purgeAfter: now + RECEIPT_RETENTION_MS,
      });
      manualFallbackProviders.add(candidate.provider);
      createdJobs += 1;
      continue;
    }
    const jobId = await ctx.db.insert('providerRevocationJobs', {
      provider: candidate.provider,
      providerAccountId: candidate.providerAccountId,
      providerAccountFingerprint,
      encryptedAccessToken: credential.encryptedAccessToken,
      encryptedRefreshToken: credential.encryptedRefreshToken,
      accessTokenExpiresAt: credential.accessTokenExpiresAt,
      credentialVersion: credential.credentialVersion,
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internalProviderCredentialsApi.runProviderRevocationInternal,
      { jobId }
    );
    queuedProviders.add(candidate.provider);
    createdJobs += 1;
  }

  for (const credential of credentials) {
    await ctx.db.delete(credential._id);
  }

  return {
    queuedProviders: Array.from(queuedProviders).sort(),
    manualFallbackProviders: Array.from(manualFallbackProviders).sort(),
    createdJobs,
    deletedCredentials: credentials.length,
  };
}

export async function claimProviderRevocationJobImpl(
  ctx: any,
  jobId: Id<'providerRevocationJobs'>,
  now = Date.now()
): Promise<ProviderRevocationJob | null> {
  const job = await ctx.db.get(jobId);
  if (
    !job ||
    job.status !== 'queued' ||
    (job.nextAttemptAt && job.nextAttemptAt > now) ||
    job.attemptCount >= MAX_REVOCATION_ATTEMPTS
  ) {
    return null;
  }
  await ctx.db.patch(job._id, {
    status: 'running',
    attemptCount: job.attemptCount + 1,
    nextAttemptAt: undefined,
    updatedAt: now,
  });
  return {
    ...job,
    status: 'running',
    attemptCount: job.attemptCount + 1,
    nextAttemptAt: undefined,
    updatedAt: now,
  } as ProviderRevocationJob;
}

export const claimProviderRevocationJobInternal = internalMutation({
  args: { jobId: v.id('providerRevocationJobs') },
  handler: async (ctx, { jobId }) =>
    await claimProviderRevocationJobImpl(ctx, jobId),
});

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_HTTP_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readGoogleRevocationError(response: Response) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const error = (body as Record<string, unknown>).error;
  return typeof error === 'string' ? error : undefined;
}

export async function attemptProviderRevocation(
  job: ProviderRevocationJob,
  options: {
    env?: Partial<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    now?: number;
  } = {}
): Promise<
  | { kind: 'completed'; code: string }
  | { kind: 'manual_required'; code: string }
  | { kind: 'transient'; code: string }
> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  let token: string;
  let tokenKind: 'access' | 'refresh';
  if (!job.providerAccountId) {
    return { kind: 'manual_required', code: 'PROVIDER_ACCOUNT_ID_MISSING' };
  }
  try {
    if (job.encryptedRefreshToken) {
      tokenKind = 'refresh';
      token = await decryptProviderToken(
        job.provider,
        job.providerAccountId,
        tokenKind,
        job.encryptedRefreshToken,
        env
      );
    } else if (
      job.encryptedAccessToken &&
      (!job.accessTokenExpiresAt || job.accessTokenExpiresAt > now)
    ) {
      tokenKind = 'access';
      token = await decryptProviderToken(
        job.provider,
        job.providerAccountId,
        tokenKind,
        job.encryptedAccessToken,
        env
      );
    } else {
      return { kind: 'manual_required', code: 'NO_USABLE_TOKEN' };
    }
  } catch {
    return { kind: 'manual_required', code: 'TOKEN_DECRYPTION_FAILED' };
  }

  let url: string;
  let body: URLSearchParams;
  if (job.provider === 'apple') {
    const clientId = env.AUTH_APPLE_ID?.trim();
    const clientSecret = env.AUTH_APPLE_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return { kind: 'manual_required', code: 'APPLE_CONFIG_MISSING' };
    }
    url = 'https://appleid.apple.com/auth/revoke';
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint:
        tokenKind === 'refresh' ? 'refresh_token' : 'access_token',
    });
  } else {
    url = 'https://oauth2.googleapis.com/revoke';
    body = new URLSearchParams({ token });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      options.fetchImpl ?? fetch
    );
  } catch {
    return { kind: 'transient', code: 'NETWORK_OR_TIMEOUT' };
  }
  if (response.ok) {
    return { kind: 'completed', code: 'REVOKED' };
  }
  if (response.status === 429 || response.status >= 500) {
    return { kind: 'transient', code: `HTTP_${response.status}` };
  }
  if (job.provider === 'google' && response.status === 400) {
    const googleError = await readGoogleRevocationError(response);
    if (googleError === 'invalid_token') {
      return { kind: 'completed', code: 'ALREADY_INVALID' };
    }
    return {
      kind: 'manual_required',
      code:
        googleError === 'invalid_request'
          ? 'GOOGLE_INVALID_REQUEST'
          : 'GOOGLE_HTTP_400',
    };
  }
  return {
    kind: 'manual_required',
    code: `HTTP_${response.status}`,
  };
}

export async function completeProviderRevocationJobImpl(
  ctx: any,
  args: {
    jobId: Id<'providerRevocationJobs'>;
    status: 'completed' | 'manual_required';
    terminalCode: string;
    now?: number;
    env?: Partial<Record<string, string | undefined>>;
  }
) {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status === 'completed' || job.status === 'manual_required') {
    return { status: 'stale' as const };
  }
  const now = args.now ?? Date.now();
  const providerAccountFingerprint =
    job.providerAccountFingerprint ??
    (job.providerAccountId
      ? await tryCreateProviderAccountFingerprint(
          job.provider,
          job.providerAccountId,
          args.env
        )
      : undefined);
  await ctx.db.patch(job._id, {
    status: args.status,
    providerAccountId: undefined,
    providerAccountFingerprint,
    encryptedAccessToken: undefined,
    encryptedRefreshToken: undefined,
    accessTokenExpiresAt: undefined,
    nextAttemptAt: undefined,
    terminalCode: args.terminalCode,
    completedAt: now,
    purgeAfter: now + RECEIPT_RETENTION_MS,
    updatedAt: now,
  });
  return { status: args.status };
}

export const completeProviderRevocationJobInternal = internalMutation({
  args: {
    jobId: v.id('providerRevocationJobs'),
    status: v.union(v.literal('completed'), v.literal('manual_required')),
    terminalCode: v.string(),
  },
  handler: async (ctx, args) =>
    await completeProviderRevocationJobImpl(ctx, args),
});

export async function retryProviderRevocationJobImpl(
  ctx: any,
  args: {
    jobId: Id<'providerRevocationJobs'>;
    terminalCode: string;
    now?: number;
  }
) {
  const job = await ctx.db.get(args.jobId);
  if (!job || job.status !== 'running') {
    return { status: 'stale' as const };
  }
  const now = args.now ?? Date.now();
  if (job.attemptCount >= MAX_REVOCATION_ATTEMPTS) {
    return await completeProviderRevocationJobImpl(ctx, {
      jobId: job._id,
      status: 'manual_required',
      terminalCode: args.terminalCode,
      now,
    });
  }
  const delay = RETRY_DELAYS_MS[job.attemptCount - 1] ?? RETRY_DELAYS_MS.at(-1)!;
  const nextAttemptAt = now + delay;
  await ctx.db.patch(job._id, {
    status: 'queued',
    nextAttemptAt,
    terminalCode: args.terminalCode,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(
    delay,
    internalProviderCredentialsApi.runProviderRevocationInternal,
    { jobId: job._id }
  );
  return { status: 'queued' as const, nextAttemptAt };
}

export const retryProviderRevocationJobInternal = internalMutation({
  args: {
    jobId: v.id('providerRevocationJobs'),
    terminalCode: v.string(),
  },
  handler: async (ctx, args) =>
    await retryProviderRevocationJobImpl(ctx, args),
});

export const runProviderRevocationInternal = internalAction({
  args: { jobId: v.id('providerRevocationJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runMutation(
      internalProviderCredentialsApi.claimProviderRevocationJobInternal,
      { jobId }
    );
    if (!job) {
      return { status: 'stale' as const };
    }
    const result = await attemptProviderRevocation(job);
    if (result.kind === 'transient') {
      return await ctx.runMutation(
        internalProviderCredentialsApi.retryProviderRevocationJobInternal,
        { jobId, terminalCode: result.code }
      );
    }
    return await ctx.runMutation(
      internalProviderCredentialsApi.completeProviderRevocationJobInternal,
      {
        jobId,
        status: result.kind,
        terminalCode: result.code,
      }
    );
  },
});

export async function sweepProviderRevocationJobsImpl(
  ctx: any,
  now = Date.now()
) {
  const dueQueued = await ctx.db
    .query('providerRevocationJobs')
    .withIndex('by_status_nextAttemptAt', (q: any) =>
      q.eq('status', 'queued').lte('nextAttemptAt', now)
    )
    .take(SWEEP_BATCH_SIZE);
  for (const job of dueQueued) {
    await ctx.scheduler.runAfter(
      0,
      internalProviderCredentialsApi.runProviderRevocationInternal,
      { jobId: job._id }
    );
  }

  const staleRunning = await ctx.db
    .query('providerRevocationJobs')
    .withIndex('by_status_updatedAt', (q: any) =>
      q.eq('status', 'running').lte('updatedAt', now - STALE_RUNNING_MS)
    )
    .take(SWEEP_BATCH_SIZE);
  for (const job of staleRunning) {
    if (job.attemptCount >= MAX_REVOCATION_ATTEMPTS) {
      await completeProviderRevocationJobImpl(ctx, {
        jobId: job._id,
        status: 'manual_required',
        terminalCode: 'STALE_MAX_ATTEMPTS',
        now,
      });
      continue;
    }
    await ctx.db.patch(job._id, {
      status: 'queued',
      nextAttemptAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internalProviderCredentialsApi.runProviderRevocationInternal,
      { jobId: job._id }
    );
  }

  const purgeable = await ctx.db
    .query('providerRevocationJobs')
    .withIndex('by_purgeAfter', (q: any) => q.lte('purgeAfter', now))
    .take(SWEEP_BATCH_SIZE);
  let purged = 0;
  for (const job of purgeable) {
    if (job.status === 'completed' || job.status === 'manual_required') {
      await ctx.db.delete(job._id);
      purged += 1;
    }
  }
  return {
    queuedScheduled: dueQueued.length,
    staleRecovered: staleRunning.length,
    purged,
  };
}

export const sweepProviderRevocationJobsInternal = internalMutation({
  args: {},
  handler: async (ctx) => await sweepProviderRevocationJobsImpl(ctx),
});

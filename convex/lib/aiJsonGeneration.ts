export const OPENROUTER_JSON_MODEL = 'google/gemini-2.5-flash-lite';
export const OPENROUTER_JSON_TIMEOUT_MS = 8_000;

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_REFERER = 'https://stampaix.com';
const DEFAULT_OPENROUTER_TITLE = 'StampAix AI Recommendations';

export type AiJsonFailureCode =
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_NETWORK_ERROR'
  | 'AI_PROVIDER_HTTP_ERROR'
  | 'AI_PROVIDER_EMPTY_RESPONSE'
  | 'AI_PROVIDER_INVALID_JSON'
  | 'AI_PROVIDER_SCHEMA_INVALID'
  | 'AI_PROVIDER_LANGUAGE_INVALID'
  | 'AI_PROVIDER_CONTENT_INVALID';

export type AiJsonValidationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | 'AI_PROVIDER_SCHEMA_INVALID'
        | 'AI_PROVIDER_LANGUAGE_INVALID'
        | 'AI_PROVIDER_CONTENT_INVALID';
    };

export type AiJsonUsageMetadata = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AiJsonGenerationResult<T> = AiJsonUsageMetadata &
  (
    | { ok: true; output: T }
    | { ok: false; code: AiJsonFailureCode }
  );

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function optionalUsageCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function withOptionalUsage<T extends object>(
  result: T,
  inputTokens?: number,
  outputTokens?: number
) {
  return {
    ...result,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function extractMessageContent(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (!Array.isArray(raw)) {
    return '';
  }
  return raw
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        if (typeof text === 'string') {
          return text;
        }
        return '';
      }
      return '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOpenRouterJsonText(raw: string): Record<string, unknown> {
  const withoutFence = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? withoutFence.slice(firstBrace, lastBrace + 1)
      : withoutFence;
  const parsed: unknown = JSON.parse(candidate);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_JSON_OBJECT');
  }
  return parsed as Record<string, unknown>;
}

export async function generateOpenRouterJson<T>(args: {
  prompt: string;
  validate: (parsed: Record<string, unknown>) => AiJsonValidationResult<T>;
  model?: string;
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs?: number;
  apiKey?: string | null;
  referer?: string;
  title?: string;
  fetchImpl?: FetchLike;
}): Promise<AiJsonGenerationResult<T>> {
  const apiKey =
    args.apiKey === undefined ? process.env.OPENROUTER_API_KEY : args.apiKey;
  if (!apiKey) {
    return {
      ok: false as const,
      code: 'AI_PROVIDER_NOT_CONFIGURED' as const,
    };
  }

  const controller = new AbortController();
  const timeoutMs = args.timeoutMs ?? OPENROUTER_JSON_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (args.fetchImpl ?? fetch)(OPENROUTER_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          args.referer ??
          process.env.OPENROUTER_SITE_URL ??
          DEFAULT_OPENROUTER_REFERER,
        'X-Title': args.title ?? DEFAULT_OPENROUTER_TITLE,
      },
      body: JSON.stringify({
        model: args.model ?? OPENROUTER_JSON_MODEL,
        temperature: args.temperature ?? 0.2,
        max_tokens: args.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: args.prompt }],
      }),
    });

    if (!response.ok) {
      return {
        ok: false as const,
        code: 'AI_PROVIDER_HTTP_ERROR' as const,
      };
    }

    const payload = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!payload) {
      return {
        ok: false as const,
        code: 'AI_PROVIDER_EMPTY_RESPONSE' as const,
      };
    }

    const usage =
      payload.usage && typeof payload.usage === 'object'
        ? (payload.usage as Record<string, unknown>)
        : null;
    const inputTokens = optionalUsageCount(usage?.prompt_tokens);
    const outputTokens = optionalUsageCount(usage?.completion_tokens);
    const choices = Array.isArray(payload.choices)
      ? (payload.choices as Array<Record<string, unknown>>)
      : [];
    const message =
      choices[0]?.message && typeof choices[0].message === 'object'
        ? (choices[0].message as Record<string, unknown>)
        : null;
    const rawContent = extractMessageContent(message?.content);
    if (!rawContent) {
      return withOptionalUsage(
        {
          ok: false as const,
          code: 'AI_PROVIDER_EMPTY_RESPONSE' as const,
        },
        inputTokens,
        outputTokens
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseOpenRouterJsonText(rawContent);
    } catch {
      return withOptionalUsage(
        {
          ok: false as const,
          code: 'AI_PROVIDER_INVALID_JSON' as const,
        },
        inputTokens,
        outputTokens
      );
    }
    const validated = args.validate(parsed);
    if (!validated.ok) {
      return withOptionalUsage(
        {
          ok: false as const,
          code: validated.code,
        },
        inputTokens,
        outputTokens
      );
    }
    return withOptionalUsage(
      {
        ok: true as const,
        output: validated.value,
      },
      inputTokens,
      outputTokens
    );
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError');
    return {
      ok: false as const,
      code: timedOut
        ? ('AI_PROVIDER_TIMEOUT' as const)
        : ('AI_PROVIDER_NETWORK_ERROR' as const),
    };
  } finally {
    clearTimeout(timeout);
  }
}

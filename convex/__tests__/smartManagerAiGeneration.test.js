import { describe, expect, test } from 'bun:test';

import {
  generateOpenRouterJson,
  OPENROUTER_JSON_MODEL,
  OPENROUTER_JSON_TIMEOUT_MS,
} from '../lib/aiJsonGeneration';
import {
  bucketSmartManagerAudience,
  buildSmartManagerAiCacheKey,
  buildSmartManagerStructuredInputHash,
  buildSmartManagerWinbackPrompt,
  buildSmartManagerWinbackStructuredInput,
  isBelowSmartManagerFreshAiMinimum,
  SMART_MANAGER_AI_CACHE_NAMESPACE,
  SMART_MANAGER_AI_GENERATION_VERSION,
  SMART_MANAGER_AI_PROMPT_VERSION,
  validateSmartManagerWinbackOutput,
} from '../lib/smartManagerPreparedActions';
import { SMART_MANAGER_POLICY_V1 } from '../lib/smartManagerPolicy';
import {
  buildGenerationReservation,
  generationRequestMatches,
  generationSelectionMatches,
  hashSmartManagerWinbackPrompt,
  loadBoundedSmartManagerFreshUsage,
  loadSmartManagerCacheCandidate,
} from '../smartManagerActions';
import {
  consumeSmartManagerGenerationRateLimits,
  SMART_MANAGER_RATE_LIMIT_DEFINITIONS,
} from '../smartManagerRateLimits';

const VALID_OUTPUT = {
  type: 'winback_copy',
  title: 'שמחים לראות אתכם',
  body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
};

class FakeQuery {
  constructor(rows, reads) {
    this.sourceRows = rows;
    this.predicates = [];
    this.reads = reads;
  }

  withIndex(name, builder) {
    const predicates = [];
    const q = {
      eq(field, value) {
        predicates.push((row) => row[field] === value);
        return q;
      },
    };
    builder(q);
    this.reads.push({ kind: 'index', name });
    this.predicates.push((row) =>
      predicates.every((predicate) => predicate(row))
    );
    return this;
  }

  async take(limit) {
    this.reads.push({ kind: 'take', limit });
    return this.sourceRows
      .filter((row) =>
        this.predicates.every((predicate) => predicate(row))
      )
      .slice(0, limit);
  }

  async collect() {
    throw new Error('UNBOUNDED_COLLECT_FORBIDDEN');
  }
}

function queryCtx(tables) {
  const reads = [];
  return {
    reads,
    ctx: {
      db: {
        query(tableName) {
          return new FakeQuery(tables[tableName] ?? [], reads);
        },
      },
    },
  };
}

function providerResponse(content) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('Smart Manager closed AI copy contract', () => {
  test('structured input is finite, bucketed, and PII/business-name free', () => {
    const input = buildSmartManagerWinbackStructuredInput({
      audienceCount: 37,
      recipientCeiling: 100,
    });
    expect(input).toEqual({
      actionType: 'winback_copy',
      locale: 'he-IL',
      language: 'he',
      channelStrategyVersion: 'push-with-in-app-fallback-v1',
      segment: 'at_risk',
      audienceSizeBucket: '25_49',
      tone: 'warm',
      outputConstraints: {
        titleMaxCharacters: 60,
        bodyMaxCharacters: 240,
        offersAllowed: false,
        personalizationAllowed: false,
      },
      promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
    });
    const serialized = JSON.stringify(input);
    for (const forbidden of [
      'businessName',
      'customerId',
      'email',
      'phone',
      'pushToken',
      'recipientList',
      'freeForm',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(buildSmartManagerWinbackPrompt(input)).not.toContain(
      'Sample Business'
    );
  });

  test('audience buckets respect the recipient ceiling and 1-4 remains fallback-safe', () => {
    expect(bucketSmartManagerAudience(1, 500)).toBe('1_4');
    expect(bucketSmartManagerAudience(4, 500)).toBe('1_4');
    expect(bucketSmartManagerAudience(5, 500)).toBe('5_9');
    expect(bucketSmartManagerAudience(24, 500)).toBe('10_24');
    expect(bucketSmartManagerAudience(80, 49)).toBe('25_49');
    expect(bucketSmartManagerAudience(10_000, 10_000)).toBe('1000_plus');
    expect(
      SMART_MANAGER_POLICY_V1.aiGeneration.minimumAudienceForFreshGeneration
    ).toBe(5);
    expect(
      isBelowSmartManagerFreshAiMinimum(4, { config: SMART_MANAGER_POLICY_V1 })
    ).toBe(true);
    expect(
      isBelowSmartManagerFreshAiMinimum(5, { config: SMART_MANAGER_POLICY_V1 })
    ).toBe(false);
    expect(
      isBelowSmartManagerFreshAiMinimum(6, {
        config: {
          ...SMART_MANAGER_POLICY_V1,
          aiGeneration: { minimumAudienceForFreshGeneration: 10 },
        },
      })
    ).toBe(true);
    expect(isBelowSmartManagerFreshAiMinimum(6, null)).toBe(true);
  });

  test('cache key includes namespace, complete input hash, versions, and model', () => {
    const input = buildSmartManagerWinbackStructuredInput({
      audienceCount: 12,
      recipientCeiling: 100,
    });
    const inputHash = buildSmartManagerStructuredInputHash(input);
    const key = buildSmartManagerAiCacheKey({
      structuredInputHash: inputHash,
    });
    expect(key).toContain(SMART_MANAGER_AI_CACHE_NAMESPACE);
    expect(key).toContain(inputHash);
    expect(key).toContain(SMART_MANAGER_AI_PROMPT_VERSION);
    expect(key).toContain(SMART_MANAGER_AI_GENERATION_VERSION);
    expect(key).toContain(OPENROUTER_JSON_MODEL);
  });

  test('strict output accepts neutral Hebrew and rejects schema/language violations', () => {
    expect(validateSmartManagerWinbackOutput(VALID_OUTPUT)).toEqual({
      ok: true,
      value: VALID_OUTPUT,
    });
    expect(
      validateSmartManagerWinbackOutput({
        ...VALID_OUTPUT,
        extra: 'not allowed',
      }).code
    ).toBe('AI_PROVIDER_SCHEMA_INVALID');
    expect(
      validateSmartManagerWinbackOutput({
        type: 'winback_copy',
        title: 'Come back',
        body: 'We would love to see you again',
      }).code
    ).toBe('AI_PROVIDER_LANGUAGE_INVALID');
  });

  test('strict output rejects offers, discounts, URLs, contact claims, money, percentages, and placeholders', () => {
    const prohibited = [
      'בקרו באתר https://example.com ונשמח לראותכם',
      'התקשרו לטלפון 050-1234567 ונשמח לעזור',
      'כתבו אלינו test@example.com ונשמח לעזור',
      'מחכה לכם הנחה מיוחדת בביקור הבא',
      'קבלו קופון מיוחד בביקור הבא',
      'מחכה לכם מתנה מיוחדת בביקור הבא',
      'ההצעה חינם וללא עלות בביקור הבא',
      'חסכו עשרים אחוז בביקור הבא',
      'הטבה בשווי ₪ מיוחד מחכה לכם',
      'שלום {customer_name} נשמח לראותך',
      'כי קנית אצלנו נשמח לראותך שוב',
      'הקפה הבא עלינו נשמח לראות אתכם',
      'המשקה הבא עלינו נשמח לראות אתכם',
      'מגיע לכם פינוק בביקור הבא אצלנו',
      'מחכה לכם הפתעה בביקור הבא אצלנו',
      'יש לנו משהו מיוחד בשבילכם בביקור',
    ];
    for (const body of prohibited) {
      expect(
        validateSmartManagerWinbackOutput({
          type: 'winback_copy',
          title: VALID_OUTPUT.title,
          body,
        }).code
      ).toBe('AI_PROVIDER_CONTENT_INVALID');
    }
  });

  test('strict output rejects invented rewards and worded time specificity', () => {
    const prohibited = [
      'הקפה הבא עלינו',
      'המשקה הבא עלינו',
      'מגיע לכם פינוק',
      'מחכה לכם הפתעה',
      'יש לנו משהו מיוחד בשבילכם',
      'נשמח לראות אתכם שוב gift בקרוב מאוד',
      'נשמח לראות אתכם treat בביקור הבא אצלנו',
      'נשמח לראות אתכם special offer בביקור הבא אצלנו בקרוב',
      'נשמח לראות אתכם surprise waiting בביקור הבא אצלנו',
      'נשמח לראות אתכם שוב on us בקרוב מאוד',
      'עברו שלושה חודשים ונשמח לראות אתכם',
      'לא ביקרתם כבר חודשיים ונשמח לראותכם',
      'זו הפעם השלישית שנשמח לראות אתכם',
      'כבר שלושה חודשים שלא ביקרתם',
      'בפעם השלישית נשמח לראות אתכם',
      'הביקור הבא על הבית',
      'נשמח לראות אתכם שוב on the house בקרוב מאוד',
      'נשמח לראות אתכם next visit on us בביקור הבא',
      'נשמח מאוד לראות אתכם שוב three months אחרי הביקור האחרון',
      'נשמח מאוד לראות אתכם שוב two weeks אחרי הביקור האחרון',
    ];
    for (const body of prohibited) {
      expect(
        validateSmartManagerWinbackOutput({
          type: 'winback_copy',
          title: VALID_OUTPUT.title,
          body,
        }).code
      ).toBe('AI_PROVIDER_CONTENT_INVALID');
    }
    expect(
      validateSmartManagerWinbackOutput({
        type: 'winback_copy',
        title: 'נשמח לראות אתכם שוב',
        body: 'עבר זמן מאז הביקור האחרון שלכם. נשמח לראות אתכם שוב בקרוב.',
      }).ok
    ).toBe(true);
  });
});

describe('shared OpenRouter JSON provider', () => {
  test('uses the fixed eight-second timeout and normalizes missing secret', async () => {
    expect(OPENROUTER_JSON_TIMEOUT_MS).toBe(8_000);
    const result = await generateOpenRouterJson({
      prompt: 'closed input',
      apiKey: null,
      maxOutputTokens: 120,
      validate: validateSmartManagerWinbackOutput,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'AI_PROVIDER_NOT_CONFIGURED',
    });
    expect(result).not.toHaveProperty('inputTokens');
    expect(result).not.toHaveProperty('outputTokens');
  });

  test('normalizes AbortController timeout without exposing an exception', async () => {
    const fetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('secret transport detail', 'AbortError'))
        );
      });
    const result = await generateOpenRouterJson({
      prompt: 'closed input',
      apiKey: 'server-only-test-key',
      timeoutMs: 1,
      maxOutputTokens: 120,
      fetchImpl,
      validate: validateSmartManagerWinbackOutput,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'AI_PROVIDER_TIMEOUT',
    });
    expect(JSON.stringify(result)).not.toContain('secret transport detail');
  });

  test('normalizes invalid JSON and non-Hebrew provider results', async () => {
    const invalidJson = await generateOpenRouterJson({
      prompt: 'closed input',
      apiKey: 'server-only-test-key',
      maxOutputTokens: 120,
      fetchImpl: async () => providerResponse('not-json'),
      validate: validateSmartManagerWinbackOutput,
    });
    expect(invalidJson.code).toBe('AI_PROVIDER_INVALID_JSON');

    const wrongLanguage = await generateOpenRouterJson({
      prompt: 'closed input',
      apiKey: 'server-only-test-key',
      maxOutputTokens: 120,
      fetchImpl: async () =>
        providerResponse(
          JSON.stringify({
            type: 'winback_copy',
            title: 'Come back',
            body: 'We would love to see you again',
          })
        ),
      validate: validateSmartManagerWinbackOutput,
    });
    expect(wrongLanguage.code).toBe('AI_PROVIDER_LANGUAGE_INVALID');
  });

  test('omits token metadata when the provider does not return usage', async () => {
    const result = await generateOpenRouterJson({
      prompt: 'closed input',
      apiKey: 'server-only-test-key',
      maxOutputTokens: 120,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
      validate: validateSmartManagerWinbackOutput,
    });
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('inputTokens');
    expect(result).not.toHaveProperty('outputTokens');
  });
});

describe('bounded Smart Manager cache, quota, and rate evidence', () => {
  test('request binding and selected-copy CAS reject authority or selection drift', () => {
    const action = {
      _id: 'action_1',
      businessId: 'business_1',
      audienceCount: 12,
      recipientCeiling: 100,
      authorityMode: 'shadow_parity_v1',
      authorityBindingHash: 'authority_hash_1',
      decisionHash: 'decision_hash_1',
      evidenceFingerprint: 'evidence_1',
      factHash: 'fact_hash_1',
      policyVersion: 'policy_v1',
      policyHash: 'policy_hash_1',
      sourceGeneration: 7,
      expiresAt: Date.now() + 60_000,
      state: 'reviewable',
    };
    const requestedAt = Date.now();
    const reservation = buildGenerationReservation({
      action,
      actorUserId: 'user_1',
      requestKind: 'initial_prepare',
      expectedSelectedCopyId: 'copy_1',
      expectedSelectedCopyRevision: 1,
      reservedResultRevision: 2,
      requestedAt,
    });
    const coordinated = {
      ...action,
      selectedCopyId: 'copy_1',
      selectedCopyRevision: 1,
      generationState: 'queued',
      generationActorUserId: 'user_1',
      generationRequestKind: 'initial_prepare',
      generationRequestToken: reservation.requestToken,
      generationRequestBindingHash: reservation.requestBindingHash,
      generationExpectedCopyId: 'copy_1',
      generationExpectedCopyRevision: 1,
      generationReservedCopyRevision: 2,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      generationPromptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      generationInputHash: reservation.structuredInputHash,
      generationRequestedAt: requestedAt,
    };

    expect(
      generationRequestMatches(coordinated, {
        requestToken: reservation.requestToken,
        requestBindingHash: reservation.requestBindingHash,
      })
    ).toBe(true);
    expect(generationSelectionMatches(coordinated)).toBe(true);
    expect(
      generationRequestMatches(
        { ...coordinated, authorityBindingHash: 'changed' },
        {
          requestToken: reservation.requestToken,
          requestBindingHash: reservation.requestBindingHash,
        }
      )
    ).toBe(false);
    expect(
      generationRequestMatches(
        { ...coordinated, state: 'superseded' },
        {
          requestToken: reservation.requestToken,
          requestBindingHash: reservation.requestBindingHash,
        }
      )
    ).toBe(false);
    expect(
      generationSelectionMatches({
        ...coordinated,
        selectedCopyRevision: 2,
      })
    ).toBe(false);
  });

  test('valid cache hit is bounded and duplicate cache rows fail closed', async () => {
    const structuredInput = buildSmartManagerWinbackStructuredInput({
      audienceCount: 12,
      recipientCeiling: 100,
    });
    const structuredInputHash =
      buildSmartManagerStructuredInputHash(structuredInput);
    const prompt = buildSmartManagerWinbackPrompt(structuredInput);
    const promptHash = hashSmartManagerWinbackPrompt(prompt);
    const cacheKey = buildSmartManagerAiCacheKey({ structuredInputHash });
    const row = {
      _id: 'cache_1',
      cacheKey,
      promptHash,
      inputSignature: structuredInputHash,
      goal: 'winback_copy',
      model: OPENROUTER_JSON_MODEL,
      responseJson: {
        type: VALID_OUTPUT.type,
        title: VALID_OUTPUT.title,
        message: VALID_OUTPUT.body,
      },
      createdAt: Date.now() - 1,
      expiresAt: Date.now() + 60_000,
    };
    const single = queryCtx({ aiGenerationCache: [row] });
    const hit = await loadSmartManagerCacheCandidate({
      ctx: single.ctx,
      cacheKey,
      promptHash,
      structuredInputHash,
      now: Date.now(),
    });
    expect(hit.state).toBe('hit');
    expect(single.reads).toContainEqual({ kind: 'take', limit: 2 });

    const duplicate = queryCtx({
      aiGenerationCache: [row, { ...row, _id: 'cache_2' }],
    });
    expect(
      (
        await loadSmartManagerCacheCandidate({
          ctx: duplicate.ctx,
          cacheKey,
          promptHash,
          structuredInputHash,
          now: Date.now(),
        })
      ).state
    ).toBe('unavailable');
  });

  test('expired cache rows are a miss and do not fail closed', async () => {
    const structuredInput = buildSmartManagerWinbackStructuredInput({
      audienceCount: 12,
      recipientCeiling: 100,
    });
    const structuredInputHash =
      buildSmartManagerStructuredInputHash(structuredInput);
    const promptHash = hashSmartManagerWinbackPrompt(
      buildSmartManagerWinbackPrompt(structuredInput)
    );
    const cacheKey = buildSmartManagerAiCacheKey({ structuredInputHash });
    const now = Date.now();
    const expired = queryCtx({
      aiGenerationCache: [
        {
          _id: 'cache_expired',
          cacheKey,
          promptHash,
          inputSignature: structuredInputHash,
          goal: 'winback_copy',
          model: OPENROUTER_JSON_MODEL,
          responseJson: {
            type: VALID_OUTPUT.type,
            title: VALID_OUTPUT.title,
            message: VALID_OUTPUT.body,
          },
          createdAt: now - 2,
          expiresAt: now - 1,
        },
      ],
    });
    const result = await loadSmartManagerCacheCandidate({
      ctx: expired.ctx,
      cacheKey,
      promptHash,
      structuredInputHash,
      now,
    });
    expect(result.state).toBe('miss');
    expect(expired.reads).toContainEqual({ kind: 'take', limit: 2 });
  });

  test('monthly successful fresh usage uses only the composite index and bounded sentinel', async () => {
    const now = Date.now();
    const successfulFreshRows = Array.from({ length: 7 }, (_, index) => ({
      _id: `usage_${index}`,
      businessId: 'business_1',
      monthKey: new Date(now).toISOString().slice(0, 7),
      status: 'success',
      cacheHit: false,
    }));
    const bounded = queryCtx({ aiUsageLedger: successfulFreshRows });
    const evidence = await loadBoundedSmartManagerFreshUsage({
      ctx: bounded.ctx,
      businessId: 'business_1',
      now,
    });
    expect(evidence).toEqual({ available: true, used: 7 });
    expect(bounded.reads).toContainEqual({
      kind: 'index',
      name: 'by_businessId_monthKey_status_cacheHit',
    });
    expect(bounded.reads).toContainEqual({ kind: 'take', limit: 301 });

    const overflow = queryCtx({
      aiUsageLedger: Array.from({ length: 301 }, (_, index) => ({
        ...successfulFreshRows[0],
        _id: `overflow_${index}`,
      })),
    });
    expect(
      await loadBoundedSmartManagerFreshUsage({
        ctx: overflow.ctx,
        businessId: 'business_1',
        now,
      })
    ).toEqual({ available: false, used: null });
  });

  test('rate limits distinguish explicit actor/business and all-business generation', async () => {
    expect(
      SMART_MANAGER_RATE_LIMIT_DEFINITIONS
        .smartManagerExplicitRegenerationActorBusinessV1.rate
    ).toBe(3);
    expect(
      SMART_MANAGER_RATE_LIMIT_DEFINITIONS.smartManagerGenerationBusinessV1
        .rate
    ).toBe(10);
    const calls = [];
    const limiter = {
      async limit(_ctx, name, options) {
        calls.push({ name, key: options.key });
        return { ok: true };
      },
    };
    await consumeSmartManagerGenerationRateLimits(
      {},
      {
        businessId: 'business_1',
        actorUserId: 'user_1',
        explicitRegeneration: true,
      },
      limiter
    );
    expect(calls).toEqual([
      {
        name: 'smartManagerExplicitRegenerationActorBusinessV1',
        key: 'user_1:business_1',
      },
      {
        name: 'smartManagerGenerationBusinessV1',
        key: 'business_1',
      },
    ]);

    calls.length = 0;
    await consumeSmartManagerGenerationRateLimits(
      {},
      {
        businessId: 'business_1',
        actorUserId: 'user_1',
        explicitRegeneration: false,
      },
      limiter
    );
    expect(calls).toEqual([
      {
        name: 'smartManagerGenerationBusinessV1',
        key: 'business_1',
      },
    ]);

    let failure = null;
    try {
      await consumeSmartManagerGenerationRateLimits(
        {},
        {
          businessId: 'business_1',
          actorUserId: 'user_1',
          explicitRegeneration: false,
        },
        { async limit() { return { ok: false, retryAfter: 10_000 }; } }
      );
    } catch (error) {
      failure = error;
    }
    expect(failure?.data).toEqual({ code: 'AI_RATE_LIMITED' });
  });
});

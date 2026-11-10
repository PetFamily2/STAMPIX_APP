import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('SUMIT reconciliation automation', () => {
  test('is bounded, rate-limited per account and scheduled hourly', () => {
    const source = readFileSync('convex/sumitBilling.ts', 'utf8');
    const schema = readFileSync('convex/schema.ts', 'utf8');
    const crons = readFileSync('convex/crons.ts', 'utf8');

    expect(source).toContain('SUMIT_RECONCILIATION_MIN_INTERVAL_MS');
    expect(source).toContain('SUMIT_RECONCILIATION_DEFAULT_LIMIT = 25');
    expect(source).toContain('SUMIT_RECONCILIATION_MAX_LIMIT = 50');
    expect(source).toContain('listSUMITReconciliationCandidates');
    expect(source).toContain('reconcileSUMITBillingSweepInternal');
    expect(source).toContain('recordSUMITReconciliationResult');

    expect(schema).toContain('lastReconciledAt: v.optional(v.number())');
    expect(schema).toContain('lastReconciliationOk: v.optional(v.boolean())');
    expect(schema).toContain("by_provider_lastReconciledAt");

    expect(crons).toContain('sumit billing reconciliation sweep hourly');
    expect(crons).toContain('internal.sumitBilling.reconcileSUMITBillingSweepInternal');
    expect(crons).toContain('{ limit: 25 }');
  });

  test('keeps production provider access fail-closed', () => {
    const source = readFileSync('convex/lib/billing/sumit/config.ts', 'utf8');
    expect(source).toContain('SUMIT_PRODUCTION_NOT_ENABLED');
  });
});

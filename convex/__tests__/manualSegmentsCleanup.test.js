import { describe, expect, test } from 'bun:test';
import {
  buildManualSegmentRemovalPatch,
  preparedAudienceHasManualSegmentReference,
} from '../migrations/removeManualSegments';

describe('manual segment cleanup helpers', () => {
  test('detects forbidden preparedAudience payload markers', () => {
    expect(
      preparedAudienceHasManualSegmentReference({
        count: 10,
        sourceSnapshotHash: 'advanced_segment:legacy',
      })
    ).toBe(true);
    expect(
      preparedAudienceHasManualSegmentReference({
        count: 10,
        sampleUserIds: ['u1'],
      })
    ).toBe(false);
  });

  test('archives campaigns that depend on saved segments', () => {
    const patch = buildManualSegmentRemovalPatch(
      {
        type: 'retention_action',
        status: 'active',
        activationStatus: 'active',
        automationEnabled: true,
        isActive: true,
        rules: {
          targetType: 'saved_segment',
          segmentId: 'segment_1',
        },
        audienceSource: 'advanced_segment',
        preparedAudience: {
          count: 12,
          sourceSnapshotHash: 'saved_segment:1',
        },
        sourceContext: {},
        schedule: {
          mode: 'recurring',
          nextRunAt: 555,
        },
      },
      12345
    );

    expect(patch).not.toBeNull();
    expect(patch?.isActive).toBe(false);
    expect(patch?.automationEnabled).toBe(false);
    expect(patch?.status).toBe('archived');
    expect(patch?.activationStatus).toBe('archived');
    expect(patch?.audienceSource).toBe('manual_override');
    expect(patch?.preparedAudience).toBeUndefined();
    expect(patch?.sourceContext?.manualSegmentsRemoved).toBe(true);
    expect(patch?.sourceContext?.legacyAutomationDisabled).toBe(true);
  });

  test('ignores deterministic campaigns', () => {
    const patch = buildManualSegmentRemovalPatch(
      {
        type: 'promo',
        status: 'draft',
        isActive: true,
        automationEnabled: false,
        rules: {
          audience: 'all_active_members',
        },
        audienceSource: 'automatic',
        preparedAudience: {
          count: 20,
          sampleUserIds: ['u1', 'u2'],
          sourceSnapshotHash: 'deterministic',
        },
      },
      12345
    );

    expect(patch).toBeNull();
  });
});

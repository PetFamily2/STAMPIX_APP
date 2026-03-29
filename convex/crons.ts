import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.hourly(
  'campaign automation sweep hourly',
  { minuteUTC: 0 },
  internal.campaigns.runAutomationSweepInternal
);

crons.interval(
  'ai recommendation sweep every 12 hours',
  { hours: 12 },
  internal.aiRecommendations.runRecommendationSweepInternal
);

crons.daily(
  'scan session retention cleanup daily',
  { hourUTC: 1, minuteUTC: 0 },
  internal.scanner.cleanupExpiredScanSessionsInternal
);

export default crons;

import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.hourly(
  'campaign automation sweep hourly',
  { minuteUTC: 0 },
  internal.campaigns.runAutomationSweepInternal
);

crons.hourly(
  'retention action sweep hourly',
  { minuteUTC: 0 },
  internal.retention.runRetentionActionSweepInternal
);

export default crons;

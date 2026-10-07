import { v } from 'convex/values';
import { query } from './_generated/server';
import { readWebAuthProviderAvailability } from './lib/webAuthConfiguration';

// Intentionally public: a signed-out screen needs non-sensitive provider readiness.
// This does not authenticate anyone, grant access, or read/write account data.
export const getProviderAvailability = query({
  args: {},
  returns: v.object({
    google: v.boolean(),
    apple: v.boolean(),
    email: v.boolean(),
  }),
  handler: () => readWebAuthProviderAvailability(),
});

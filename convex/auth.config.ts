const resolvedAuthDomain = (
  process.env.CONVEX_SITE_URL ?? process.env.SITE_URL
)?.trim();

if (!resolvedAuthDomain) {
  throw new Error(
    'Missing auth domain. Set CONVEX_SITE_URL (recommended) or SITE_URL.'
  );
}

export default {
  providers: [
    {
      domain: resolvedAuthDomain,
      applicationID: 'convex',
    },
  ],
};

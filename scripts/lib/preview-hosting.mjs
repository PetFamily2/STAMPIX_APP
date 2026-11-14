/** Fixed diagnostic families only: never emit provider text, URLs, tokens or export data. */
export function classifyHostingFailure(text, code) {
  const families = [];
  if (
    /quota|deployment limit|usage limit|upgrade your|maximum number|free plan/i.test(
      text
    )
  )
    families.push('QUOTA');
  if (
    /unauthorized|authentication|invalid.*token|forbidden|\b401\b|\b403\b/i.test(
      text
    )
  )
    families.push('AUTH');
  if (/rate.?limit|too many requests|\b429\b/i.test(text))
    families.push('RATE_LIMIT');
  if (
    /\b(500|502|503|504)\b|internal server error|service unavailable/i.test(
      text
    )
  )
    families.push('PROVIDER_UNAVAILABLE');
  if (
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network error|socket hang up/i.test(
      text
    ) ||
    code === 'ETIMEDOUT'
  )
    families.push('NETWORK');
  if (/certificate|TLS|SSL/i.test(text)) families.push('TLS');
  if (/upload|asset/i.test(text)) families.push('ASSET_UPLOAD');
  if (/invalid.*configuration|project.*not found|bundle.*invalid/i.test(text))
    families.push('CONFIGURATION');
  return {
    families,
    diagnosticBytes: Buffer.byteLength(text),
    transient:
      !families.includes('QUOTA') &&
      !families.includes('AUTH') &&
      families.some((f) =>
        ['NETWORK', 'RATE_LIMIT', 'PROVIDER_UNAVAILABLE'].includes(f)
      ),
  };
}

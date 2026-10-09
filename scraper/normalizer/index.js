import { clean, truncate } from './text.js';
import { parsePay } from './pay.js';
import { parsePostedDate } from './date.js';
import { parseLocation } from './location.js';
import { resolveJobType } from './jobType.js';

export class ValidationError extends Error {}

/**
 * Convert a raw item produced by a parser (strings straight from the HTML) into the common structure
 * every source adapter returns:
 *
 *   { title, employer, location, pay, jobType, postedDate, description, url, source }
 *     location: { raw, city, remote } | null
 *     pay:      { raw, min, max, currency, unit } | null
 *     (plus optional category, externalId)
 *
 * Only title, url and source are required; everything else may be null.
 * `ctx` carries per-target info: { source, baseUrl, defaultType, defaultPayUnit, cityPosition, now }.
 */
export function normalizeListing(raw, ctx) {
  const title = clean(raw.title);
  if (!title || title.length < 2) throw new ValidationError('missing title');

  const rawUrl = clean(raw.url);
  if (!rawUrl) throw new ValidationError('missing url'); // new URL(undefined, base) would silently give ".../undefined"
  let url;
  try {
    url = new URL(rawUrl, ctx.baseUrl);
  } catch {
    throw new ValidationError(`invalid url: ${rawUrl}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new ValidationError(`invalid url: ${rawUrl}`);

  return {
    title,
    employer: clean(raw.employer),
    location: parseLocation(raw.location, { cityPosition: ctx.cityPosition }),
    pay: parsePay(raw.pay, { defaultUnit: ctx.defaultPayUnit, defaultCurrency: ctx.defaultCurrency }),
    jobType: resolveJobType({ hint: raw.jobTypeHint, title, defaultType: ctx.defaultType }),
    postedDate: parsePostedDate(raw.posted, ctx.now),
    description: truncate(clean(raw.description), 800),
    url: url.href,
    source: ctx.source,
    category: clean(raw.category) ?? ctx.category ?? null,
    externalId: clean(raw.externalId),
  };
}

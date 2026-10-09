import * as cheerio from 'cheerio';
import { clean } from '../normalizer/text.js';

// A salary looks like "2500 - 5000 Monthly"; eligibility lists in the same element class never do.
const PAY_RE = /\d.*(monthly|yearly|annum|weekly|daily|hourly|per\s|\/)/i;

/**
 * The site's SEO title is "<Role> Jobs Opening in <Company> at <Place>". Keep only the role.
 */
export function cleanFreshersworldTitle(title) {
  const t = clean(title);
  if (!t) return null;
  return clean(t.split(/\s+Jobs?\s+Opening\s+in\s+/i)[0]);
}

/**
 * Parse a Freshersworld category page into raw items.
 * Selectors were taken from the saved pages in scraper/fixtures:
 *   card      .job-container   (attrs job_id, job_display_url)
 *   title     .wrap-title      (own text only; child spans are "More/Less" toggles)
 *   employer  .company-name
 *   location  .job-location    (a list of city links)
 *   pay       the .qualifications element whose text looks like a salary
 *   posted    .ago-text        ("3 days ago")
 *   summary   .desc
 */
export function parseFreshersworld(html) {
  const $ = cheerio.load(html);
  const items = [];
  const errors = [];

  $('.job-container').each((i, el) => {
    try {
      const card = $(el);
      const titleEl = card.find('.wrap-title').first().clone();
      titleEl.children().remove();

      const locations = card
        .find('.job-location a')
        .map((_, a) => clean($(a).text()))
        .get()
        .filter(Boolean);
      const location = locations.length ? locations.join(', ') : card.find('.job-location').first().text();

      const payText = card
        .find('.qualifications')
        .map((_, q) => clean($(q).text()))
        .get()
        .find((t) => t && PAY_RE.test(t));

      // The .desc text starts with the crawl date ("5 October 2026 Apply for ..."), which is not the posting date.
      const description = clean(card.find('.desc').first().text())?.replace(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+/, '');
      const experience = clean(card.find('.experience').first().text());

      items.push({
        externalId: card.attr('job_id'),
        title: cleanFreshersworldTitle(titleEl.text()),
        url: card.attr('job_display_url'),
        employer: card.find('.company-name').first().text(),
        location,
        pay: payText ?? null,
        posted: card.find('.ago-text').first().text(),
        description: [description, experience ? `Experience: ${experience}` : null].filter(Boolean).join(' | '),
      });
    } catch (e) {
      errors.push(`card #${i}: ${e.message}`);
    }
  });
  return { items, errors };
}

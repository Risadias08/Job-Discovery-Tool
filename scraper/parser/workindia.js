import * as cheerio from 'cheerio';
import { clean } from '../normalizer/text.js';

/**
 * Parse a WorkIndia category/city page into raw items.
 * Selectors were taken from the saved pages in scraper/fixtures:
 *   card      .JobItemV3
 *   title/url h2 a
 *   pay       the div right after the h2 ("Rs. 35000 - Rs. 59000"); absent on some cards
 *   location  .LocationDetail      ("Bellandur, Bengaluru")
 *   category  .JobTypeDetail       ("Delivery", "Retail", ...) - a job category, not full/part time
 *   employer  .CompanyDetail
 *   posted    .JobPostedOnDetail   ("Posted on: 10/5/2026")
 *   other     .ExperienceDetail, .EnglishDetail, .QualificationDetail
 * The page also carries JSON-LD, but it only lists titles and URLs, so the cards are the source of truth.
 */
export function parseWorkindia(html) {
  const $ = cheerio.load(html);
  const items = [];
  const errors = [];

  $('.JobItemV3').each((i, el) => {
    try {
      const card = $(el);
      const link = card.find('h2 a').first();
      const href = link.attr('href');
      const payText = clean(card.find('h2').first().next('div').text());
      const category = clean(card.find('.JobTypeDetail').text());
      const experience = clean(card.find('.ExperienceDetail').text());
      const english = clean(card.find('.EnglishDetail').text());
      const eligibility = clean(card.find('.QualificationDetail').text());

      items.push({
        externalId: href?.match(/-(\d+)\/?$/)?.[1],
        title: link.text(),
        url: href,
        employer: card.find('.CompanyDetail').text(),
        location: card.find('.LocationDetail').text(),
        pay: payText && /\d/.test(payText) ? payText : null,
        posted: card.find('.JobPostedOnDetail').text(),
        category,
        description: [
          category ? `Category: ${category}` : null,
          experience ? `Experience: ${experience}` : null,
          english ? `English: ${english}` : null,
          eligibility ? `Eligibility: ${eligibility}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      });
    } catch (e) {
      errors.push(`card #${i}: ${e.message}`);
    }
  });
  return { items, errors };
}

import * as cheerio from 'cheerio';
import { clean } from '../normalizer/text.js';

/**
 * Parse an Internshala listing page (internships or jobs) into raw items.
 * Selectors were taken from the saved pages in scraper/fixtures:
 *   card      .individual_internship   (attr employment_type = "internship" | "job", attr internshipid)
 *   title/url a.job-title-href
 *   employer  .company-name
 *   location  .locations
 *   pay       .stipend (internships) or .mobile (jobs, includes the "/year" unit) inside the row with .ic-16-money
 *   posted    the span next to .ic-16-reschedule inside .color-labels
 *   tags      .gray-labels .status-li span   (e.g. "Part time")
 * Only the listing card is read; detail pages are disallowed by Internshala's robots.txt.
 * Returns { items, errors } - a card that fails to parse is logged in errors and skipped.
 */
export function parseInternshala(html) {
  const $ = cheerio.load(html);
  const items = [];
  const errors = [];

  $('.individual_internship').each((i, el) => {
    try {
      const card = $(el);
      const link = card.find('a.job-title-href').first();
      const tags = card.find('.gray-labels .status-li span').map((_, s) => clean($(s).text())).get();
      const moneyRow = card.find('.ic-16-money').first().parent();
      const pay = clean(moneyRow.find('.stipend').text()) || clean(moneyRow.find('.mobile').text()) || clean(moneyRow.find('.desktop').text());
      const duration = clean(card.find('.ic-16-calendar').first().parent().text());
      const skills = card.find('.job_skill').map((_, s) => clean($(s).text())).get();
      const about = clean(card.find('.about_job .text').text());

      const employmentType = card.attr('employment_type');
      let jobTypeHint = null;
      if (employmentType === 'internship') jobTypeHint = 'internship';
      else if (tags.some((t) => /part\s*time/i.test(t))) jobTypeHint = 'part time';

      const description = [
        about,
        skills.length ? `Skills: ${skills.join(', ')}` : null,
        duration ? `Duration: ${duration}` : null,
        tags.length ? `Tags: ${tags.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      items.push({
        externalId: card.attr('internshipid'),
        title: link.text(),
        url: link.attr('href'),
        employer: card.find('.company-name').first().text(),
        location: card.find('.locations').first().text(),
        pay,
        posted: card.find('.ic-16-reschedule').first().parent().text(),
        jobTypeHint,
        description,
      });
    } catch (e) {
      errors.push(`card #${i}: ${e.message}`);
    }
  });
  return { items, errors };
}

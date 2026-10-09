import * as cheerio from 'cheerio';
import { clean } from '../normalizer/text.js';

/**
 * Parse a WorkIndia job detail page. Structure (checked against the saved pages in scraper/fixtures):
 *   section.JobDetailContainer > div.text-secondary > h3 ("Job Timings" | "Interview Timings" | "Job Address") + p
 * We only read "Job Timings". The "Interview Timings" block is about when to attend an interview, not work hours.
 * Returns { timings: string|null, address: string|null }.
 */
export function parseWorkindiaDetail(html) {
  const $ = cheerio.load(html);
  const field = (label) => {
    const h3 = $('section.JobDetailContainer h3')
      .filter((_, el) => clean($(el).text())?.toLowerCase() === label.toLowerCase())
      .first();
    return h3.length ? clean(h3.next('p').text()) : null;
  };
  return { timings: field('Job Timings'), address: field('Job Address') };
}

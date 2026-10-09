import { parseFreshersworld } from '../parser/freshersworld.js';
import { scrapeSource } from './base.js';

// Page 1 of each category only: no clean pagination URL was found in the HTML.
const def = {
  name: 'freshersworld',
  baseUrl: 'https://www.freshersworld.com',
  parse: parseFreshersworld,
  context: { defaultPayUnit: 'month', defaultCurrency: 'INR', cityPosition: 'first' },
  targets: [
    { path: '/jobs/category/part-time-job-vacancies', fixture: 'freshersworld_part_time.html', defaultType: 'part_time', category: 'Part time' },
    { path: '/jobs/category/internship-job-vacancies', fixture: 'freshersworld_internship.html', defaultType: 'internship', category: 'Internship' },
    { path: '/jobs/category/retail-job-vacancies', defaultType: 'full_time', category: 'Retail' },
    { path: '/jobs/category/hospitality-job-vacancies', defaultType: 'full_time', category: 'Hospitality' },
  ],
};

export default def;
export const scrape = (fetcher, opts) => scrapeSource(def, fetcher, opts);

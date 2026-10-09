import { parseInternshala } from '../parser/internshala.js';
import { scrapeSource } from './base.js';

// Only clean listing paths: Internshala's robots.txt disallows query strings and detail pages.
const pageUrl = (path, n) => `${path}page-${n}/`;

const def = {
  name: 'internshala',
  baseUrl: 'https://internshala.com',
  parse: parseInternshala,
  context: { defaultPayUnit: 'unknown', defaultCurrency: null, cityPosition: 'first' },
  targets: [
    { path: '/internships/part-time-jobs/', fixture: 'internshala_part_time_internships.html', defaultType: 'internship', maxPages: 3, pageUrl },
    { path: '/internships/work-from-home-internships/', fixture: 'internshala_wfh_internships.html', defaultType: 'internship', maxPages: 3, pageUrl },
    { path: '/jobs/', fixture: 'internshala_jobs.html', defaultType: 'full_time', maxPages: 3, pageUrl },
    { path: '/jobs/part-time-jobs/', fixture: 'internshala_part_time_jobs.html', defaultType: 'part_time', maxPages: 3, pageUrl },
  ],
};

export default def;
export const scrape = (fetcher, opts) => scrapeSource(def, fetcher, opts);

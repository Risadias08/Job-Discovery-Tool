import { parseWorkindia } from '../parser/workindia.js';
import { scrapeSource } from './base.js';

const CITIES = ['bengaluru', 'delhi', 'mumbai'];

// WorkIndia's robots.txt disallows query strings, which rules out its ?pg=2 pagination,
// so we fetch page 1 of several category/city pages instead.
// "casual" = everyday service and gig roles (delivery, cooking); WorkIndia does not label them part/full time itself.
const CATEGORIES = [
  { slug: 'part-time-jobs', defaultType: 'part_time', label: 'Part time' },
  { slug: 'delivery-jobs', defaultType: 'casual', label: 'Delivery' },
  { slug: 'cook-jobs', defaultType: 'casual', label: 'Cook' },
];

const def = {
  name: 'workindia',
  baseUrl: 'https://www.workindia.in',
  parse: parseWorkindia,
  // WorkIndia salaries carry no unit; every value seen (8,000-65,000) is a monthly figure.
  context: { defaultPayUnit: 'month', defaultCurrency: 'INR', cityPosition: 'last' },
  targets: CATEGORIES.flatMap((c) =>
    CITIES.map((city) => ({
      path: `/${c.slug}-in-${city}/`,
      fixture: c.slug === 'delivery-jobs' && city === 'bengaluru' ? 'workindia_delivery_bengaluru.html' : undefined,
      defaultType: c.defaultType,
      category: c.label,
    }))
  ),
};

export default def;
export const scrape = (fetcher, opts) => scrapeSource(def, fetcher, opts);

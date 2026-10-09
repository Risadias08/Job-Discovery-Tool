import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 4000),
  dbPath: path.resolve(ROOT, process.env.DB_PATH || 'data/gradguide.db'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  scraper: {
    userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; GradGuideStudentProject/1.0; educational)',
    delayMs: num(process.env.SCRAPER_DELAY_MS, 2000),
    maxPages: num(process.env.SCRAPER_MAX_PAGES, 3),
    maxDetails: num(process.env.SCRAPER_MAX_DETAILS, 200),
  },
};

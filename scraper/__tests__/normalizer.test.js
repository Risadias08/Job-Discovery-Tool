import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePay } from '../normalizer/pay.js';
import { parsePostedDate } from '../normalizer/date.js';
import { parseLocation } from '../normalizer/location.js';
import { normalizeJobType, resolveJobType } from '../normalizer/jobType.js';
import { clean } from '../normalizer/text.js';
import { normalizeListing, ValidationError } from '../normalizer/index.js';

const NOW = new Date('2026-10-06T10:00:00Z');

test('clean collapses whitespace and returns null for empty', () => {
  assert.equal(clean('  a \n\t b c  '), 'a b c');
  assert.equal(clean('   '), null);
  assert.equal(clean(undefined), null);
});

test('pay: Indian digit grouping and yearly unit', () => {
  assert.deepEqual(parsePay('₹ 4,50,000 - 4,60,000 /year'), { raw: '₹ 4,50,000 - 4,60,000 /year', min: 450000, max: 460000, currency: 'INR', unit: 'year' });
});
test('pay: single value, monthly, weekly, lump sum, USD', () => {
  assert.equal(parsePay('₹ 15,000 /month').min, 15000);
  assert.equal(parsePay('₹ 400 - 1,800 /week').unit, 'week');
  assert.equal(parsePay('₹ 1,200 - 1,600 lump sum').unit, 'total');
  assert.equal(parsePay('$ 8,640 - 24,000 /year').currency, 'USD');
});
test('pay: unit-less values use the source default', () => {
  const p = parsePay('Rs. 35000 - Rs. 59000', { defaultUnit: 'month', defaultCurrency: 'INR' });
  assert.deepEqual([p.min, p.max, p.unit, p.currency], [35000, 59000, 'month', 'INR']);
  assert.equal(parsePay('2500 - 5000 Monthly').unit, 'month');
});
test('pay: missing, unpaid and non-numeric', () => {
  assert.equal(parsePay(null), null);
  assert.equal(parsePay('   '), null);
  assert.deepEqual([parsePay('Unpaid').min, parsePay('Unpaid').max], [0, 0]);
  const pb = parsePay('Performance Based');
  assert.equal(pb.min, null);
  assert.equal(pb.raw, 'Performance Based');
});

test('date: relative phrases', () => {
  assert.equal(parsePostedDate('Few hours ago', NOW), '2026-10-06');
  assert.equal(parsePostedDate('Just now', NOW), '2026-10-06');
  assert.equal(parsePostedDate('5 days ago', NOW), '2026-10-01');
  assert.equal(parsePostedDate('3 weeks ago', NOW), '2026-09-15');
  assert.equal(parsePostedDate('1 months ago', NOW), '2026-09-06');
});
test('date: month/day/year, invalid and missing', () => {
  assert.equal(parsePostedDate('Posted on: 9/25/2026', NOW), '2026-09-25');
  assert.equal(parsePostedDate('Posted on: 13/40/2026', NOW), null);
  assert.equal(parsePostedDate('12/31/2030', NOW), null); // future
  assert.equal(parsePostedDate('', NOW), null);
  assert.equal(parsePostedDate(null, NOW), null);
});

test('location: city list, remote, hybrid, aliases', () => {
  assert.deepEqual(parseLocation('Delhi, Gurgaon, Noida'), { raw: 'Delhi, Gurgaon, Noida', city: 'Delhi', remote: false });
  assert.deepEqual(parseLocation('Work from home'), { raw: 'Work from home', city: null, remote: true });
  assert.equal(parseLocation('Bangalore (Hybrid)').city, 'Bengaluru');
  assert.equal(parseLocation('Bellandur, Bengaluru', { cityPosition: 'last' }).city, 'Bengaluru');
  assert.equal(parseLocation(''), null);
  assert.equal(parseLocation(undefined), null);
});

test('job type normalisation and precedence', () => {
  assert.equal(normalizeJobType('Part time'), 'part_time');
  assert.equal(normalizeJobType('Full-Time'), 'full_time');
  assert.equal(normalizeJobType('International Sales Associate'), null); // "intern" inside a word must not match
  assert.equal(resolveJobType({ hint: 'internship', title: 'x', defaultType: 'part_time' }), 'internship');
  assert.equal(resolveJobType({ title: 'HR Intern', defaultType: 'part_time' }), 'internship');
  assert.equal(resolveJobType({ title: 'Cook', defaultType: 'casual' }), 'casual');
  assert.equal(resolveJobType({ title: 'Cook' }), 'unknown');
});

const ctx = { source: 't', baseUrl: 'https://example.com', defaultType: 'full_time', now: NOW };

test('normalizeListing fills missing fields with null instead of failing', () => {
  const l = normalizeListing({ title: ' Barista ', url: '/job/1' }, ctx);
  assert.equal(l.title, 'Barista');
  assert.equal(l.url, 'https://example.com/job/1');
  assert.equal(l.employer, null);
  assert.equal(l.location, null);
  assert.equal(l.pay, null);
  assert.equal(l.postedDate, null);
  assert.equal(l.jobType, 'full_time');
});
test('normalizeListing rejects missing title or bad url', () => {
  assert.throws(() => normalizeListing({ title: '  ', url: '/x' }, ctx), ValidationError);
  assert.throws(() => normalizeListing({ title: 'A job', url: 'javascript:alert(1)' }, ctx), ValidationError);
  assert.throws(() => normalizeListing({ title: 'A job', url: undefined }, ctx), ValidationError);
});

import { parseJobTimings } from '../normalizer/hours.js';

test('job timings: hours per day x days, clock ranges, direct weekly hours', () => {
  assert.deepEqual(parseJobTimings('3 hours a day | Monday to Saturday | day shift').weekly, { min: 18, max: 18 });
  assert.deepEqual(parseJobTimings('9:30 AM - 6:30 PM | Monday to Saturday').weekly, { min: 54, max: 54 });
  assert.deepEqual(parseJobTimings('10:00 PM - 6:00 AM | Mon-Fri').weekly, { min: 40, max: 40 }); // overnight shift
  assert.deepEqual(parseJobTimings('4-5 hrs a day | 3 days a week').weekly, { min: 12, max: 15 });
  assert.deepEqual(parseJobTimings('20 hours per week').weekly, { min: 20, max: 20 });
  assert.deepEqual(parseJobTimings('Saturday, Sunday | 8 hours a day').weekly, { min: 16, max: 16 });
});
test('job timings: nothing is guessed when information is missing', () => {
  assert.equal(parseJobTimings('ANY TIME | day shift').weekly, null);
  assert.equal(parseJobTimings('9 AM - 1 PM').weekly, null); // hours known, days not stated
  assert.equal(parseJobTimings('9 AM - 1 PM').perDay.min, 4);
  assert.equal(parseJobTimings(null), null);
  assert.equal(parseJobTimings('   '), null);
});

test('posted dates use Indian time: just after midnight IST the date is already the next day (UTC is not)', () => {
  const justAfterMidnightIST = new Date('2026-10-06T19:24:00Z'); // 00:54 on 7 Oct in India
  assert.equal(parsePostedDate('Few hours ago', justAfterMidnightIST), '2026-10-07');
  assert.equal(parsePostedDate('5 days ago', justAfterMidnightIST), '2026-10-02');
  assert.equal(parsePostedDate('Yesterday', justAfterMidnightIST), '2026-10-06');
  assert.equal(parsePostedDate('Posted on: 10/6/2026', justAfterMidnightIST), '2026-10-06');
});

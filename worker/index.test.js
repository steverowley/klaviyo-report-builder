import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  slugify,
  trimReportWarnings,
  extractResults,
  processAggregate,
  normaliseCampaigns,
  isEmailChannel,
  aggregateFlowRows,
  reportBody,
  aggregateBody,
  nextDay,
  validateDateRange,
  tzOffset,
  pickMetric,
  countMetricMatches,
  pbkdf2Hash,
  pbkdf2Verify,
  makeToken,
  verifyToken,
} from './index.js';

describe('slugify', () => {
  it('lowercases and replaces whitespace with underscores', () => {
    expect(slugify('Acme Co')).toBe('acme_co');
  });
  it('strips characters outside [a-z0-9_]', () => {
    expect(slugify('Big & Bold!')).toBe('big__bold');
  });
  it('caps the length at 32 characters', () => {
    expect(slugify('a'.repeat(50))).toHaveLength(32);
  });
  it('falls back to a client_ prefix when nothing usable remains', () => {
    expect(slugify('!!!')).toMatch(/^client_/);
  });
});

describe('trimReportWarnings', () => {
  it('returns [] for non-arrays', () => {
    expect(trimReportWarnings(undefined)).toEqual([]);
    expect(trimReportWarnings('nope')).toEqual([]);
  });
  it('caps the number of warnings at 6', () => {
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`);
    expect(trimReportWarnings(many)).toHaveLength(6);
  });
  it('caps each warning length at 120 chars and coerces to string', () => {
    const long = 'x'.repeat(500);
    const [w] = trimReportWarnings([long]);
    expect(w).toHaveLength(120);
    expect(trimReportWarnings([123])).toEqual(['123']);
  });
});

describe('extractResults', () => {
  it('reads the nested attributes.results array', () => {
    expect(extractResults({ data: { attributes: { results: [1, 2] } } })).toEqual([1, 2]);
  });
  it('falls back to a top-level data array', () => {
    expect(extractResults({ data: [3, 4] })).toEqual([3, 4]);
  });
  it('returns [] for unknown shapes or null', () => {
    expect(extractResults({})).toEqual([]);
    expect(extractResults(null)).toEqual([]);
  });
});

describe('processAggregate', () => {
  it('reads the results[0].measurements shape and trims dates to YYYY-MM-DD', () => {
    const agg = {
      data: { attributes: { results: [{
        dates: ['2024-01-01T00:00:00+00:00', '2024-01-02T00:00:00+00:00'],
        measurements: { count: [5, 7] },
      }] } },
    };
    expect(processAggregate(agg, 'count')).toEqual({ dates: ['2024-01-01', '2024-01-02'], counts: [5, 7] });
  });
  it('reads the attributes.data[0].measurements fallback shape', () => {
    const agg = { data: { attributes: { dates: ['2024-03-01T00:00:00Z'], data: [{ measurements: { count: [9] } }] } } };
    expect(processAggregate(agg, 'count')).toEqual({ dates: ['2024-03-01'], counts: [9] });
  });
  it('returns null when there is no usable data', () => {
    expect(processAggregate({}, 'count')).toBeNull();
    expect(processAggregate({ data: { attributes: { results: [{ dates: [], measurements: { count: [] } }] } } }, 'count')).toBeNull();
  });
  it('returns null when dates and counts lengths differ (avoids a misaligned chart)', () => {
    const agg = { data: { attributes: { results: [{
      dates: ['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z', '2024-01-03T00:00:00Z'],
      measurements: { count: [5, 7] },
    }] } } };
    expect(processAggregate(agg, 'count')).toBeNull();
  });
});

describe('normaliseCampaigns', () => {
  it('maps fields, resolves names, and coerces numbers', () => {
    const report = { data: { attributes: { results: [
      { groupings: { campaign_id: 'c1' }, statistics: { recipients: '100', open_rate: 0.5, conversion_value: '250' } },
    ] } } };
    const [row] = normaliseCampaigns(report, { c1: 'Welcome' });
    expect(row.campaign_id).toBe('c1');
    expect(row.campaign_name).toBe('Welcome');
    expect(row.recipients).toBe(100);
    expect(row.open_rate).toBe(0.5);
    expect(row.conversion_value).toBe(250);
  });
  it('falls back to the id when no name is known', () => {
    const report = { data: { attributes: { results: [{ groupings: { campaign_id: 'xyz' }, statistics: {} }] } } };
    expect(normaliseCampaigns(report, {})[0].campaign_name).toBe('xyz');
  });
  it('excludes SMS/push campaigns but keeps email and untagged rows', () => {
    const report = { data: { attributes: { results: [
      { groupings: { campaign_id: 'c1', send_channel: 'email' }, statistics: { recipients: 10 } },
      { groupings: { campaign_id: 'c2', send_channel: 'sms' }, statistics: { recipients: 99 } },
      { groupings: { campaign_id: 'c3' }, statistics: { recipients: 5 } },
    ] } } };
    const ids = normaliseCampaigns(report, {}).map(r => r.campaign_id);
    expect(ids).toEqual(['c1', 'c3']);
  });
});

describe('isEmailChannel', () => {
  it('treats email and missing/blank channels as email', () => {
    expect(isEmailChannel('email')).toBe(true);
    expect(isEmailChannel(null)).toBe(true);
    expect(isEmailChannel('')).toBe(true);
    expect(isEmailChannel(undefined)).toBe(true);
  });
  it('rejects explicit non-email channels', () => {
    expect(isEmailChannel('sms')).toBe(false);
    expect(isEmailChannel('push')).toBe(false);
  });
});

describe('nextDay', () => {
  it('adds one calendar day', () => {
    expect(nextDay('2024-01-31')).toBe('2024-02-01');
    expect(nextDay('2024-02-28')).toBe('2024-02-29'); // leap year
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('validateDateRange', () => {
  it('accepts a valid range', () => {
    expect(validateDateRange({ startDate: '2026-01-01', endDate: '2026-01-31' })).toBeNull();
  });
  it('rejects a non-YYYY-MM-DD date', () => {
    expect(validateDateRange({ startDate: '01/01/2026', endDate: '2026-01-31' })).toMatch(/YYYY-MM-DD/);
  });
  it('rejects start after end', () => {
    expect(validateDateRange({ startDate: '2026-02-01', endDate: '2026-01-01' })).toMatch(/on or before/);
  });
  it('rejects an absurdly long span', () => {
    expect(validateDateRange({ startDate: '2020-01-01', endDate: '2026-01-01' })).toMatch(/too long/);
  });
  it('validates the comparison window when present', () => {
    expect(validateDateRange({ startDate: '2026-01-01', endDate: '2026-01-31', comparisonStart: 'bad', comparisonEnd: '2025-12-31' })).toMatch(/comparisonStart/);
    expect(validateDateRange({ startDate: '2026-01-01', endDate: '2026-01-31', comparisonStart: '2025-12-31', comparisonEnd: '2025-12-01' })).toMatch(/comparisonStart must be on or before/);
  });
});

describe('aggregateFlowRows', () => {
  it('reconstructs opens/clicks from rate*delivered and re-derives rates against delivered', () => {
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, delivered: 100, open_rate: 0.3, click_rate: 0.1, conversions: 5, conversion_value: 500 } },
    ] } } };
    const [f] = aggregateFlowRows(report, { f1: 'Welcome Flow' });
    expect(f.name).toBe('Welcome Flow');
    expect(f.opens).toBe(30);
    expect(f.clicks).toBe(10);
    expect(f.open_rate).toBeCloseTo(0.3);
    expect(f.click_rate).toBeCloseTo(0.1);
    expect(f.ctor).toBeCloseTo(10 / 30);
    expect(f.conversion_rate).toBeCloseTo(0.05);
    expect(f.rpr).toBeCloseTo(5);
  });
  it('uses delivered (not recipients) so bounces do not overstate opens/clicks', () => {
    // 1000 recipients but only 500 delivered at a 0.60 open rate → 300 opens, and
    // the aggregate rate is the delivered-based 0.60, not 300/1000 = 0.30.
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 1000, delivered: 500, open_rate: 0.6, click_rate: 0.2, conversions: 0, conversion_value: 0 } },
    ] } } };
    const [f] = aggregateFlowRows(report, {});
    expect(f.opens).toBe(300);
    expect(f.clicks).toBe(100);
    expect(f.open_rate).toBeCloseTo(0.6);
    expect(f.click_rate).toBeCloseTo(0.2);
  });
  it('sums multiple message rows of the same flow', () => {
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, delivered: 100, open_rate: 0.4, click_rate: 0.2, conversions: 2, conversion_value: 200 } },
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, delivered: 100, open_rate: 0.2, click_rate: 0.1, conversions: 3, conversion_value: 100 } },
    ] } } };
    const [f] = aggregateFlowRows(report, {});
    expect(f.recipients).toBe(200);
    expect(f.opens).toBe(60);
    expect(f.conversions).toBe(5);
    expect(f.conversion_value).toBe(300);
    expect(f.open_rate).toBeCloseTo(0.3);
  });
  it('excludes non-email (SMS/push) flow messages', () => {
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1', send_channel: 'email' }, statistics: { recipients: 100, delivered: 100, open_rate: 0.3, click_rate: 0.1 } },
      { groupings: { flow_id: 'f2', send_channel: 'sms' }, statistics: { recipients: 999, delivered: 999, open_rate: 0.9, click_rate: 0.9 } },
    ] } } };
    const rows = aggregateFlowRows(report, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('f1');
  });
});

describe('reportBody', () => {
  it('builds the timeframe and includes conversion_metric_id only when provided', () => {
    const withId = JSON.parse(reportBody('campaign-values-report', '2024-01-01', '2024-01-31', 'm1'));
    expect(withId.data.type).toBe('campaign-values-report');
    expect(withId.data.attributes.timeframe).toEqual({ start: '2024-01-01T00:00:00+00:00', end: '2024-01-31T23:59:59+00:00' });
    expect(withId.data.attributes.conversion_metric_id).toBe('m1');

    const withoutId = JSON.parse(reportBody('flow-values-report', '2024-01-01', '2024-01-31', null));
    expect(withoutId.data.attributes.conversion_metric_id).toBeUndefined();
  });
});

describe('aggregateBody', () => {
  it('builds a daily metric-aggregate query with a datetime filter', () => {
    const body = JSON.parse(aggregateBody('m1', '2024-01-01', '2024-01-31', ['count']));
    expect(body.data.type).toBe('metric-aggregate');
    expect(body.data.attributes.metric_id).toBe('m1');
    expect(body.data.attributes.interval).toBe('day');
    expect(body.data.attributes.measurements).toEqual(['count']);
    expect(body.data.attributes.timezone).toBe('UTC');
    expect(body.data.attributes.filter).toContain('2024-01-01T00:00:00+00:00');
    // Exclusive next-day-midnight bound so the whole final day is included.
    expect(body.data.attributes.filter).toContain('2024-02-01T00:00:00+00:00');
  });
});

describe('tzOffset', () => {
  it('returns +00:00 for UTC, empty, or unknown zones', () => {
    expect(tzOffset('UTC', '2024-01-15')).toBe('+00:00');
    expect(tzOffset('', '2024-01-15')).toBe('+00:00');
    expect(tzOffset('Not/AZone', '2024-01-15')).toBe('+00:00');
  });
  it('computes US Eastern offset including DST', () => {
    expect(tzOffset('America/New_York', '2024-01-15')).toBe('-05:00');
    expect(tzOffset('America/New_York', '2024-07-15')).toBe('-04:00');
  });
  it('computes UK offset including BST', () => {
    expect(tzOffset('Europe/London', '2024-01-15')).toBe('+00:00');
    expect(tzOffset('Europe/London', '2024-07-15')).toBe('+01:00');
  });
});

describe('timezone-aware report bodies', () => {
  it('reportBody applies the supplied offsets', () => {
    const b = JSON.parse(reportBody('campaign-values-report', '2024-01-01', '2024-01-31', null, '-05:00', '-05:00'));
    expect(b.data.attributes.timeframe.start).toBe('2024-01-01T00:00:00-05:00');
    expect(b.data.attributes.timeframe.end).toBe('2024-01-31T23:59:59-05:00');
  });
  it('aggregateBody applies the supplied timezone and offsets', () => {
    const b = JSON.parse(aggregateBody('m1', '2024-01-01', '2024-01-31', ['count'], 'America/New_York', '-05:00', '-05:00'));
    expect(b.data.attributes.timezone).toBe('America/New_York');
    expect(b.data.attributes.filter).toContain('2024-01-01T00:00:00-05:00');
    expect(b.data.attributes.filter).toContain('2024-02-01T00:00:00-05:00');
  });
  it('defaults to UTC / +00:00 when not provided', () => {
    const b = JSON.parse(aggregateBody('m1', '2024-01-01', '2024-01-31', ['count']));
    expect(b.data.attributes.timezone).toBe('UTC');
    expect(b.data.attributes.filter).toContain('+00:00');
  });
});

describe('pickMetric', () => {
  const list = [
    { id: '1', attributes: { name: 'Placed Order' } },
    { id: '2', attributes: { name: 'Placed Order (Test Store)' } },
    { id: '3', attributes: { name: 'Subscribed to List' } },
  ];
  it('prefers an exact canonical-name match over a substring match', () => {
    expect(pickMetric(list, { exact: ['placed order'], includes: ['placed order'] }).id).toBe('1');
  });
  it('falls back to a substring match when no exact name exists', () => {
    const l = [{ id: '9', attributes: { name: 'Custom Placed Order Event' } }];
    expect(pickMetric(l, { exact: ['placed order'], includes: ['placed order'] }).id).toBe('9');
  });
  it('honours the exclude list', () => {
    const l = [{ id: '1', attributes: { name: 'Unsubscribed from SMS' } }];
    expect(pickMetric(l, { exact: [], includes: ['unsubscribed'], exclude: ['sms'] })).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(pickMetric(list, { exact: ['nope'], includes: ['nope'] })).toBeNull();
  });
});

describe('countMetricMatches', () => {
  const list = [
    { attributes: { name: 'Placed Order' } },
    { attributes: { name: 'Placed Order (Test)' } },
    { attributes: { name: 'Subscribed to List' } },
  ];
  it('counts fuzzy matches and honours excludes', () => {
    expect(countMetricMatches(list, { includes: ['placed order'] })).toBe(2);
    expect(countMetricMatches(list, { includes: ['placed order'], exclude: ['test'] })).toBe(1);
  });
});

describe('pbkdf2 hash + verify', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await pbkdf2Hash('correct horse battery staple');
    expect(hash.startsWith('pbkdf2:')).toBe(true);
    expect(await pbkdf2Verify('correct horse battery staple', hash)).toBe(true);
    expect(await pbkdf2Verify('wrong password', hash)).toBe(false);
  });
  it('rejects a malformed stored hash', async () => {
    expect(await pbkdf2Verify('x', 'notpbkdf2:foo:bar')).toBe(false);
  });
});

describe('session tokens', () => {
  afterEach(() => vi.useRealTimers());

  it('round-trips a valid token and exposes the claims', async () => {
    const token = await makeToken('alice@swankyagency.com', true, 'topsecret');
    const claims = await verifyToken(token, 'topsecret');
    expect(claims).not.toBeNull();
    expect(claims.sub).toBe('alice@swankyagency.com');
    expect(claims.admin).toBe(true);
    expect(typeof claims.exp).toBe('number');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await makeToken('bob', false, 'secret-a');
    expect(await verifyToken(token, 'secret-b')).toBeNull();
  });

  it('rejects a tampered or malformed token', async () => {
    const token = await makeToken('bob', false, 'secret');
    expect(await verifyToken(token + 'tamper', 'secret')).toBeNull();
    expect(await verifyToken('garbage', 'secret')).toBeNull();
    expect(await verifyToken(null, 'secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const token = await makeToken('carol', false, 'secret');
    vi.setSystemTime(new Date('2020-02-01T00:00:00Z')); // well beyond the 7-day expiry
    expect(await verifyToken(token, 'secret')).toBeNull();
  });
});

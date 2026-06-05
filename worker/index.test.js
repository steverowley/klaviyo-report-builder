import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  slugify,
  extractResults,
  processAggregate,
  normaliseCampaigns,
  aggregateFlowRows,
  reportBody,
  aggregateBody,
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
});

describe('aggregateFlowRows', () => {
  it('reconstructs opens/clicks from rate*recipients and re-derives rates', () => {
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, open_rate: 0.3, click_rate: 0.1, conversions: 5, conversion_value: 500 } },
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
  it('sums multiple message rows of the same flow', () => {
    const report = { data: { attributes: { results: [
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, open_rate: 0.4, click_rate: 0.2, conversions: 2, conversion_value: 200 } },
      { groupings: { flow_id: 'f1' }, statistics: { recipients: 100, open_rate: 0.2, click_rate: 0.1, conversions: 3, conversion_value: 100 } },
    ] } } };
    const [f] = aggregateFlowRows(report, {});
    expect(f.recipients).toBe(200);
    expect(f.opens).toBe(60);
    expect(f.conversions).toBe(5);
    expect(f.conversion_value).toBe(300);
    expect(f.open_rate).toBeCloseTo(0.3);
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
    expect(body.data.attributes.filter).toContain('2024-01-31T23:59:59+00:00');
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

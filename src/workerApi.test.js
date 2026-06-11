import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authHeaders, workerFetch } from './workerApi.js';

describe('authHeaders', () => {
  it('returns a Bearer header when a token is present, otherwise nothing', () => {
    expect(authHeaders('abc')).toEqual({ Authorization: 'Bearer abc' });
    expect(authHeaders('')).toEqual({});
    expect(authHeaders(null)).toEqual({});
  });
});

describe('workerFetch', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const calledUrl = () => String(fetchMock.mock.calls[0][0]);
  const calledInit = () => fetchMock.mock.calls[0][1];

  it('hits the bare worker URL with GET and no body by default', async () => {
    await workerFetch('https://w.example.com/', { token: 't' });
    expect(calledUrl()).toBe('https://w.example.com/');
    expect(calledInit().method).toBe('GET');
    expect(calledInit().headers).toEqual({ Authorization: 'Bearer t' });
    expect(calledInit().body).toBeUndefined();
  });

  it('builds ?action= and extra query params with encoding', async () => {
    await workerFetch('https://w.example.com/', {
      action: 'get-report',
      params: { key: 'report_01 &x' },
    });
    expect(calledUrl()).toBe('https://w.example.com/?action=get-report&key=report_01+%26x');
  });

  it('JSON-encodes the body and sets Content-Type for POSTs', async () => {
    await workerFetch('https://w.example.com/', {
      action: 'save-report', method: 'POST', token: 't', body: { html: '<p>x</p>' },
    });
    expect(calledInit().method).toBe('POST');
    expect(calledInit().headers['Content-Type']).toBe('application/json');
    expect(calledInit().body).toBe('{"html":"<p>x</p>"}');
  });

  it('passes an abort signal through', async () => {
    const controller = new AbortController();
    await workerFetch('https://w.example.com/', { signal: controller.signal });
    expect(calledInit().signal).toBe(controller.signal);
  });
});

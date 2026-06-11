import { describe, it, expect, vi } from 'vitest';
import { readAnthropicSse } from './anthropicStream.js';

const enc = new TextEncoder();

function readerFromChunks(chunks) {
  let i = 0;
  return {
    read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }),
    cancel: vi.fn(),
  };
}

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

describe('readAnthropicSse', () => {
  it('accumulates text deltas and captures usage and stop state', async () => {
    const reader = readerFromChunks([
      sse({ type: 'message_start', message: { usage: { input_tokens: 1200, cache_read_input_tokens: 900 } } }),
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: '<!DOCTYPE html>' } }),
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: '<html></html>' } }),
      sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5000 } }),
      sse({ type: 'message_stop' }),
    ]);
    const r = await readAnthropicSse(reader);
    expect(r.cancelled).toBe(false);
    expect(r.text).toBe('<!DOCTYPE html><html></html>');
    expect(r.sawMessageStop).toBe(true);
    expect(r.stopReason).toBe('end_turn');
    expect(r.outputTokens).toBe(5000); // corrected by message_delta usage
    expect(r.inputUsage.input_tokens).toBe(1200);
    expect(r.inputUsage.cache_read_input_tokens).toBe(900);
  });

  it('reassembles an SSE line split across network chunks', async () => {
    const whole = sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello world' } });
    const cut = 30;
    const reader = readerFromChunks([
      whole.slice(0, cut),
      whole.slice(cut) + sse({ type: 'message_stop' }),
    ]);
    const r = await readAnthropicSse(reader);
    expect(r.text).toBe('hello world');
    expect(r.sawMessageStop).toBe(true);
  });

  it('treats [DONE] as a clean stop', async () => {
    const reader = readerFromChunks([
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } }),
      'data: [DONE]\n\n',
    ]);
    const r = await readAnthropicSse(reader);
    expect(r.sawMessageStop).toBe(true);
  });

  it('throws on a mid-stream error event instead of returning a half report', async () => {
    const reader = readerFromChunks([
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }),
      sse({ type: 'error', error: { type: 'overloaded_error' } }),
    ]);
    await expect(readAnthropicSse(reader)).rejects.toThrow(/overloaded_error/);
  });

  it('reports an interrupted stream as not complete (no message_stop)', async () => {
    const reader = readerFromChunks([
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'cut off mid' } }),
    ]);
    const r = await readAnthropicSse(reader);
    expect(r.sawMessageStop).toBe(false);
    expect(r.stopReason).toBeNull();
    expect(r.text).toBe('cut off mid');
  });

  it('cancels the reader and bails out when isCancelled flips', async () => {
    const reader = readerFromChunks([
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }),
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'b' } }),
    ]);
    let calls = 0;
    const r = await readAnthropicSse(reader, { isCancelled: () => ++calls > 1 });
    expect(r.cancelled).toBe(true);
    expect(reader.cancel).toHaveBeenCalled();
  });

  it('skips malformed JSON lines without losing the rest of the stream', async () => {
    const reader = readerFromChunks([
      'data: {not json\n\n' + sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }) + sse({ type: 'message_stop' }),
    ]);
    const r = await readAnthropicSse(reader);
    expect(r.text).toBe('ok');
    expect(r.sawMessageStop).toBe(true);
  });

  it('feeds the watchdog and reports running token counts to onTextDelta', async () => {
    const reader = readerFromChunks([
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }),
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'b' } }) + sse({ type: 'message_stop' }),
    ]);
    const onActivity = vi.fn();
    const deltas = [];
    await readAnthropicSse(reader, { onActivity, onTextDelta: (t, n) => deltas.push([t, n]) });
    expect(onActivity).toHaveBeenCalledTimes(2); // once per chunk read
    expect(deltas).toEqual([['a', 1], ['b', 2]]);
  });
});

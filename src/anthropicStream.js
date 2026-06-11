// Parser for the Anthropic SSE stream relayed through the worker proxy.
//
// Consumes a ReadableStream reader and accumulates the streamed text, token
// counts, and stop state. The caller stays in charge of UI (progress bars),
// cancellation policy, and watchdogs via the callbacks:
//   onActivity()                — fires on every chunk (feed an idle watchdog)
//   isCancelled()               — checked per chunk; true cancels the reader
//                                 and resolves with { cancelled: true }
//   onTextDelta(delta, tokens)  — fires per text delta with the running token count
//
// A mid-stream `error` event (e.g. overloaded_error) throws, so a half-written
// report can never be mistaken for a finished one.
export async function readAnthropicSse(reader, { onActivity, isCancelled, onTextDelta } = {}) {
  const decoder = new TextDecoder();
  let sseBuffer = '';
  let text = '';
  let outputTokens = 0;
  let stopReason = null;
  let sawMessageStop = false;
  let inputUsage = {};

  outer: while (true) {
    const { done, value } = await reader.read();
    onActivity?.();
    if (done) break;
    if (isCancelled?.()) {
      reader.cancel();
      return { cancelled: true, text, outputTokens, stopReason, sawMessageStop, inputUsage };
    }

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') { sawMessageStop = true; break outer; }
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === 'error') {
        // Anthropic emits an SSE error event (e.g. overloaded_error) mid-stream and
        // then closes — surface it instead of saving the half-written report.
        throw new Error("The report generation failed partway through (" + (ev.error?.type || ev.error?.message || 'stream error') + "). Please try again.");
      } else if (ev.type === 'message_start' && ev.message?.usage) {
        inputUsage = ev.message.usage;
      } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        text += ev.delta.text;
        outputTokens++;
        onTextDelta?.(ev.delta.text, outputTokens);
      } else if (ev.type === 'message_delta') {
        stopReason = ev.delta?.stop_reason ?? null;
        if (ev.usage?.output_tokens) outputTokens = ev.usage.output_tokens;
      } else if (ev.type === 'message_stop') {
        sawMessageStop = true;
        break outer;
      }
    }
  }

  return { cancelled: false, text, outputTokens, stopReason, sawMessageStop, inputUsage };
}

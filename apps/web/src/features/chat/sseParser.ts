export type ParsedSseFrame = { event: string; data: string };

export async function* readSseFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    let next = await reader.read();
    while (!next.done) {
      const { value } = next;
      buffer += decoder.decode(value, { stream: true });
      let separator = findFrameSeparator(buffer);
      while (separator) {
        const frameText = buffer.slice(0, separator.start);
        buffer = buffer.slice(separator.end);
        const frame = parseFrame(frameText);
        if (frame) yield frame;
        separator = findFrameSeparator(buffer);
      }
      next = await reader.read();
    }
    buffer += decoder.decode();
    const finalFrame = parseFrame(buffer);
    if (finalFrame) yield finalFrame;
  } finally {
    reader.releaseLock();
  }
}

function findFrameSeparator(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function parseFrame(frame: string): ParsedSseFrame | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

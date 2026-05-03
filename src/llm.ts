export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallGroqOptions {
  apiKey: string;
  messages: ChatMessage[];
  /** Defaults to a current Groq model. Override for testing other models. */
  model?: string;
  /** Hard timeout for the request, in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Send a chat completion request to Groq.
 * Returns the assistant's reply as a string, or throws an Error with a useful message.
 */
export async function callGroq(options: CallGroqOptions): Promise<string> {
  const {
    apiKey,
    messages,
    model = DEFAULT_MODEL,
    timeoutMs = 30_000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`Network error calling Groq: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await safeReadText(response);
    if (response.status === 401) {
      throw new Error('Groq returned 401 Unauthorized. Check your API key.');
    }
    if (response.status === 429) {
      throw new Error('Groq rate limit hit. Wait a few seconds and try again.');
    }
    throw new Error(`Groq error ${response.status}: ${body || response.statusText}`);
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected Groq response shape: missing choices[0].message.content');
  }
  return content;
}

/**
 * Like callGroq, but streams tokens as they arrive.
 * Calls onToken for each token chunk. Returns the full assembled reply.
 */
export async function callGroqStream(
  options: CallGroqOptions,
  onToken: (token: string) => void,
): Promise<string> {
  const {
    apiKey,
    messages,
    model = DEFAULT_MODEL,
    timeoutMs = 60_000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`Network error calling Groq: ${err?.message ?? err}`);
  }

  if (!response.ok) {
    clearTimeout(timer);
    const body = await safeReadText(response);
    if (response.status === 401) throw new Error('Groq returned 401 Unauthorized. Check your API key.');
    if (response.status === 429) throw new Error('Groq rate limit hit. Wait a few seconds and try again.');
    throw new Error(`Groq error ${response.status}: ${body || response.statusText}`);
  }

  if (!response.body) {
    clearTimeout(timer);
    throw new Error('Groq streaming response had no body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines; each line in an event starts with "data: ".
      // We split on \n, process complete lines, and keep the last partial line in the buffer.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta;
            onToken(delta);
          }
        } catch {
          // Skip lines that aren't valid JSON (rare but defensive).
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return fullText;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
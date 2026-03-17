import fetch from 'node-fetch';

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

function getConfig() {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || DEFAULT_API_URL;
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || '15000', 10) || 15000;

  return { apiKey, apiUrl, model, timeoutMs };
}

export function isAiConfigured() {
  const { apiKey } = getConfig();
  return Boolean(apiKey);
}

export async function chatCompletion(messages, { temperature = 0.2, maxTokens = 500 } = {}) {
  const { apiKey, apiUrl, model, timeoutMs } = getConfig();
  if (!apiKey) {
    throw new Error('AI is not configured (AI_API_KEY missing).');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`AI request failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI response was missing content.');
    return String(content).trim();
  } finally {
    clearTimeout(timer);
  }
}

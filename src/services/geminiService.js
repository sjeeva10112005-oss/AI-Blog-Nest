const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_FALLBACK_MODEL = 'gemini-flash-lite-latest';
const RETRYABLE = [429, 500, 503];
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const aiError = (message) => {
  const err = new Error(message);
  err.status = 502;
  return err;
};

const parseJson = (text) => {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw aiError('Gemini returned malformed JSON');
  }
};

const generate = async (genAI, modelName, prompt, json) => {
  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      ...(json && { generationConfig: { responseMimeType: 'application/json' } }),
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) {
    throw aiError('Invalid Gemini response');
  }
  return text;
};

// Sends a prompt to Gemini. With { json: true } Gemini is asked for a JSON response
// and the parsed object is returned instead of text.
// Overload/rate-limit errors are retried with backoff, then retried once on the fallback model.
const callGemini = async (prompt, { json = false } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Gemini API key is not configured');
    err.status = 503;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const attempts = [
    ...Array.from({ length: MAX_ATTEMPTS }, () => primary),
    ...(fallback && fallback !== primary ? [fallback] : []),
  ];

  let lastError;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const text = await generate(genAI, attempts[i], prompt, json);
      return json ? parseJson(text) : text;
    } catch (error) {
      lastError = error;
      console.error(`Gemini API Error (${attempts[i]}, attempt ${i + 1}):`, error.message);
      if (!RETRYABLE.includes(error.status)) break;
      if (i < attempts.length - 1) await sleep(500 * 2 ** i);
    }
  }

  if (lastError.status === 502) throw lastError;
  // Upstream status codes (e.g. Google's 404 for a retired model) would be misleading to API clients.
  throw aiError(
    lastError.status === 503 || lastError.status === 429
      ? 'AI service is busy right now, please try again in a moment'
      : `AI service error: ${lastError.message}`
  );
};

module.exports = {
  callGemini,
};

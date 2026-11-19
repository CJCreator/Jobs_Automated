// Talks to AI providers with a key the user supplies for one request.
//
// Security shape: every base URL is a constant below; the only caller value that
// reaches a URL is the model id (validated); keys travel in headers only;
// redirects are refused; and no provider response text is ever put in an error.
import Anthropic from "@anthropic-ai/sdk";
import { LlmError, errorForStatus, scrub } from "./errors.mjs";
import { mockComplete, mockVerifyKey } from "./mock.mjs";

export const PROVIDERS = [
  { id: "gemini", label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", keyHint: "Starts with AIza" },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", keyHint: "Starts with sk-" },
  { id: "anthropic", label: "Anthropic Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "Starts with sk-ant-" },
  { id: "openrouter", label: "OpenRouter", keyUrl: "https://openrouter.ai/keys", keyHint: "Starts with sk-or-" },
  { id: "groq", label: "Groq", keyUrl: "https://console.groq.com/keys", keyHint: "Starts with gsk_" },
];

const LABELS = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.label]));

const BASES = Object.freeze({
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
});

const VERIFY_MS = 15_000;
const COMPLETE_MS = 120_000;
const RECOMMEND = { gemini: /flash/i, openai: /mini/i, groq: /llama.*70b|versatile/i };
const NON_CHAT = /embed|whisper|tts|dall-e|moderation|audio|image|realtime|transcribe|search|similarity/i;

export function isProviderAllowed(id) {
  if (id === "mock") return process.env.ROLEWRIGHT_ALLOW_MOCK_LLM === "1" && process.env.NODE_ENV !== "production";
  return PROVIDERS.some((p) => p.id === id);
}

function assertAllowed(provider) {
  if (provider === "mock" && !isProviderAllowed("mock")) throw new LlmError("not_allowed", "That provider is not available.");
  if (!isProviderAllowed(provider)) throw new LlmError("not_allowed", "That AI provider is not supported.");
}

function assertKey(key) {
  if (typeof key !== "string" || key.length < 8 || key.length > 400 || /[\s\u0000-\u001f]/.test(key)) {
    throw new LlmError("invalid_key", "That key does not look right. Check that you copied the whole key.");
  }
}

/** The model id is the one caller value that reaches a URL, so it is checked strictly. */
function assertModel(model) {
  if (typeof model !== "string" || !/^[\w.:/-]{1,200}$/.test(model) || model.includes("..")) {
    throw new LlmError("model_not_found", "That model name is not valid. Pick one from the list.");
  }
}

/** One fetch with the safety options; returns the Response or throws a plain error. */
async function call(url, init, key, label, ms) {
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(ms) });
  } catch (e) {
    // Do not surface e.message: it can contain the URL. Name the cause only.
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    void scrub(e?.message, key);
    throw new LlmError("network", timedOut ? `${label} took too long to answer. Try again.` : `Could not reach ${label}. Check your connection and try again.`);
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    throw new LlmError("bad_response", "The AI sent back something unreadable. Try again.", res.status);
  }
}

const pickRecommended = (provider, models) => {
  const re = RECOMMEND[provider];
  return re ? (models.find((m) => re.test(m.id))?.id ?? null) : null;
};

// ---- Gemini ----------------------------------------------------------------

const geminiHeaders = (key) => ({ "x-goog-api-key": key, "content-type": "application/json" });

async function geminiVerify(key) {
  const res = await call(`${BASES.gemini}/models?pageSize=200`, { method: "GET", headers: geminiHeaders(key) }, key, LABELS.gemini, VERIFY_MS);
  // Gemini answers 400 (not 401) for a malformed or unknown key.
  if (res.status === 400) throw new LlmError("invalid_key", `${LABELS.gemini} did not accept this key. Check that you copied the whole key.`, 400);
  if (!res.ok) throw errorForStatus(res.status, LABELS.gemini);
  const body = await readJson(res);
  const models = (Array.isArray(body?.models) ? body.models : [])
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent") && typeof m.name === "string")
    .map((m) => {
      const id = m.name.replace(/^models\//, "");
      return { id, label: typeof m.displayName === "string" && m.displayName ? m.displayName : id };
    });
  return { models, recommended: pickRecommended("gemini", models) };
}

async function geminiComplete({ key, model, system, user, json }) {
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };
  const res = await call(`${BASES.gemini}/models/${model}:generateContent`, { method: "POST", headers: geminiHeaders(key), body: JSON.stringify(payload) }, key, LABELS.gemini, COMPLETE_MS);
  if (res.status === 400) {
    // A 400 here is a bad request or a bad key; the verify step has already proved the key.
    throw new LlmError("provider_error", `${LABELS.gemini} rejected the request. Try another model.`, 400);
  }
  if (!res.ok) throw errorForStatus(res.status, LABELS.gemini);
  const body = await readJson(res);
  if (body?.promptFeedback?.blockReason || !Array.isArray(body?.candidates) || body.candidates.length === 0) {
    throw new LlmError("refused", `${LABELS.gemini} declined to answer this request.`);
  }
  const parts = body.candidates[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("") : "";
  if (!text) throw new LlmError("bad_response", "The AI sent back an empty answer. Try again.");
  return text;
}

// ---- OpenAI-compatible (openai, groq, openrouter) --------------------------

const bearer = (key) => ({ authorization: `Bearer ${key}`, "content-type": "application/json" });

async function compatVerify(provider, key) {
  const label = LABELS[provider];
  const base = BASES[provider];
  if (provider === "openrouter") {
    // /models is public there, so only /key proves the key works.
    const k = await call(`${base}/key`, { method: "GET", headers: bearer(key) }, key, label, VERIFY_MS);
    if (!k.ok) throw errorForStatus(k.status, label);
  }
  const res = await call(`${base}/models`, { method: "GET", headers: bearer(key) }, key, label, VERIFY_MS);
  if (!res.ok) throw errorForStatus(res.status, label);
  const body = await readJson(res);
  let models = (Array.isArray(body?.data) ? body.data : [])
    .filter((m) => typeof m?.id === "string")
    .map((m) => ({ id: m.id, label: m.id }));
  if (provider === "openai") models = models.filter((m) => !NON_CHAT.test(m.id));
  return { models, recommended: pickRecommended(provider, models) };
}

async function compatComplete(provider, { key, model, system, user, json }) {
  const label = LABELS[provider];
  const send = (withFormat) =>
    call(
      `${BASES[provider]}/chat/completions`,
      {
        method: "POST",
        headers: bearer(key),
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          ...(withFormat ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      key,
      label,
      COMPLETE_MS,
    );
  let res = await send(json);
  // Not every model supports response_format; retry once without it.
  if (res.status === 400 && json) res = await send(false);
  if (!res.ok) throw errorForStatus(res.status, label);
  const body = await readJson(res);
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "content_filter") throw new LlmError("refused", `${label} declined to answer this request.`);
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text) throw new LlmError("bad_response", "The AI sent back an empty answer. Try again.");
  return text;
}

// ---- Anthropic (official SDK) ----------------------------------------------

const anthropicClient = (key) => new Anthropic({ apiKey: key, maxRetries: 1, timeout: COMPLETE_MS });

function mapAnthropicError(e, key) {
  if (e instanceof LlmError) return e;
  const label = LABELS.anthropic;
  void scrub(e?.message, key);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new LlmError("invalid_key", `${label} did not accept this key. Check that you copied the whole key.`, e.status);
  }
  if (e instanceof Anthropic.NotFoundError) return errorForStatus(404, label);
  if (e instanceof Anthropic.RateLimitError) return errorForStatus(429, label);
  if (e instanceof Anthropic.APIConnectionError) return new LlmError("network", `Could not reach ${label}. Check your connection and try again.`);
  if (e instanceof Anthropic.APIError) return errorForStatus(e.status ?? 500, label);
  return new LlmError("provider_error", `${label} could not process the request.`);
}

async function anthropicVerify(key) {
  try {
    const models = [];
    for await (const m of anthropicClient(key).models.list({ limit: 100 })) {
      models.push({ id: m.id, label: m.display_name || m.id });
      if (models.length >= 100) break;
    }
    const recommended = models.find((m) => m.id === "claude-opus-5-5")?.id ?? models[0]?.id ?? null;
    return { models, recommended };
  } catch (e) {
    throw mapAnthropicError(e, key);
  }
}

async function anthropicComplete({ key, model, system, user }) {
  try {
    const res = await anthropicClient(key).messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new LlmError("refused", `${LABELS.anthropic} declined to answer this request.`);
    if (res.stop_reason === "max_tokens") throw new LlmError("bad_response", "The answer was cut off before it finished. Try again with a shorter input.");
    const text = (Array.isArray(res.content) ? res.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    if (!text) throw new LlmError("bad_response", "The AI sent back an empty answer. Try again.");
    return text;
  } catch (e) {
    throw mapAnthropicError(e, key);
  }
}

// ---- Public API ------------------------------------------------------------

/** Prove a key works with a live call and list the models it can use. */
export async function verifyKey({ provider, key }) {
  assertAllowed(provider);
  if (provider === "mock") return mockVerifyKey({ key });
  assertKey(key);
  if (provider === "gemini") return geminiVerify(key);
  if (provider === "anthropic") return anthropicVerify(key);
  return compatVerify(provider, key);
}

/** Run one completion and return the model's text. */
export async function complete({ provider, key, model, system, user, json = false }) {
  assertAllowed(provider);
  if (provider === "mock") return mockComplete({ system, user });
  assertKey(key);
  assertModel(model);
  if (provider === "gemini") return geminiComplete({ key, model, system, user, json });
  if (provider === "anthropic") return anthropicComplete({ key, model, system, user });
  return compatComplete(provider, { key, model, system, user, json });
}

// ─────────────────────────────────────────────────────────────────
// config/ai.js — Provider Offline / OpenAI / Ollama
// v8: Ollama ULTRA-RÁPIDO (qwen2.5:3b-instruct recomendado)
// ─────────────────────────────────────────────────────────────────
const http  = require("http");
const https = require("https");

const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 8 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

let openaiClient = null;
let fetchFn = (typeof fetch !== "undefined")
  ? fetch
  : (...args) => import("node-fetch").then((m) => m.default(...args));

const state = {
  provider:      (process.env.AI_PROVIDER || "offline").toLowerCase(),
  openaiKey:     process.env.OPENAI_API_KEY || "",
  openaiModel:   process.env.OPENAI_MODEL || "gpt-4o-mini",
  openaiEmbed:   process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  ollamaEnabled: String(process.env.OLLAMA_ENABLED || "false") === "true",
  ollamaUrl:     process.env.OLLAMA_URL || "http://localhost:11434",
  ollamaModel:   process.env.OLLAMA_MODEL || "qwen2.5:3b-instruct",
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || "60m",
  ollamaNumCtx:    parseInt(process.env.OLLAMA_NUM_CTX || "4096", 10),
  ollamaNumPredict:parseInt(process.env.OLLAMA_NUM_PREDICT || "800", 10),
  ollamaNumThread: parseInt(process.env.OLLAMA_NUM_THREAD || "0", 10) || undefined,
};

function ollamaOptions(extra = {}) {
  return {
    num_ctx:     state.ollamaNumCtx,
    num_predict: state.ollamaNumPredict,
    temperature: 0.2,
    top_p: 0.9,
    repeat_penalty: 1.1,
    stop: ["</s>", "<|im_end|>", "<|endoftext|>"],
    ...(state.ollamaNumThread ? { num_thread: state.ollamaNumThread } : {}),
    ...extra,
  };
}

function agentFor(url) { return url.startsWith("https") ? httpsAgent : httpAgent; }

function ensureOpenAI() {
  if (state.provider !== "openai") return null;
  if (!state.openaiKey) return null;
  if (openaiClient && openaiClient.__key === state.openaiKey) return openaiClient;
  try {
    const OpenAI = require("openai");
    openaiClient = new OpenAI({ apiKey: state.openaiKey });
    openaiClient.__key = state.openaiKey;
    return openaiClient;
  } catch (e) { console.warn("⚠️ openai SDK no instalado:", e.message); return null; }
}

function isEnabled() {
  if (state.provider === "openai") return !!ensureOpenAI();
  if (state.provider === "ollama") return state.ollamaEnabled === true;
  return false;
}

function getStatus() {
  return {
    provider: state.provider,
    enabled:  isEnabled(),
    openai:   { configured: !!state.openaiKey, model: state.openaiModel },
    ollama:   {
      enabled: state.ollamaEnabled, url: state.ollamaUrl, model: state.ollamaModel,
      keep_alive: state.ollamaKeepAlive, num_ctx: state.ollamaNumCtx,
      num_predict: state.ollamaNumPredict
    },
  };
}

function setConfig(patch = {}) {
  if (typeof patch.provider === "string") {
    const p = patch.provider.toLowerCase();
    if (["offline", "openai", "ollama"].includes(p)) state.provider = p;
  }
  if (typeof patch.openaiKey === "string")      state.openaiKey = patch.openaiKey;
  if (typeof patch.openaiModel === "string")    state.openaiModel = patch.openaiModel;
  if (typeof patch.ollamaEnabled === "boolean") state.ollamaEnabled = patch.ollamaEnabled;
  if (typeof patch.ollamaModel === "string" && patch.ollamaModel) state.ollamaModel = patch.ollamaModel;
  // Warmup tras cambio
  setTimeout(() => warmup().catch(()=>{}), 200);
  return getStatus();
}

// ─── Warmup: mantiene el modelo cargado en VRAM/RAM
async function warmup() {
  if (state.provider !== "ollama" || !state.ollamaEnabled) return;
  try {
    const t0 = Date.now();
    await fetchFn(`${state.ollamaUrl}/api/generate`, {
      method: "POST",
      agent: agentFor(state.ollamaUrl),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.ollamaModel,
        prompt: "ok",
        stream: false,
        keep_alive: state.ollamaKeepAlive,
        options: { num_predict: 1, num_ctx: state.ollamaNumCtx },
      }),
    });
    console.log(`🔥 Ollama warmup OK (${Date.now()-t0}ms) modelo=${state.ollamaModel}`);
  } catch (e) { console.warn("⚠️ Ollama warmup falló:", e.message); }
}

// ─── Chat (no streaming) — usa /api/chat
async function chat(messages, opts = {}) {
  if (state.provider === "openai") {
    const cli = ensureOpenAI();
    if (!cli) return null;
    try {
      const r = await cli.chat.completions.create({
        model: state.openaiModel,
        temperature: opts.temperature ?? 0.2,
        messages,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      });
      return r.choices?.[0]?.message?.content ?? null;
    } catch (err) { console.warn("⚠️ OpenAI falló:", err.message); return null; }
  }

  if (state.provider === "ollama" && state.ollamaEnabled) {
    try {
      const body = {
        model: state.ollamaModel,
        messages,
        stream: false,
        keep_alive: state.ollamaKeepAlive,
        options: ollamaOptions(opts.json ? { temperature: 0 } : {}),
      };
      if (opts.json) body.format = "json";

      const res = await fetchFn(`${state.ollamaUrl}/api/chat`, {
        method: "POST",
        agent: agentFor(state.ollamaUrl),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.message?.content || data?.response || null;
    } catch (err) { console.warn("⚠️ Ollama error:", err.message); return null; }
  }
  return null;
}

// ─── Chat streaming (SSE upstream)
async function chatStream(messages, onToken) {
  if (state.provider !== "ollama" || !state.ollamaEnabled) {
    throw new Error("STREAM_UNAVAILABLE");
  }
  const res = await fetchFn(`${state.ollamaUrl}/api/chat`, {
    method: "POST",
    agent: agentFor(state.ollamaUrl),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: state.ollamaModel,
      messages,
      stream: true,
      keep_alive: state.ollamaKeepAlive,
      options: ollamaOptions(),
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const tok = json?.message?.content ?? json?.response;
        if (tok) onToken(tok);
      } catch (_) {}
    }
  }
}

async function embed(text) {
  if (state.provider !== "openai") return null;
  const cli = ensureOpenAI();
  if (!cli) return null;
  try {
    const r = await cli.embeddings.create({ model: state.openaiEmbed, input: text });
    return r.data?.[0]?.embedding ?? null;
  } catch (err) { console.warn("⚠️ embeddings falló:", err.message); return null; }
}

// ─── AUTO-DETECT Ollama on startup
async function autodetectOllama(){
  try {
    const res = await fetchFn(`${state.ollamaUrl}/api/tags`, { agent: agentFor(state.ollamaUrl) });
    if (res.ok){
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      if (models.length){
        // Si el modelo configurado no existe, usa el primero disponible
        if (!models.some(m => m.startsWith(state.ollamaModel.split(":")[0]))){
          console.log(`⚠️ Modelo "${state.ollamaModel}" no instalado en Ollama. Usando "${models[0]}".`);
          state.ollamaModel = models[0];
        }
        if (state.provider !== "ollama") state.provider = "ollama";
        state.ollamaEnabled = true;
        console.log(`✅ Ollama detectado en ${state.ollamaUrl} · modelo activo: ${state.ollamaModel}`);
        return true;
      }
      console.log(`⚠️ Ollama responde pero sin modelos. Ejecuta:  ollama pull ${state.ollamaModel}`);
    }
  } catch(e){
    console.log(`ℹ️ Ollama no disponible en ${state.ollamaUrl} → modo OFFLINE (engine.v2 determinista). Inicia Ollama para activar IA.`);
    state.ollamaEnabled = false;
  }
  return false;
}

// Auto-detect + warmup
setTimeout(async () => {
  await autodetectOllama();
  warmup().catch(()=>{});
}, 500);
// Re-check cada 60s (por si el usuario inicia Ollama después)
setInterval(async () => { await autodetectOllama(); warmup().catch(()=>{}); }, 60 * 1000);

module.exports = {
  enabled: isEnabled,
  chat, chatStream, embed,
  getStatus, setConfig, warmup, autodetectOllama,
  get MODEL() { return state.openaiModel; },
};

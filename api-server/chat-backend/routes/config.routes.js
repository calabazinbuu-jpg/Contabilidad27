// Toggle de proveedor IA en runtime (sin reiniciar).
// GET  /api/config/ai             → estado actual
// POST /api/config/ai             → { provider, ollamaEnabled, ollamaUrl, ollamaModel, openaiKey, openaiModel }
const router = require("express").Router();
const ai = require("../config/ai");

router.get("/ai", (_req, res) => {
  res.json({ ok: true, ...ai.getStatus() });
});

router.post("/ai", (req, res) => {
  try {
    const status = ai.setConfig(req.body || {});
    res.json({ ok: true, ...status });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;

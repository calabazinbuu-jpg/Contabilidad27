const router = require("express").Router();
const c = require("../controllers/chat.controller");
const { authRequired } = require("../middleware/auth");

// ─────────────────────────────────────────────
// 🔓 Público
// ─────────────────────────────────────────────
router.post("/guest", c.chatGuest);

// ─────────────────────────────────────────────
// 🔥 STREAMING (CHAT EN VIVO)
// ─────────────────────────────────────────────
// Puedes dejarlo público si quieres UX tipo ChatGPT sin login
router.post("/stream", authRequired, c.chatStream);

// ─────────────────────────────────────────────
// 🔐 PROTEGIDO (ERP / SISTEMA EMPRESARIAL)
// ─────────────────────────────────────────────
router.post("/", authRequired, c.chat);

router.get("/sesiones", authRequired, c.listarSesiones);

router.get("/sesiones/:id", authRequired, c.historial);

router.get("/monitor", authRequired, c.monitoreo);

router.post("/ingest", authRequired, c.ingestar);

module.exports = router;

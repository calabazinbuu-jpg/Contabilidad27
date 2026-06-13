const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "dev-secret";

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "8h" });
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "no token" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: "token inválido" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false });
    if (!roles.some((r) => (req.user.roles || []).includes(r)))
      return res.status(403).json({ ok: false, error: "sin permiso" });
    next();
  };
}

module.exports = { sign, authRequired, requireRole };

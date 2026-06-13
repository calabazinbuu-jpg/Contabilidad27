const router = require("express").Router();
router.post("/login", require("../controllers/auth.controller").login);
module.exports = router;

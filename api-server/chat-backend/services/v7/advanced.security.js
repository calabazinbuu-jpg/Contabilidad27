"use strict";
/**
 * v7 - Advanced Security
 * Field-level RBAC, encryption at rest (AES-256-GCM), audit con hash chaining.
 */
const crypto = require("crypto");

function createFieldSecurity({ acl }) {
  if (!acl) throw new Error("field.security: acl required");
  return {
    filter(user, row, fieldMap = {}) {
      const out = {};
      for (const [field, sensitiveAs] of Object.entries(fieldMap)) {
        if (acl.can(user, "read", { field: sensitiveAs })) out[field] = row[field];
      }
      return out;
    },
  };
}

function createCrypto({ key }) {
  if (!key || Buffer.byteLength(key) < 32) throw new Error("crypto: 32-byte key required");
  const keyBuf = Buffer.alloc(32); Buffer.from(key).copy(keyBuf);
  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }
  function decrypt(b64) {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
  return { encrypt, decrypt };
}

function createTamperProofLog() {
  const chain = [];
  function hash(prev, entry) {
    return crypto.createHash("sha256").update(prev + JSON.stringify(entry)).digest("hex");
  }
  function append(entry) {
    const prev = chain.length ? chain[chain.length - 1].hash : "GENESIS";
    const node = { entry, prevHash: prev, at: Date.now() };
    node.hash = hash(prev, { entry: node.entry, prevHash: node.prevHash, at: node.at });
    chain.push(node);
    return node;
  }
  function verify() {
    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      const prev = i === 0 ? "GENESIS" : chain[i - 1].hash;
      if (node.prevHash !== prev) return { ok: false, brokenAt: i };
      const recomputed = hash(prev, { entry: node.entry, prevHash: node.prevHash, at: node.at });
      if (recomputed !== node.hash) return { ok: false, brokenAt: i };
    }
    return { ok: true, length: chain.length };
  }
  return { append, verify, chain };
}

module.exports = { createFieldSecurity, createCrypto, createTamperProofLog };

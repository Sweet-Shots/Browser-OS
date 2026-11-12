/* =====================================================================
   CORE 4: CRYPTO (optional password)
   PBKDF2-SHA-256 (600,000 iterations, 16-byte random salt) -> AES-GCM-256.
   A fresh random 12-byte IV is used for every encryption.
   The derived CryptoKey is non-extractable and lives only in memory.
   ===================================================================== */
(function () {
  'use strict';
  var U = OS.util;
  var ITERATIONS = 600000;

  var subtle = (window.crypto && window.crypto.subtle) || null;
  var available = !!(subtle && window.crypto.getRandomValues && window.isSecureContext !== false);
  var unavailableReason = available ? '' :
    'Your browser does not provide the Web Crypto API on this page' +
    (window.isSecureContext === false ? ' (the page is not treated as a secure context)' : '') +
    ', so password protection is disabled. Your data is stored unencrypted.';

  var current = null; // { key: CryptoKey, salt: Uint8Array, iterations }

  function rand(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  async function deriveKey(password, salt, iterations) {
    var base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptWith(keyInfo, obj, fileId) {
    var iv = rand(12);
    var plain = new TextEncoder().encode(JSON.stringify(obj));
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, keyInfo.key, plain));
    return {
      version: OS.storage.SCHEMA_VERSION, fileId: fileId, encrypted: true,
      salt: U.bytesToB64(keyInfo.salt), iv: U.bytesToB64(iv), iterations: keyInfo.iterations,
      ciphertext: U.bytesToB64(ct)
    };
  }

  async function decryptWith(key, env) {
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: U.b64ToBytes(env.iv) }, key, U.b64ToBytes(env.ciphertext));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  OS.crypto = {
    ITERATIONS: ITERATIONS,
    available: available,
    unavailableReason: unavailableReason,
    isEnabled: function () { return !!current; },

    /** Set or change the password (derives a new key with a new salt). */
    setPassword: async function (password) {
      if (!available) throw new Error(unavailableReason);
      var salt = rand(16);
      current = { key: await deriveKey(password, salt, ITERATIONS), salt: salt, iterations: ITERATIONS };
    },
    removePassword: function () { current = null; },
    /** Forget the key (used by Lock now). */
    forgetKey: function () { current = null; },

    /** Check a password against the in-memory key without exposing it. */
    verify: async function (password) {
      if (!current) return false;
      var k = await deriveKey(password, current.salt, current.iterations);
      var probe = await encryptWith(current, { probe: 1 }, '');
      try { await decryptWith(k, probe); return true; } catch (e) { return false; }
    },

    /** Encrypt the whole state into an envelope (the only thing stored when a password is set). */
    encryptState: function (state) {
      if (!current) throw new Error('No password set');
      return encryptWith(current, state, state.fileId);
    },

    /**
     * Decrypt an envelope with a password. On success the derived key becomes the active key.
     * Throws { wrongPassword: true } if AES-GCM authentication fails.
     */
    unlock: async function (env, password, opts) {
      if (!available) throw new Error(unavailableReason);
      var salt = U.b64ToBytes(env.salt), it = env.iterations || ITERATIONS;
      var key = await deriveKey(password, salt, it);
      var data;
      try { data = await decryptWith(key, env); }
      catch (e) { var err = new Error('Wrong password'); err.wrongPassword = true; throw err; }
      if (!opts || !opts.dontActivate) current = { key: key, salt: salt, iterations: it };
      return data;
    },

    /** Decrypt using the active key if the salt matches (used for backups). */
    tryActiveKey: async function (env) {
      if (!current || U.bytesToB64(current.salt) !== env.salt) return null;
      try { return await decryptWith(current.key, env); } catch (e) { return null; }
    }
  };
})();

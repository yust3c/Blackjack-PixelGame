// Save data: versioning, upgrades between game versions, and export/import to a file.
// Loaded before every other game script, so saves are upgraded before anything reads them.
(function (root) {
  'use strict';

  // Bump CURRENT and add a step to MIGRATIONS whenever a new game version changes the
  // shape of a save. Steps upgrade old data in place and never throw it away.
  const CURRENT = 3;
  const META_KEY = 'blackjack-meta';
  const KEYS = { progress: 'blackjack-save-v1', achievements: 'blackjack-achievements-v1', cosmetics: 'blackjack-cosmetics-v1', settings: 'blackjack-settings-v1', dealertalk: 'blackjack-dealertalk-v1' };
  const MIGRATIONS = {
    // 0 -> 1: saves from before versioning already have the v1 shape, so nothing to change.
    1: (data) => data,
    // 1 -> 2: Continue was added; the progress save gets a place for runs in progress.
    2: (data) => {
      if (isObj(data.progress) && !isObj(data.progress.runs)) data.progress.runs = {};
      return data;
    },
    // 2 -> 3: sound was added; settings get their own save part with the default volumes.
    3: (data) => {
      if (!isObj(data.settings)) data.settings = { master: 0.8, music: 0.6, sfx: 0.8, muted: false, setSounds: true };
      return data;
    },
  };

  const storage = (() => { try { const s = root.localStorage; s.getItem(META_KEY); return s; } catch (e) { return null; } })();
  const readJSON = (key) => {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    try { return JSON.parse(raw); } catch (e) {
      // Keep a copy of anything unreadable instead of letting the game overwrite it.
      storage.setItem(`${key}-unreadable`, raw);
      return undefined;
    }
  };
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function readAll() {
    const data = {};
    for (const [part, key] of Object.entries(KEYS)) { const v = readJSON(key); if (v !== undefined) data[part] = v; }
    return data;
  }
  function writeAll(data) {
    for (const [part, key] of Object.entries(KEYS)) {
      if (data[part] !== undefined) storage.setItem(key, JSON.stringify(data[part]));
    }
    storage.setItem(META_KEY, JSON.stringify({ version: CURRENT }));
  }
  function upgrade(data, from) {
    for (let v = from + 1; v <= CURRENT; v++) if (MIGRATIONS[v]) data = MIGRATIONS[v](data) || data;
    return data;
  }

  // Run on load: upgrade whatever an older version of the game left behind.
  if (storage) {
    try {
      const meta = readJSON(META_KEY);
      const from = isObj(meta) && Number.isInteger(meta.version) ? meta.version : 0;
      if (from < CURRENT) writeAll(upgrade(readAll(), from));
    } catch (e) { /* storage full or blocked: play on with what is there */ }
  }

  // ---------- save file encoding ----------
  // Exported saves are scrambled and signed so a hand-edited file is refused on import.
  // The key lives in this file, so this stops casual editing, not a determined cheater
  // (no offline browser game can fully prevent that).
  const FILE_TAG = 'BJSAVE1';
  const SECRET = 'Old Tito keeps the shoe honest // 6d-S17-3:2 // 7f3a91c2e04b';
  // Four independent 32-bit FNV-1a style hashes = a 128-bit signature.
  function sign(text) {
    const str = SECRET + '|' + text + '|' + SECRET;
    let out = '';
    for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
      let h = seed >>> 0;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; h ^= h >>> 13; }
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
      out += h.toString(16).padStart(8, '0');
    }
    return out;
  }
  function scramble(bytes) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ SECRET.charCodeAt(i % SECRET.length) ^ ((i * 131) & 0xff);
    return out;
  }
  const toB64 = (bytes) => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  function encodeFile(obj) {
    const json = JSON.stringify(obj);
    const body = toB64(scramble(new TextEncoder().encode(json)));
    return `${FILE_TAG}.${body}.${sign(body)}`;
  }
  // Returns { file } or { error }.
  function decodeFile(text) {
    const parts = String(text).trim().split('.');
    if (parts.length !== 3 || parts[0] !== FILE_TAG) {
      return { error: String(text).trim().startsWith('{') ? 'This save file was modified or is from an old format, so it cannot be loaded.' : 'That file is not a Blackjack save.' };
    }
    const [, body, sig] = parts;
    if (sign(body) !== sig) return { error: 'This save file was modified, so it cannot be loaded.' };
    try { return { file: JSON.parse(new TextDecoder().decode(scramble(fromB64(body)))) }; }
    catch (e) { return { error: 'This save file is damaged.' }; }
  }

  function exportSave() {
    const file = { game: 'blackjack-pixelgame', version: CURRENT, exported: new Date().toISOString(), data: storage ? readAll() : {} };
    const blob = new Blob([encodeFile(file)], { type: 'application/octet-stream' });
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blackjack-save-${file.exported.slice(0, 10)}.bjsave`;
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Checks a save file and returns { ok, error }. On success the save replaces the current one.
  function importSave(text) {
    if (!storage) return { ok: false, error: 'This browser is not letting the game store progress.' };
    const decoded = decodeFile(text);
    if (decoded.error) return { ok: false, error: decoded.error };
    const file = decoded.file;
    if (!isObj(file) || file.game !== 'blackjack-pixelgame' || !isObj(file.data)) return { ok: false, error: 'That file is not a Blackjack save.' };
    if (!Number.isInteger(file.version) || file.version < 0) return { ok: false, error: 'The save file is missing its version.' };
    if (file.version > CURRENT) return { ok: false, error: 'This save comes from a newer version of the game. Update the game first.' };
    const d = file.data;
    if (d.progress !== undefined && !(isObj(d.progress) && isObj(d.progress.challengeWins || {}) && isObj(d.progress.endless || {}))) return { ok: false, error: 'The progress in this save is damaged.' };
    if (d.achievements !== undefined && !(isObj(d.achievements) && isObj(d.achievements.unlocked || {}) && isObj(d.achievements.stats || {}))) return { ok: false, error: 'The achievements in this save are damaged.' };
    if (d.cosmetics !== undefined && !(isObj(d.cosmetics) && isObj(d.cosmetics.equipped || {}))) return { ok: false, error: 'The cosmetics in this save are damaged.' };
    try {
      // Keep the current save as a backup, then clear and write the imported one.
      const before = JSON.stringify(readAll());
      storage.setItem('blackjack-backup-before-import', before);
      // Sound settings belong to this computer: an older save without them keeps the current ones.
      for (const [part, key] of Object.entries(KEYS)) if (part !== 'settings' || d.settings !== undefined) storage.removeItem(key);
      writeAll(upgrade(d, file.version));
    } catch (e) { return { ok: false, error: 'Could not store the save (browser storage is full or blocked).' }; }
    return { ok: true };
  }

  root.SaveData = { CURRENT, KEYS, exportSave, importSave, encodeFile, decodeFile, available: !!storage };
})(typeof window !== 'undefined' ? window : globalThis);

// Save data: versioning, upgrades between game versions, and export/import to a file.
// Loaded before every other game script, so saves are upgraded before anything reads them.
(function (root) {
  'use strict';

  // Bump CURRENT and add a step to MIGRATIONS whenever a new game version changes the
  // shape of a save. Steps upgrade old data in place and never throw it away.
  const CURRENT = 1;
  const META_KEY = 'blackjack-meta';
  const KEYS = { progress: 'blackjack-save-v1', achievements: 'blackjack-achievements-v1', cosmetics: 'blackjack-cosmetics-v1' };
  const MIGRATIONS = {
    // 0 -> 1: saves from before versioning already have the v1 shape, so nothing to change.
    1: (data) => data,
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

  function exportSave() {
    const file = { game: 'blackjack-pixelgame', version: CURRENT, exported: new Date().toISOString(), data: storage ? readAll() : {} };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blackjack-save-${file.exported.slice(0, 10)}.json`;
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Checks a save file and returns { ok, error }. On success the save replaces the current one.
  function importSave(text) {
    if (!storage) return { ok: false, error: 'This browser is not letting the game store progress.' };
    let file;
    try { file = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not a save file.' }; }
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
      for (const key of Object.values(KEYS)) storage.removeItem(key);
      writeAll(upgrade(d, file.version));
    } catch (e) { return { ok: false, error: 'Could not store the save (browser storage is full or blocked).' }; }
    return { ok: true };
  }

  root.SaveData = { CURRENT, KEYS, exportSave, importSave, available: !!storage };
})(typeof window !== 'undefined' ? window : globalThis);

// Browser persistence for the Board Atlas (schema 2) plus JSON import/export.
// v1 stored positions in a different frame, so only its notes are migrated.

export const STORAGE_KEY = 'milwaukee-48-59-1812-board-atlas-v2';
const LEGACY_KEY = 'milwaukee-48-59-1812-board-atlas-v1';
const UI_KEY = 'milwaukee-48-59-1812-board-atlas-ui';
export const BOARD = 'Milwaukee 48-59-1812 / PCB 860323007 Rev 0.6';

/** Designators renamed since the first atlas (see notes/VIEWER_REBUILD_HANDOFF.md). */
export const RENAMED = { U8: 'U3', F4: 'F2' };

const FIELDS = ['identity', 'measurements', 'role', 'observations', 'evidence'];
export const CONFIDENCE = ['unknown', 'probable', 'confirmed'];
export const RESULTS = ['continuity', 'resistance', 'open'];
const ID = /^[A-Za-z][A-Za-z0-9+\-]{0,15}$/;

export const emptyRecord = () => ({ identity: '', measurements: '', role: '', observations: '', evidence: '', confidence: 'unknown' });
export const emptyState = () => ({ schema: 2, board: BOARD, updated: null, notes: {}, overrides: {}, custom: [], readings: [] });

const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

function cleanRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const out = emptyRecord();
  for (const f of FIELDS) out[f] = str(r[f]);
  out.confidence = CONFIDENCE.includes(r.confidence) ? r.confidence : 'unknown';
  return out;
}

const isBlank = r => FIELDS.every(f => !r[f].trim()) && r.confidence === 'unknown';

function cleanNotes(notes, rename) {
  const out = {};
  if (!notes || typeof notes !== 'object') return out;
  for (const [rawId, rec] of Object.entries(notes)) {
    const clean = cleanRecord(rec);
    if (!clean || isBlank(clean) || !ID.test(rawId)) continue;
    const id = (rename && RENAMED[rawId]) || rawId;
    if (!out[id]) out[id] = clean;
  }
  return out;
}

function cleanPoint(pt) {
  if (!pt || typeof pt !== 'object' || !ID.test(pt.ref || '')) return null;
  return { ref: pt.ref, pin: str(pt.pin, 12).trim() };
}

function normalise(raw) {
  const state = emptyState();
  state.updated = str(raw.updated, 40) || null;
  state.notes = cleanNotes(raw.notes, false);
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [id, pos] of Object.entries(raw.overrides)) {
      const x = num(pos?.x), y = num(pos?.y);
      if (ID.test(id) && x !== null && y !== null) state.overrides[id] = { x, y };
    }
  }
  if (Array.isArray(raw.custom)) {
    for (const c of raw.custom) {
      const x = num(c?.x), y = num(c?.y);
      if (ID.test(c?.id || '') && (c.side === 'top' || c.side === 'bottom') && x !== null && y !== null && !state.custom.some(k => k.id === c.id)) {
        state.custom.push({ id: c.id, side: c.side, x, y });
      }
    }
  }
  if (Array.isArray(raw.readings)) {
    for (const r of raw.readings) {
      const a = cleanPoint(r?.a), b = cleanPoint(r?.b);
      if (!a || !b || !RESULTS.includes(r.result)) continue;
      state.readings.push({ id: str(r.id, 40) || cryptoId(), a, b, result: r.result, value: str(r.value, 24), note: str(r.note, 400), at: str(r.at, 40) });
    }
  }
  return state;
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function cryptoId() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).slice(0, 36);
}

/** Load schema 2, or build it from v1 notes. Returns { state, migrated } where migrated counts v1 notes carried over. */
export function load() {
  const v2 = read(STORAGE_KEY);
  if (v2?.schema === 2) return { state: normalise(v2), migrated: 0 };
  const state = emptyState();
  const v1 = read(LEGACY_KEY);
  if (v1?.notes) {
    state.notes = cleanNotes(v1.notes, true);
    const migrated = Object.keys(state.notes).length;
    if (migrated) save(state);
    return { state, migrated };
  }
  return { state, migrated: 0 };
}

export function save(state) {
  state.updated = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportPayload(state) {
  return { ...state, schema: 2, board: BOARD, exported: new Date().toISOString() };
}

/**
 * Parse an import file. Schema 2 replaces everything; schema 1 contributes notes only
 * (its marker positions used the first atlas's frame). Throws with a readable message.
 */
export function parseImport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!raw || typeof raw !== 'object') throw new Error('The file does not contain a Board Atlas export.');
  if (raw.schema === 2) return { kind: 2, state: normalise(raw) };
  if (raw.schema === 1 && raw.notes && typeof raw.notes === 'object') return { kind: 1, notes: cleanNotes(raw.notes, true) };
  throw new Error('Unrecognised file. Expected a Board Atlas export (schema 1 or 2).');
}

export function loadUi() {
  const ui = read(UI_KEY);
  return {
    onboarded: ui?.onboarded === true,
    xrayAmount: typeof ui?.xrayAmount === 'number' ? Math.min(1, Math.max(0.1, ui.xrayAmount)) : 0.85,
    xrayLens: ui?.xrayLens !== false
  };
}

export function saveUi(ui) {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private mode: preferences are optional */ }
}

/** Group 'continuity' readings into nets (union-find). Names are neutral: NET-<first ref>-<pin>. */
export function computeNets(readings) {
  const parent = new Map();
  const key = p => `${p.ref}${p.pin ? `.${p.pin}` : ''}`;
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const add = k => { if (!parent.has(k)) parent.set(k, k); };
  for (const r of readings) {
    if (r.result !== 'continuity') continue;
    const a = key(r.a), b = key(r.b);
    add(a); add(b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(k);
  }
  const collator = new Intl.Collator(undefined, { numeric: true });
  return [...groups.values()]
    .map(members => members.sort(collator.compare))
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(members => ({ name: `NET-${members[0].replace('.', '-')}`, members, refs: [...new Set(members.map(m => m.split('.')[0]))] }));
}

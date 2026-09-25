// Board Atlas UI: reference index, component records, layers (X-ray, isolation, continuity), dialogs.
import layersIcon from 'lucide-static/icons/layers.svg?raw';
import imageIcon from 'lucide-static/icons/image.svg?raw';
import resetIcon from 'lucide-static/icons/rotate-ccw.svg?raw';
import searchIcon from 'lucide-static/icons/search.svg?raw';
import plusIcon from 'lucide-static/icons/plus.svg?raw';
import closeIcon from 'lucide-static/icons/x.svg?raw';
import downloadIcon from 'lucide-static/icons/download.svg?raw';
import uploadIcon from 'lucide-static/icons/upload.svg?raw';
import leftIcon from 'lucide-static/icons/chevron-left.svg?raw';
import rightIcon from 'lucide-static/icons/chevron-right.svg?raw';
import listIcon from 'lucide-static/icons/list.svg?raw';
import moveIcon from 'lucide-static/icons/move.svg?raw';
import helpIcon from 'lucide-static/icons/circle-help.svg?raw';
import xrayIcon from 'lucide-static/icons/scan-eye.svg?raw';
import shieldIcon from 'lucide-static/icons/shield-half.svg?raw';
import cableIcon from 'lucide-static/icons/cable.svg?raw';
import tagIcon from 'lucide-static/icons/tags.svg?raw';
import trashIcon from 'lucide-static/icons/trash-2.svg?raw';
import crosshairIcon from 'lucide-static/icons/crosshair.svg?raw';
import alertIcon from 'lucide-static/icons/triangle-alert.svg?raw';
import infoIcon from 'lucide-static/icons/info.svg?raw';
import { parts as seedParts, unplaced as seedUnplaced, photos, keyParts, kindLabel, halfExtent, footprintCentre, isolation } from './board-data.js';
import { createAtlas } from './scene.js';
import { zoneOfFootprint } from './geometry.js';
import * as store from './store.js';
import './style.css';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const collator = new Intl.Collator(undefined, { numeric: true });
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const narrow = () => innerWidth <= 600;   // phones: the inspector is a bottom sheet
const SIDE_NAME = { top: 'Component side', bottom: 'Solder side' };
const ZONE_TEXT = { primary: 'Primary side', secondary: 'Secondary side', barrier: 'On the isolation barrier', spans: 'Spans the barrier' };
const CONF_TEXT = { unknown: 'Unknown', probable: 'Probable', confirmed: 'Confirmed' };

// ---------- state ----------
const { state: data, migrated } = store.load();
const ui = store.loadUi();
let side = 'top';
let selected = null;
let mode = null;            // null | 'add' | 'relocate' | 'pick-a' | 'pick-b'
let pendingPoint = null;
let tab = 'record';
let photoIndex = 0;
let highlightNet = null;
const layers = { xray: false, zones: false, links: false };
const cards = { xray: true, zones: true };

const known = new Map();    // key -> { id, side, kind, p, unplaced, custom, legacy }
for (const p of seedParts) known.set(p.id, { id: p.id, side: p.side, kind: p.kind, p });
for (const u of seedUnplaced) known.set(u.id, { id: u.id, side: u.side, kind: 'smd', p: { ...u, kind: 'smd', w: 34, d: 18 }, unplaced: true });
for (const c of data.custom) if (!known.has(c.id)) known.set(c.id, { id: c.id, side: c.side, kind: 'smd-custom', p: { id: c.id, side: c.side, kind: 'smd-custom', x: c.x, y: c.y, w: 24, d: 24, custom: true }, custom: true });
for (const id of Object.keys(data.notes)) if (!known.has(id)) known.set(id, { id, side: 'bottom', kind: 'smd-custom', p: { id, side: 'bottom', kind: 'smd-custom', w: 24, d: 24, custom: true }, unplaced: true, legacy: true, custom: true });

const conf = id => data.notes[id]?.confidence || 'unknown';
const record = id => ({ ...store.emptyRecord(), ...(data.notes[id] || {}) });

// ---------- markup ----------
const LEGEND = `
            <span class="legend-title">Record confidence</span>
            <span class="legend-row"><span><i class="dot" data-conf="unknown"></i>Unknown</span><span><i class="dot" data-conf="probable"></i>Probable</span><span><i class="dot" data-conf="confirmed"></i>Confirmed</span></span>
            <span class="legend-sep"><i class="ring"></i>Small part: ring at its printed legend</span>
            <span><i class="ghost"></i>Removed during teardown</span>`;
document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="brand-text"><strong>Board Atlas</strong><small>Milwaukee 48-59-1812 &middot; PCB 860323007 Rev 0.6</small></div></div>
    <div class="segmented side-switch" role="group" aria-label="Board side">
      <button id="side-top" type="button" aria-pressed="true" title="Component side (F to flip)">Component<span class="wide-only"> side</span></button>
      <button id="side-bottom" type="button" aria-pressed="false" title="Solder side (F to flip)">Solder<span class="wide-only"> side</span></button>
    </div>
    <div class="top-actions">
      <button id="surface-toggle" class="icon-button" type="button" aria-pressed="true" title="Photo surface on/off (P)" aria-label="Photo surface">${layersIcon}</button>
      <button id="photo-button" class="icon-button" type="button" title="Evidence photographs" aria-label="Open evidence photographs">${imageIcon}</button>
      <button id="help-button" class="icon-button" type="button" title="Help and shortcuts (?)" aria-label="Help and shortcuts">${helpIcon}</button>
    </div>
  </header>
  <div class="workspace">
    <aside class="index-panel" id="index-panel" aria-label="Reference index">
      <div class="panel-heading"><span>Reference index</span><span class="count" id="ref-count"></span><button id="close-index" class="close-panel" type="button" aria-label="Close reference index">${closeIcon}</button></div>
      <div class="search-wrap"><span aria-hidden="true">${searchIcon}</span><input id="search" type="search" placeholder="Find a marking (e.g. R27)" autocomplete="off" spellcheck="false" aria-label="Find a board marking" /></div>
      <div class="index-tools">
        <button id="add-reference" type="button" aria-pressed="false">${plusIcon}<span>Add reference</span></button>
        <button id="label-toggle" type="button" aria-pressed="false" title="Show every marking on this side (L)">${tagIcon}<span>All labels</span></button>
      </div>
      <div class="index-scroll" id="index-list" role="list"></div>
      <div class="index-footer"><div class="legend-body inline">${LEGEND}</div><p class="estimate-note"><span class="status-dot"></span><span>Positions are estimated from photos, not measured.</span></p></div>
    </aside>
    <main class="scene-wrap" id="scene-wrap">
      <div id="scene"></div>
      <div class="scene-top">
        <button id="mobile-index" class="float-button index-button" type="button" aria-controls="index-panel">${listIcon}<span>Index</span></button>
        <div class="caption"><strong id="view-caption">Component side</strong><span>Photo-based reconstruction &middot; positions and heights are estimates</span></div>
        <div class="view-tools">
          <div class="segmented views" role="group" aria-label="Camera view">
            <button type="button" data-view="plan" title="Plan view (1)">Plan</button>
            <button type="button" data-view="three" title="Three-quarter view (2)" aria-pressed="true">3/4</button>
            <button type="button" data-view="edge" title="Edge-on view (3)">Edge</button>
          </div>
          <button id="reset-view" class="icon-button small" type="button" title="Reset camera (R)" aria-label="Reset camera">${resetIcon}</button>
        </div>
      </div>
      <div id="mode-banner" class="mode-banner" role="status" hidden><span id="mode-text"></span><button id="mode-cancel" type="button">Cancel</button></div>
      <div class="feature-cards">
        <section class="feature-card" id="xray-card" hidden aria-label="X-ray settings">
          <header><strong>${xrayIcon} X-ray</strong><button class="card-close" type="button" data-card="xray" aria-label="Hide X-ray settings">${closeIcon}</button></header>
          <p id="xray-text"></p>
          <label class="slider"><span>See-through</span><input id="xray-amount" type="range" min="10" max="100" step="5" /><output id="xray-value"></output></label>
          <label class="check"><input id="xray-lens" type="checkbox" /><span id="xray-lens-text"></span></label>
          <p class="card-note" id="xray-note"></p>
        </section>
        <section class="feature-card zone-card" id="zones-card" hidden aria-label="Isolation zones">
          <header><strong>${shieldIcon} Isolation zones <em class="tag">probable</em></strong><button class="card-close" type="button" data-card="zones" aria-label="Hide isolation legend">${closeIcon}</button></header>
          <ul class="zone-legend">
            <li><i class="swatch primary"></i><span><b>Primary side</b> AC input region <em>probable</em></span></li>
            <li><i class="swatch barrier"></i><span><b>Isolation barrier</b> hatched keep-out, traced <em>probable</em></span></li>
            <li><i class="swatch secondary"></i><span><b>Secondary side</b> low-voltage region <em>probable</em></span></li>
          </ul>
          <div class="zone-parts" id="zone-parts"></div>
          <p class="card-note" id="zone-note"></p>
        </section>
      </div>
      <div class="scene-bottom">
        <div class="legend" id="legend">
          <button id="legend-toggle" class="legend-toggle" type="button" aria-expanded="false" aria-controls="legend-body">${infoIcon}<span>Legend</span></button>
          <div class="legend-body" id="legend-body">
${LEGEND}
          </div>
        </div>
        <div class="layer-bar" role="toolbar" aria-label="Layers">
          <button type="button" data-layer="xray" aria-pressed="false" title="X-ray: see the other face through the board (X)">${xrayIcon}<span>X-ray</span></button>
          <button type="button" data-layer="zones" aria-pressed="false" title="Isolation zones (I)">${shieldIcon}<span>Isolation</span></button>
          <button type="button" data-layer="links" aria-pressed="false" title="Continuity log (C)">${cableIcon}<span>Continuity</span></button>
        </div>
      </div>
      <div class="onboarding" id="onboarding" role="dialog" aria-labelledby="onboard-title" hidden>
        <span class="eyebrow">Welcome</span>
        <h2 id="onboard-title">Explore the charger board</h2>
        <p>A 3D reconstruction of the Milwaukee 48-59-1812 charger PCB, built from rectified photographs. Positions and heights are estimates.</p>
        <ol>
          <li><b>${coarsePointer ? 'Drag' : 'Drag'}</b> to orbit, <b>${coarsePointer ? 'pinch' : 'scroll'}</b> to zoom${coarsePointer ? ', two fingers to pan' : ', right-drag to pan'}.</li>
          <li><b>${coarsePointer ? 'Tap' : 'Click'}</b> a part or search the index to open its record.</li>
          <li><b>Flip</b> to the solder side; try <b>X-ray</b> and <b>Isolation</b> below.</li>
        </ol>
        <button id="onboard-done" class="primary" type="button">Start exploring</button>
      </div>
      <div class="loading" id="loading" role="status" aria-live="polite">
        <div class="loading-card"><div class="loading-mark"><span></span><span></span><span></span></div>
          <strong id="loading-title">Loading board photographs</strong><span id="loading-text">Rectified component and solder sides</span>
          <div class="progress"><span id="loading-bar"></span></div>
          <button id="loading-dismiss" type="button" hidden>Continue without photos</button></div>
      </div>
    </main>
    <aside class="inspector" id="inspector" aria-label="Component record and continuity log">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="tabs" role="tablist" aria-label="Inspector">
        <button id="tab-record" role="tab" type="button" aria-selected="true" aria-controls="record-panel">Record</button>
        <button id="tab-links" role="tab" type="button" aria-selected="false" aria-controls="links-panel">Continuity<span class="tab-count" id="links-count"></span></button>
        <button id="close-inspector" class="close-panel" type="button" aria-label="Close panel">${closeIcon}</button>
      </div>
      <section id="record-panel" role="tabpanel" aria-labelledby="tab-record">
        <div class="inspector-head"><span class="eyebrow" id="selected-kind">Component record</span><h1 id="selected-title">Select a marking</h1></div>
        <div id="empty-state" class="empty-state"><div class="empty-glyph">${crosshairIcon}</div><p>Choose a part on the board or in the reference index to record what you find.</p><small>Fields start empty. Nothing is identified by guesswork.</small></div>
        <div id="record-body" hidden>
          <div class="record-meta" id="record-meta"></div>
          <div class="provenance" id="provenance"></div>
          <figure class="evidence" id="evidence" hidden>
            <div class="evidence-grid"><div><canvas id="crop-top" width="260" height="200"></canvas><figcaption>Component side</figcaption></div><div><canvas id="crop-bottom" width="260" height="200"></canvas><figcaption>Solder side</figcaption></div></div>
            <figcaption class="evidence-note">Rectified crops of 1-Photo-1.jpg and 3-Photo-3.jpg; tall parts are painted out of the component-side image.</figcaption>
          </figure>
          <div class="record-actions">
            <button id="relocate-reference" class="ghost-button" type="button">${moveIcon}<span>Relocate marker</span></button>
            <button id="reset-position" class="ghost-button" type="button" hidden>${resetIcon}<span>Reset position</span></button>
          </div>
          <form id="record-form" autocomplete="off">
            <label>Identification<input name="identity" type="text" placeholder="What is this part? (from its marking or datasheet)" maxlength="200" /></label>
            <label>Measurements<textarea name="measurements" rows="2" placeholder="Value, pins, units, meter and range (unpowered)"></textarea></label>
            <label>Role in circuit<textarea name="role" rows="2" placeholder="Only once traced or documented"></textarea></label>
            <label>Observations<textarea name="observations" rows="2" placeholder="Markings, polarity, orientation, condition"></textarea></label>
            <label>Evidence / source<input name="evidence" type="text" placeholder="Photo file, continuity reading, datasheet and revision" maxlength="300" /></label>
            <fieldset class="confidence" id="confidence"><legend>Confidence</legend>
              ${store.CONFIDENCE.map(c => `<label><input type="radio" name="confidence" value="${c}" /><span data-conf="${c}">${CONF_TEXT[c]}</span></label>`).join('')}
            </fieldset>
            <div class="form-foot"><span id="save-state">Saved in this browser</span><button id="remove-custom" type="button" hidden>${trashIcon}<span>Remove marker</span></button></div>
          </form>
        </div>
      </section>
      <section id="links-panel" role="tabpanel" aria-labelledby="tab-links" hidden>
        <div class="inspector-head"><span class="eyebrow">Continuity log</span><h1>Unpowered readings</h1></div>
        <p class="safety">${alertIcon}<span>Record continuity and resistance measured with the board unpowered and disconnected from mains. Readings build neutral net names (NET-ref-pin).</span></p>
        <form id="reading-form" autocomplete="off" novalidate>
          ${['a', 'b'].map(k => `<div class="endpoint"><span class="endpoint-tag">${k.toUpperCase()}</span>
            <input name="${k}Ref" list="ref-options" placeholder="Marking" aria-label="Point ${k.toUpperCase()} marking" maxlength="16" spellcheck="false" />
            <input name="${k}Pin" placeholder="Pin" aria-label="Point ${k.toUpperCase()} pin (optional)" maxlength="8" />
            <button type="button" class="pick-button" data-pick="${k}" title="Pick point ${k.toUpperCase()} on the board">${crosshairIcon}<span>Pick</span></button></div>`).join('')}
          <fieldset class="result"><legend>Result</legend>
            <label><input type="radio" name="result" value="continuity" checked /><span>Continuity</span></label>
            <label><input type="radio" name="result" value="resistance" /><span>Resistance</span></label>
            <label><input type="radio" name="result" value="open" /><span>Open</span></label>
          </fieldset>
          <label class="value-field" hidden>Value<input name="value" placeholder="e.g. 4.7k" maxlength="20" /></label>
          <label>Note<input name="note" placeholder="Meter, range, probe points" maxlength="200" /></label>
          <p class="form-error" id="reading-error" role="alert" hidden></p>
          <p class="barrier-warn" id="reading-warn" hidden></p>
          <button type="submit" class="primary wide">Log reading</button>
        </form>
        <datalist id="ref-options"></datalist>
        <h2 class="list-title">Nets <span id="net-count"></span></h2>
        <div id="net-list" class="net-list"></div>
        <h2 class="list-title">Readings <span id="reading-count"></span></h2>
        <div id="reading-list" class="reading-list"></div>
      </section>
      <div class="data-actions">
        <button id="export-notes" type="button">${downloadIcon}<span>Export records</span></button>
        <label class="import-button" tabindex="0">${uploadIcon}<span>Import records</span><input id="import-notes" type="file" accept="application/json,.json" hidden /></label>
      </div>
      <p class="storage-note" id="storage-note">Records save in this browser. Export them to keep with the project or move between computers.</p>
    </aside>
  </div>
  <dialog id="photo-dialog" class="photo-dialog" aria-labelledby="photo-title">
    <div class="photo-head"><div><span class="eyebrow">Source evidence &middot; <span id="photo-file"></span></span><strong id="photo-title"></strong></div><button id="photo-close" class="icon-button" type="button" aria-label="Close photograph">${closeIcon}</button></div>
    <div class="photo-stage"><img id="photo-image" alt="" /><span class="photo-loading" id="photo-loading">Loading photograph</span></div>
    <div class="photo-controls"><button id="photo-prev" type="button">${leftIcon}<span>Previous</span></button><span id="photo-position"></span><button id="photo-next" type="button"><span>Next</span>${rightIcon}</button></div>
  </dialog>
  <dialog id="add-dialog" class="add-dialog" aria-labelledby="add-title">
    <form method="dialog" id="add-form"><span class="eyebrow">New board marking</span><h2 id="add-title">Add reference</h2>
      <p>Use the exact designator printed on the PCB. Its position can be refined later with Relocate.</p>
      <label>Board marking<input id="new-designator" name="designator" required maxlength="16" placeholder="e.g. R58" autocomplete="off" spellcheck="false" /></label>
      <p class="form-error" id="add-error" role="alert" hidden></p>
      <div class="dialog-actions"><button value="cancel" type="submit" formnovalidate>Cancel</button><button value="add" type="submit" class="primary">Add marker</button></div></form>
  </dialog>
  <dialog id="confirm-dialog" class="add-dialog" aria-labelledby="confirm-title">
    <form method="dialog"><span class="eyebrow" id="confirm-eyebrow">Please confirm</span><h2 id="confirm-title"></h2><p id="confirm-text"></p>
      <div class="dialog-actions"><button value="cancel" type="submit">Cancel</button><button value="ok" type="submit" class="primary" id="confirm-ok">Continue</button></div></form>
  </dialog>
  <dialog id="help-dialog" class="help-dialog" aria-labelledby="help-title">
    <div class="photo-head"><div><span class="eyebrow">Board Atlas</span><strong id="help-title">How to read this model</strong></div><button class="icon-button" type="button" data-close aria-label="Close help">${closeIcon}</button></div>
    <div class="help-body">
      <p>The board outline, cut-outs and both surfaces come from two perspective-corrected photographs. Part positions were placed on those photos; heights and shapes are estimated from oblique shots. Nothing here is a measured dimension, and no circuit function is filled in until evidence supports it.</p>
      <ul class="help-list">
        <li><b>Rings</b> mark small solder-side parts at their printed legend, within about 5-10 board units (roughly 0.5-1 mm at the assumed scale) of the part.</li>
        <li><b>X- prefix</b> (e.g. X-BRIDGE) names a part with no legible designator, by appearance.</li>
        <li><b>Isolation zones</b> are traced from the hatched keep-out printed on the solder side. The board is documented unpowered only.</li>
      </ul>
      <h3>Shortcuts</h3>
      <dl class="shortcuts"><dt>F</dt><dd>Flip board</dd><dt>1 2 3</dt><dd>Plan, 3/4, edge-on view</dd><dt>R</dt><dd>Reset camera</dd><dt>/</dt><dd>Search markings</dd><dt>L</dt><dd>All labels</dd><dt>X I C</dt><dd>X-ray, isolation, continuity</dd><dt>P</dt><dd>Photo surface</dd><dt>Esc</dt><dd>Cancel or close</dd></dl>
      <button id="help-tour" type="button" class="ghost-button">Show the welcome card again</button>
    </div>
  </dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

// ---------- 3D ----------
let atlas;
try {
  atlas = createAtlas({
    host: $('#scene'),
    onTap: handleTap,
    onHover: key => { if (key) highlightRow(key, true); else clearRowHover(); },
    onLabelTap: key => {
      if (mode?.startsWith('pick')) completePick(key);
      else if (layers.xray && ui.xrayLens && coarsePointer) atlas.lensTo(key);   // touch lens mode: taps move the lens
      else select(key, { fly: false });
    },
    onStatus: handleStatus
  });
} catch (err) {
  $('#loading-title').textContent = 'This browser cannot display the 3D model';
  $('#loading-text').textContent = 'WebGL is unavailable. The source photographs are still available from the image button.';
  $('.progress').hidden = true;
  throw err;
}
window.__atlas = atlas;

atlas.load(seedParts, conf, keyParts);
for (const [id, k] of known) {
  if (k.unplaced) atlas.addUnplaced(k.p);
  else if (k.custom) atlas.addCustom(k.p, conf(id));
}
for (const [id, pos] of Object.entries(data.overrides)) if (known.has(id)) atlas.move(id, pos.x, pos.y);
const zoneCache = new Map();
function zoneOf(id) {
  if (!isolation) return null;
  if (zoneCache.has(id)) return zoneCache.get(id);
  const e = atlas.entries.get(id);
  const z = !e || e.unplaced ? null : zoneOfFootprint(e.x, e.y, e.he[0], e.he[1], isolation);
  zoneCache.set(id, z);
  return z;
}

// ---------- status / loading ----------
function handleStatus(s) {
  if (s.type === 'progress') { $('#loading-bar').style.width = `${Math.round((s.loaded / s.total) * 100)}%`; return; }
  if (s.type === 'ready') { $('#loading').classList.add('done'); setTimeout(() => { $('#loading').hidden = true; }, 380); maybeOnboard(); return; }
  if (s.type === 'texture-error' || s.type === 'error') {
    $('#loading-title').textContent = 'Board photographs could not be loaded';
    $('#loading-text').textContent = 'The 3D model still works with plain surfaces. Photo evidence and X-ray are unavailable.';
    $('#loading').classList.add('failed');
    $('#loading-dismiss').hidden = false;
    photoAvailable = false;
    syncSurfaceUi();
  }
}
let photoAvailable = true;
$('#loading-dismiss').addEventListener('click', () => { $('#loading').hidden = true; maybeOnboard(); });

function maybeOnboard() {
  if (!ui.onboarded) { $('#onboarding').hidden = false; $('#onboard-done').focus({ preventScroll: true }); }
  if (migrated) toast(`Carried over ${migrated} record${migrated === 1 ? '' : 's'} from the first atlas. Marker positions start fresh.`);
}
$('#onboard-done').addEventListener('click', () => dismissOnboarding());

// ---------- toast ----------
let toastTimer;
function toast(text, tone = '') {
  const t = $('#toast');
  t.textContent = text; t.dataset.tone = tone; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------- confirm dialog (replaces window.confirm) ----------
function confirmAction(title, text, ok = 'Continue') {
  return new Promise(resolve => {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title; $('#confirm-text').textContent = text; $('#confirm-ok').textContent = ok;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}

// ---------- persistence ----------
function persist() {
  const ok = store.save(data);
  $('#save-state').textContent = ok ? 'Saved in this browser' : 'Not saved: browser storage is unavailable';
  $('#save-state').classList.toggle('warn', !ok);
}

// ---------- index ----------
function rowHtml(k, other = false) {
  const note = data.notes[k.id]?.identity || (k.legacy ? 'Record from the first atlas' : k.unplaced ? 'Not yet located' : k.custom ? 'Added marker' : kindLabel(k.kind));
  return `<button class="ref-row${k.id === selected ? ' selected' : ''}${other ? ' other-side' : ''}" data-key="${esc(k.id)}" type="button" role="listitem" tabindex="-1">
    <i class="dot" data-conf="${conf(k.id)}" aria-label="${CONF_TEXT[conf(k.id)]}"></i><span class="ref-id">${esc(k.id)}</span><span class="ref-note">${esc(note)}</span>${other ? `<span class="ref-side">${k.side === 'top' ? 'Comp.' : 'Solder'}</span>` : ''}<span class="ref-chevron" aria-hidden="true">&rsaquo;</span></button>`;
}

function renderIndex() {
  const q = $('#search').value.trim().toUpperCase();
  const match = k => !q || k.id.toUpperCase().includes(q) || (data.notes[k.id]?.identity || '').toUpperCase().includes(q);
  const all = [...known.values()].sort((a, b) => collator.compare(a.id, b.id));
  const here = all.filter(k => !k.unplaced && k.side === side && match(k));
  const there = q ? all.filter(k => !k.unplaced && k.side !== side && match(k)) : [];
  const loose = all.filter(k => k.unplaced && match(k));
  let html = here.map(k => rowHtml(k)).join('');
  if (!here.length) html += `<p class="no-results">${q ? `No markings on the ${SIDE_NAME[side].toLowerCase()} match &ldquo;${esc(q)}&rdquo;.` : 'No markings on this side.'}</p>`;
  if (there.length) html += `<p class="group-title">On the ${SIDE_NAME[side === 'top' ? 'bottom' : 'top'].toLowerCase()}</p>` + there.map(k => rowHtml(k, true)).join('');
  if (loose.length) html += `<p class="group-title">Not yet located</p>` + loose.map(k => rowHtml(k)).join('');
  $('#index-list').innerHTML = html;
  const total = all.filter(k => !k.unplaced && k.side === side).length;
  $('#ref-count').textContent = q ? `${here.length} of ${total}` : `${total} mapped`;
  syncRowTabStop();
}

// Roving tab stop: the list is one Tab stop (the selected row, else the first); arrow keys move inside it.
function syncRowTabStop() {
  const rows = document.querySelectorAll('#index-list .ref-row');
  const stop = $('#index-list .ref-row.selected') || rows[0];
  for (const r of rows) r.tabIndex = r === stop ? 0 : -1;
}

function updateRow(id) {
  const row = $(`#index-list .ref-row[data-key="${CSS.escape(id)}"]`);
  if (!row) return;
  const k = known.get(id);
  row.outerHTML = rowHtml(k, row.classList.contains('other-side'));
  syncRowTabStop();
}

let hoverRow = null;
function highlightRow(key) {
  clearRowHover();
  hoverRow = $(`#index-list .ref-row[data-key="${CSS.escape(key)}"]`);
  hoverRow?.classList.add('hovered');
}
function clearRowHover() { hoverRow?.classList.remove('hovered'); hoverRow = null; }

$('#index-list').addEventListener('click', e => {
  const row = e.target.closest('.ref-row');
  if (!row) return;
  const key = row.dataset.key;
  if (mode?.startsWith('pick')) { completePick(key); return; }
  select(key, { fly: true });
  if (innerWidth <= 800) $('#index-panel').classList.remove('open');
});
let listHover = null;
function hoverFromList(key) {
  if (key === listHover) return;
  listHover = key;
  atlas.hover(key);
}
$('#index-list').addEventListener('pointerover', e => { const row = e.target.closest('.ref-row'); if (row && !coarsePointer) hoverFromList(row.dataset.key); });
$('#index-list').addEventListener('pointerleave', () => hoverFromList(null));
$('#search').addEventListener('input', renderIndex);
$('#search').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const first = $('#index-list .ref-row'); if (first) first.click(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); $('#index-list .ref-row')?.focus(); }
});
$('#index-list').addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const rows = [...document.querySelectorAll('#index-list .ref-row')];
  const i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  (rows[i + (e.key === 'ArrowDown' ? 1 : -1)] || (e.key === 'ArrowUp' ? $('#search') : rows[i])).focus();
});

// ---------- selection & inspector ----------
function select(key, { fly = false } = {}) {
  const k = key && known.get(key);
  if (key && !k) return;
  if (k && !k.unplaced && k.side !== side) setSide(k.side);
  selected = key || null;
  atlas.select(selected, { fly });
  if (mode === 'relocate') setMode(null);
  renderInspector();
  for (const row of document.querySelectorAll('#index-list .ref-row.selected')) row.classList.remove('selected');
  $(`#index-list .ref-row[data-key="${CSS.escape(selected || '')}"]`)?.classList.add('selected');
  syncRowTabStop();
  if (selected) { setTab('record'); openSheet(); }
  else if (tab === 'record' && narrow()) closeSheet();
}

function renderInspector() {
  const k = selected && known.get(selected);
  $('#empty-state').hidden = !!k;
  $('#record-body').hidden = !k;
  $('#selected-title').textContent = k ? k.id : 'Select a marking';
  $('#selected-kind').textContent = k ? (k.legacy ? 'Record from the first atlas' : k.custom ? 'Added marker' : kindLabel(k.kind)) : 'Component record';
  if (!k) return;
  const e = atlas.entries.get(k.id);
  const zone = zoneOf(k.id);
  const chips = [`<span class="chip-meta">${SIDE_NAME[k.side]}</span>`];
  if (k.kind === 'removed') chips.push('<span class="chip-meta warn">Removed during teardown</span>');
  if (k.unplaced) chips.push('<span class="chip-meta warn">Position unknown</span>');
  else chips.push(`<span class="chip-meta">${data.overrides[k.id] ? 'Position corrected by you' : 'Position estimated'}</span>`);
  if (zone) chips.push(`<span class="chip-meta zone-${zone}" title="${esc(isolation.source)}">${ZONE_TEXT[zone]} &middot; probable</span>`);
  $('#record-meta').innerHTML = chips.join('');
  const prov = [];
  if (k.p.note) prov.push(esc(k.p.note));
  if (k.p.prov) prov.push(esc(k.p.prov));
  if (k.p.bridges) prov.push(esc(k.p.bridges));
  if (k.id.startsWith('X-')) prov.push('No legible designator; named by appearance.');
  if (k.side === 'bottom' && e && e.hotspot >= 0 && !k.custom) prov.push('The ring marks the printed legend; the part itself is within about 5-10 board units.');
  if (k.unplaced && !k.legacy) prov.push('Listed in the first atlas, but its legend was not found on the rectified photos. Use Place marker once located.');
  if (k.legacy) prov.push('This record came from the first atlas and has no marker yet. Use Place marker to position it.');
  $('#provenance').innerHTML = prov.map(t => `<p>${t}</p>`).join('');
  $('#provenance').hidden = !prov.length;
  $('#relocate-reference span').textContent = k.unplaced ? 'Place marker' : 'Relocate marker';
  $('#relocate-reference').classList.toggle('active', mode === 'relocate');
  $('#reset-position').hidden = !data.overrides[k.id] || !!k.custom;
  $('#remove-custom').hidden = !k.custom;
  const rec = record(k.id);
  const form = $('#record-form');
  for (const f of ['identity', 'measurements', 'role', 'observations', 'evidence']) form.elements[f].value = rec[f];
  form.querySelector(`input[name=confidence][value=${rec.confidence}]`).checked = true;
  drawEvidence(e, k);
}

function drawEvidence(e, k) {
  const fig = $('#evidence');
  if (!e || e.unplaced || !photoAvailable || !atlas.photoImage('top')) { fig.hidden = true; return; }
  fig.hidden = false;
  const half = Math.max(30, Math.min(260, Math.max(e.he[0], e.he[1]) * 1.5 + 22));
  for (const face of ['top', 'bottom']) {
    const canvas = $(`#crop-${face}`), c = canvas.getContext('2d');
    const img = atlas.photoImage(face);
    c.fillStyle = '#0b1111'; c.fillRect(0, 0, canvas.width, canvas.height);
    if (!img) continue;
    const s = img.naturalWidth / 1071;
    const aspect = canvas.width / canvas.height;
    const hw = half * aspect, hh = half;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, (e.x - hw) * s, (e.y - hh) * s, hw * 2 * s, hh * 2 * s, 0, 0, canvas.width, canvas.height);
    const k2 = canvas.width / (hw * 2);
    const bx = canvas.width / 2 - e.he[0] * k2, by = canvas.height / 2 - e.he[1] * k2;
    c.strokeStyle = 'rgba(255, 207, 110, .95)'; c.lineWidth = 2; c.setLineDash([5, 4]);
    c.strokeRect(bx, by, e.he[0] * 2 * k2, e.he[1] * 2 * k2);
    c.setLineDash([]);
  }
  fig.querySelector('.evidence-note').textContent = k.side === 'top'
    ? 'Rectified crops of 1-Photo-1.jpg (tall parts painted out) and 3-Photo-3.jpg. Dashed box: modelled footprint.'
    : 'Rectified crops of 1-Photo-1.jpg and 3-Photo-3.jpg (mirrored and registered to the top view). Dashed box: modelled footprint.';
}

$('#record-form').addEventListener('input', e => {
  if (!selected || !e.target.name) return;
  const rec = record(selected);
  rec[e.target.name] = e.target.value;
  data.notes[selected] = rec;
  if (e.target.name === 'confidence') atlas.setConfidence(selected, rec.confidence);
  persist();
  updateRow(selected);
});

$('#relocate-reference').addEventListener('click', () => setMode(mode === 'relocate' ? null : 'relocate'));
$('#reset-position').addEventListener('click', () => {
  if (!selected || !data.overrides[selected]) return;
  delete data.overrides[selected];
  const p = known.get(selected).p;
  const [x, y] = footprintCentre(p);
  atlas.move(selected, x, y); zoneCache.delete(selected);
  persist(); renderInspector(); refreshLinks();
  toast(`${selected} returned to its photo-estimated position.`);
});
$('#remove-custom').addEventListener('click', async () => {
  const k = known.get(selected);
  if (!k?.custom) return;
  const ok = await confirmAction(`Remove ${k.id}?`, 'The marker and its record are deleted from this browser. Continuity readings that use it stay in the log.', 'Remove marker');
  if (!ok) return;
  data.custom = data.custom.filter(c => c.id !== k.id);
  delete data.notes[k.id]; delete data.overrides[k.id];
  known.delete(k.id); atlas.removeEntry(k.id); zoneCache.delete(k.id);
  selected = null; persist(); renderIndex(); renderInspector(); refreshLinks(); closeSheet();
  toast(`${k.id} removed.`);
});

// ---------- tap handling & modes ----------
function dismissOnboarding() {
  if ($('#onboarding').hidden) return;
  $('#onboarding').hidden = true;
  ui.onboarded = true;
  store.saveUi(ui);
}

function handleTap(hit) {
  dismissOnboarding();
  if (mode === 'add' || mode === 'relocate') {
    if (!hit || !hit.onBoard) { toast('That point is off the board. Pick a point on the PCB.', 'warn'); return; }
    const pt = { x: Math.round(hit.x * 10) / 10, y: Math.round(hit.y * 10) / 10 };
    if (mode === 'add') { pendingPoint = { ...pt, side }; openAddDialog(); return; }
    placeSelected(pt);
    return;
  }
  if (mode === 'pick-a' || mode === 'pick-b') {
    if (hit?.key) completePick(hit.key); else toast('Pick a part or ring on the board.', 'warn');
    return;
  }
  // On touch screens a tap in X-ray lens mode only moves the lens (the scene already did); selecting would cover it.
  if (layers.xray && ui.xrayLens && coarsePointer) return;
  if (hit?.key) select(hit.key, { fly: false });
  else if (selected && !narrow()) select(null);
}

function placeSelected(pt) {
  const k = known.get(selected);
  if (!k) return;
  if (k.legacy || (k.custom && k.unplaced)) {
    k.unplaced = false; k.legacy = false; k.side = side; k.p = { ...k.p, side, x: pt.x, y: pt.y };
    data.custom.push({ id: k.id, side, x: pt.x, y: pt.y });
    atlas.removeEntry(k.id);
    atlas.addCustom(k.p, conf(k.id));
  } else {
    if (k.custom) { const c = data.custom.find(c => c.id === k.id); if (c) { c.x = pt.x; c.y = pt.y; } }
    else data.overrides[k.id] = pt;
    if (k.unplaced) { k.unplaced = false; k.side = side; k.p = { ...k.p, side }; atlas.entries.get(k.id).side = side; }
    atlas.move(k.id, pt.x, pt.y);
  }
  zoneCache.delete(k.id);
  setMode(null);
  persist();
  atlas.select(k.id);
  renderIndex(); renderInspector(); refreshLinks(); refreshRefOptions();
  openSheet();
  toast(`${k.id} placed. Saved in this browser.`);
}

const MODE_TEXT = {
  add: () => `${coarsePointer ? 'Tap' : 'Click'} the board where the new marking is printed.`,
  relocate: () => `${coarsePointer ? 'Tap' : 'Click'} the corrected position of ${selected}.`,
  'pick-a': () => `${coarsePointer ? 'Tap' : 'Click'} a part for point A.`,
  'pick-b': () => `${coarsePointer ? 'Tap' : 'Click'} a part for point B.`
};
function setMode(next) {
  mode = next;
  $('#mode-banner').hidden = !mode;
  if (mode) $('#mode-text').textContent = MODE_TEXT[mode]();
  $('#add-reference').setAttribute('aria-pressed', String(mode === 'add'));
  $('#relocate-reference').classList.toggle('active', mode === 'relocate');
  for (const b of document.querySelectorAll('.pick-button')) b.classList.toggle('active', mode === `pick-${b.dataset.pick}`);
  atlas.setCursor(mode ? 'crosshair' : null);
  if (mode && innerWidth <= 800) { if (narrow()) closeSheet(); $('#index-panel').classList.remove('open'); }
}
$('#mode-cancel').addEventListener('click', () => { const was = mode; setMode(null); if (was && was !== 'add' && narrow()) openSheet(); });
$('#add-reference').addEventListener('click', () => setMode(mode === 'add' ? null : 'add'));

function openAddDialog() {
  $('#new-designator').value = '';
  $('#add-error').hidden = true;
  $('#add-dialog').showModal();
  $('#new-designator').focus();
}
$('#add-form').addEventListener('submit', e => {
  if (e.submitter?.value !== 'add') { setMode(null); return; }
  e.preventDefault();
  const id = $('#new-designator').value.trim().toUpperCase();
  const err = !/^[A-Z][A-Z0-9+\-]{0,15}$/.test(id) ? 'Use a board marking such as R58 or NTC2 (letters first, no spaces).'
    : known.has(id) ? `${id} is already in the index. Select it and use Relocate instead.` : '';
  if (err) { $('#add-error').textContent = err; $('#add-error').hidden = false; return; }
  const p = { id, side: pendingPoint.side, x: pendingPoint.x, y: pendingPoint.y };
  data.custom.push(p);
  known.set(id, { id, side: p.side, kind: 'smd-custom', p: { ...p, kind: 'smd-custom', w: 24, d: 24, custom: true }, custom: true });
  atlas.addCustom(known.get(id).p, 'unknown');
  persist();
  $('#add-dialog').close();
  setMode(null);
  renderIndex(); refreshRefOptions();
  select(id);
  toast(`${id} added. Record what you find in the panel.`);
});
$('#new-designator').addEventListener('input', () => { $('#add-error').hidden = true; });

// ---------- sides, views, surface, labels ----------
let indexTimer = 0;
function setSide(next, animate = true) {
  if (next === side) return;
  side = next;
  atlas.setSide(side, animate);
  $('#side-top').setAttribute('aria-pressed', String(side === 'top'));
  $('#side-bottom').setAttribute('aria-pressed', String(side === 'bottom'));
  $('#view-caption').textContent = SIDE_NAME[side];
  if (selected) { const k = known.get(selected); if (k && !k.unplaced && k.side !== side) { selected = null; atlas.select(null); renderInspector(); if (tab === 'record' && narrow()) closeSheet(); } }
  // Rebuilding ~170 index rows makes the browser re-raster the list; do it once the board has landed so the flip stays smooth.
  clearTimeout(indexTimer);
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) { $('#index-list').classList.add('stale'); indexTimer = setTimeout(() => { renderIndex(); $('#index-list').classList.remove('stale'); }, 1120); }
  else renderIndex();
  syncXrayText();
  refreshLinks();
}
$('#side-top').addEventListener('click', () => setSide('top'));
$('#side-bottom').addEventListener('click', () => setSide('bottom'));

function setView(view) {
  atlas.setView(view);
  for (const b of document.querySelectorAll('.views button')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
}
for (const b of document.querySelectorAll('.views button')) b.addEventListener('click', () => setView(b.dataset.view));
$('#reset-view').addEventListener('click', () => setView('three'));

let surfaceOn = true;
function syncSurfaceUi() {
  $('#surface-toggle').setAttribute('aria-pressed', String(surfaceOn && photoAvailable));
  const xrayBtn = document.querySelector('[data-layer=xray]');
  xrayBtn.disabled = !surfaceOn || !photoAvailable;
  xrayBtn.title = xrayBtn.disabled ? 'X-ray needs the photo surface' : 'X-ray: see the other face through the board (X)';
  if (xrayBtn.disabled && layers.xray) toggleLayer('xray', false);
}
$('#surface-toggle').addEventListener('click', () => {
  if (!photoAvailable) { toast('Board photographs are unavailable in this session.', 'warn'); return; }
  surfaceOn = !surfaceOn;
  atlas.setPhotoSurface(surfaceOn);
  syncSurfaceUi();
  toast(surfaceOn ? 'Photo surface on.' : 'Photo surface off: plain board colours.');
});

let allLabels = false;
$('#label-toggle').addEventListener('click', () => {
  allLabels = !allLabels;
  atlas.setAllLabels(allLabels);
  $('#label-toggle').setAttribute('aria-pressed', String(allLabels));
});

// ---------- layers ----------
function toggleLayer(name, force) {
  const on = force ?? !layers[name];
  if (on === layers[name]) return;
  layers[name] = on;
  document.querySelector(`[data-layer=${name}]`).setAttribute('aria-pressed', String(on));
  if (name === 'xray') { cards.xray = true; atlas.setXray({ xray: on, lens: ui.xrayLens, xrayAmount: ui.xrayAmount }); syncXrayText(); }
  if (name === 'zones') { cards.zones = true; atlas.setZones(on); renderZoneCard(); }
  if (name === 'links') { refreshLinks(); if (on) { setTab('links'); openSheet(); } }
  syncCards();
}
for (const b of document.querySelectorAll('[data-layer]')) b.addEventListener('click', () => toggleLayer(b.dataset.layer));
for (const b of document.querySelectorAll('.card-close')) b.addEventListener('click', () => { cards[b.dataset.card] = false; syncCards(); });
function syncCards() {
  const phone = narrow();
  let xr = layers.xray && cards.xray, zn = layers.zones && cards.zones;
  if (phone && xr && zn) xr = false;
  $('#xray-card').hidden = !xr;
  $('#zones-card').hidden = !zn;
  syncInset();
}

function syncXrayText() {
  const other = side === 'top' ? 'solder' : 'component';
  $('#xray-text').textContent = `The ${other}-side photo shows through the board in register; parts turn to glass.`;
  $('#xray-amount').value = Math.round(ui.xrayAmount * 100);
  $('#xray-value').textContent = `${Math.round(ui.xrayAmount * 100)}%`;
  $('#xray-lens').checked = ui.xrayLens;
  $('#xray-lens-text').textContent = coarsePointer ? 'Lens (tap the board to move it)' : 'Lens (follows the pointer)';
  $('#xray-note').textContent = 'The two photos are registered at 33 through-hole features and agree to about 3 board units. Areas under tall parts are painted out of the component-side photo.';
}
$('#xray-amount').addEventListener('input', e => {
  ui.xrayAmount = Number(e.target.value) / 100;
  $('#xray-value').textContent = `${e.target.value}%`;
  atlas.setXray({ xrayAmount: ui.xrayAmount });
  store.saveUi(ui);
});
$('#xray-lens').addEventListener('change', e => { ui.xrayLens = e.target.checked; atlas.setXray({ lens: ui.xrayLens }); store.saveUi(ui); });

function renderZoneCard() {
  if (!isolation) { $('#zone-parts').innerHTML = '<p class="card-note">No isolation tracing is available.</p>'; return; }
  const across = [...known.values()].filter(k => !k.unplaced && ['spans', 'barrier'].includes(zoneOf(k.id))).sort((a, b) => collator.compare(a.id, b.id));
  $('#zone-parts').innerHTML = across.length
    ? `<span class="zone-parts-title">On or across the barrier</span><div class="chip-row">${across.map(k => `<button type="button" class="mini-chip" data-key="${esc(k.id)}">${esc(k.id)}</button>`).join('')}</div>`
    : '';
  $('#zone-note').textContent = `${isolation.primaryEvidence} Board documented unpowered only.`;
}
$('#zone-parts').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) select(b.dataset.key, { fly: true }); });

// ---------- continuity ----------
function refreshRefOptions() {
  $('#ref-options').innerHTML = [...known.values()].filter(k => !k.unplaced).sort((a, b) => collator.compare(a.id, b.id)).map(k => `<option value="${esc(k.id)}"></option>`).join('');
}

function endpointZone(ref) {
  const z = zoneOf(ref);
  return z;
}
function crossesBarrier(a, b) {
  const za = endpointZone(a), zb = endpointZone(b);
  return (za === 'primary' && zb === 'secondary') || (za === 'secondary' && zb === 'primary');
}
function touchesBarrier(a, b) {
  return [endpointZone(a), endpointZone(b)].some(z => z === 'spans' || z === 'barrier');
}

function refreshLinks() {
  const nets = store.computeNets(data.readings);
  const netOf = new Map();
  for (const n of nets) for (const m of n.members) netOf.set(m, n.name);
  const pk = p => `${p.ref}${p.pin ? `.${p.pin}` : ''}`;
  const links = data.readings.map(r => ({ ...r, cross: crossesBarrier(r.a.ref, r.b.ref), nets: [netOf.get(pk(r.a)), netOf.get(pk(r.b))].filter(Boolean) }));
  if (highlightNet && !nets.some(n => n.name === highlightNet)) highlightNet = null;
  atlas.setLinks(layers.links, links, highlightNet);
  const pinned = new Set();
  if (layers.links) for (const l of links) if (!highlightNet || l.nets.includes(highlightNet)) { pinned.add(l.a.ref); pinned.add(l.b.ref); }
  atlas.setPinned(pinned);
  $('#links-count').textContent = data.readings.length ? ` ${data.readings.length}` : '';
  $('#net-count').textContent = nets.length ? `(${nets.length})` : '';
  $('#reading-count').textContent = data.readings.length ? `(${data.readings.length})` : '';
  $('#net-list').innerHTML = nets.length
    ? nets.map(n => `<button type="button" class="net-row${n.name === highlightNet ? ' active' : ''}" data-net="${esc(n.name)}" aria-pressed="${n.name === highlightNet}"><span class="net-name">${esc(n.name)}</span><span class="net-members">${n.members.map(esc).join(', ')}</span></button>`).join('')
    : '<p class="empty-line">Nets appear once two points show continuity.</p>';
  $('#reading-list').innerHTML = links.length
    ? [...links].reverse().map(l => `<div class="reading${l.cross ? ' cross' : ''}" data-id="${esc(l.id)}">
        <div class="reading-main"><span class="reading-pts">${esc(pk(l.a))} <span aria-hidden="true">&harr;</span><span class="sr-only"> to </span> ${esc(pk(l.b))}</span>
        <span class="reading-result" data-result="${l.result}">${l.result === 'resistance' ? esc(l.value || '?') + ' &Omega;' : l.result}</span></div>
        ${l.note ? `<p class="reading-note">${esc(l.note)}</p>` : ''}
        ${l.cross ? `<p class="reading-warn">${alertIcon}<span>Endpoints are on opposite sides of the traced isolation barrier. Re-check this reading.</span></p>` : ''}
        <div class="reading-foot"><span>${esc((l.at || '').slice(0, 10))}</span><button type="button" class="link-button" data-delete="${esc(l.id)}">Delete</button></div></div>`).join('')
    : `<div class="empty-state small"><div class="empty-glyph">${cableIcon}</div><p>No readings yet.</p><small>Pick two points on the board (or type their markings), choose the result, and log it.</small></div>`;
}

$('#net-list').addEventListener('click', e => {
  const b = e.target.closest('[data-net]'); if (!b) return;
  highlightNet = highlightNet === b.dataset.net ? null : b.dataset.net;
  if (!layers.links) toggleLayer('links', true);
  refreshLinks();
});
$('#reading-list').addEventListener('click', async e => {
  const id = e.target.closest('[data-delete]')?.dataset.delete; if (!id) return;
  const r = data.readings.find(x => x.id === id);
  const ok = await confirmAction('Delete this reading?', `${r.a.ref}${r.a.pin ? '.' + r.a.pin : ''} to ${r.b.ref}${r.b.pin ? '.' + r.b.pin : ''} (${r.result}) will be removed from the log.`, 'Delete reading');
  if (!ok) return;
  data.readings = data.readings.filter(x => x.id !== id);
  persist(); refreshLinks();
});

const rf = $('#reading-form');
function readingDraft() {
  const f = rf.elements;
  return {
    a: { ref: f.aRef.value.trim().toUpperCase(), pin: f.aPin.value.trim() },
    b: { ref: f.bRef.value.trim().toUpperCase(), pin: f.bPin.value.trim() },
    result: rf.querySelector('input[name=result]:checked').value, value: f.value.value.trim(), note: f.note.value.trim()
  };
}
function validateReading(r) {
  for (const [tag, p] of [['A', r.a], ['B', r.b]]) {
    if (!p.ref) return `Choose point ${tag}: pick it on the board or type its marking.`;
    const k = known.get(p.ref);
    if (!k) return `${p.ref} is not in the index. Add it first with Add reference.`;
    if (k.unplaced) return `${p.ref} has no position yet. Place its marker first.`;
  }
  if (r.a.ref === r.b.ref && r.a.pin === r.b.pin) return 'Points A and B are the same. Choose two different points.';
  if (r.result === 'resistance' && !/^\d+(\.\d+)?\s*[kKmM]?$/.test(r.value)) return 'Enter the resistance, e.g. 470, 4.7k or 1.2M (ohms).';
  return '';
}
function syncReadingWarn() {
  const r = readingDraft();
  const ok = known.has(r.a.ref) && known.has(r.b.ref);
  const warn = $('#reading-warn');
  if (ok && crossesBarrier(r.a.ref, r.b.ref)) { warn.innerHTML = `${alertIcon}<span>These points are on opposite sides of the traced isolation barrier. Log it only if you measured it; it will be flagged.</span>`; warn.hidden = false; }
  else if (ok && touchesBarrier(r.a.ref, r.b.ref)) { warn.innerHTML = `${infoIcon}<span>One point spans the isolation barrier, so its side depends on the pin. Note the pin.</span>`; warn.hidden = false; }
  else warn.hidden = true;
  $('.value-field').hidden = r.result !== 'resistance';
}
rf.addEventListener('input', () => { $('#reading-error').hidden = true; syncReadingWarn(); });
rf.addEventListener('submit', e => {
  e.preventDefault();
  const r = readingDraft();
  const err = validateReading(r);
  if (err) { $('#reading-error').textContent = err; $('#reading-error').hidden = false; return; }
  data.readings.push({ id: store.cryptoId(), a: r.a, b: r.b, result: r.result, value: r.result === 'resistance' ? r.value : '', note: r.note, at: new Date().toISOString() });
  persist();
  for (const n of ['aRef', 'aPin', 'bRef', 'bPin', 'value', 'note']) rf.elements[n].value = '';
  syncReadingWarn();
  if (!layers.links) toggleLayer('links', true); else refreshLinks();
  toast('Reading logged.');
});
for (const b of document.querySelectorAll('.pick-button')) b.addEventListener('click', () => setMode(mode === `pick-${b.dataset.pick}` ? null : `pick-${b.dataset.pick}`));
function completePick(key) {
  const which = mode === 'pick-a' ? 'a' : 'b';
  rf.elements[`${which}Ref`].value = key;
  setMode(null);
  if (!layers.links) toggleLayer('links', true);
  setTab('links'); openSheet();
  syncReadingWarn();
  rf.elements[`${which}Pin`].focus({ preventScroll: true });
  toast(`Point ${which.toUpperCase()}: ${key}`);
}

// ---------- tabs & mobile sheets ----------
function setTab(next) {
  tab = next;
  $('#tab-record').setAttribute('aria-selected', String(tab === 'record'));
  $('#tab-links').setAttribute('aria-selected', String(tab === 'links'));
  $('#tab-record').tabIndex = tab === 'record' ? 0 : -1;
  $('#tab-links').tabIndex = tab === 'links' ? 0 : -1;
  $('#record-panel').hidden = tab !== 'record';
  $('#links-panel').hidden = tab !== 'links';
}
$('#tab-record').addEventListener('click', () => setTab('record'));
$('#tab-links').addEventListener('click', () => setTab('links'));
$('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  setTab(tab === 'record' ? 'links' : 'record');
  $(tab === 'record' ? '#tab-record' : '#tab-links').focus();
});
// On phones and tablets the bottom sheet or the layer cards cover the lower screen; the camera refits above them.
function syncInset() {
  const cardsOpen = !$('#xray-card').hidden || !$('#zones-card').hidden;
  let h = 0, w = 0;
  if (narrow() && $('#inspector').classList.contains('open')) h = $('#inspector').getBoundingClientRect().height;
  else if (cardsOpen && innerWidth <= 800) h = $('.feature-cards').getBoundingClientRect().height;
  else if (cardsOpen) w = $('.feature-cards').getBoundingClientRect().width + 14;
  atlas.setInset(h, w);
}
function openSheet() { $('#inspector').classList.add('open'); syncInset(); }
function closeSheet() { $('#inspector').classList.remove('open'); syncInset(); }
$('#close-inspector').addEventListener('click', closeSheet);
$('#mobile-index').addEventListener('click', () => { $('#index-panel').classList.toggle('open'); if ($('#index-panel').classList.contains('open')) closeSheet(); });
$('#close-index').addEventListener('click', () => $('#index-panel').classList.remove('open'));
$('#legend-toggle').addEventListener('click', () => {
  const open = $('#legend').classList.toggle('open');
  $('#legend-toggle').setAttribute('aria-expanded', String(open));
});
addEventListener('resize', () => { syncCards(); syncInset(); });

// ---------- export / import ----------
$('#export-notes').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.exportPayload(data), null, 2) + '\n'], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `48-59-1812-board-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 3000);
  toast('Records exported as JSON.');
});
$('.import-button').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#import-notes').click(); } });
$('#import-notes').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = store.parseImport(await file.text());
    if (parsed.kind === 2) {
      const ok = await confirmAction('Replace the records in this browser?', `The file holds ${Object.keys(parsed.state.notes).length} records, ${parsed.state.custom.length} added markers and ${parsed.state.readings.length} readings. Everything saved here now is replaced.`, 'Replace records');
      if (!ok) return;
      localStorage.setItem(store.STORAGE_KEY, JSON.stringify(parsed.state));
    } else {
      const n = Object.keys(parsed.notes).length;
      const ok = await confirmAction('Import notes from a first-atlas file?', `This older export (schema 1) contributes ${n} notes only; its marker positions used a different frame and are ignored. Your current notes are replaced; markers and readings stay.`, 'Import notes');
      if (!ok) return;
      data.notes = parsed.notes;
      store.save(data);
    }
    location.reload();
  } catch (err) {
    toast(`Import failed: ${err.message}`, 'warn');
  }
});

// ---------- photos ----------
function updatePhoto() {
  const photo = photos[photoIndex];
  const img = $('#photo-image');
  $('#photo-title').textContent = photo.label;
  $('#photo-file').textContent = photo.file;
  $('#photo-position').textContent = `${photoIndex + 1} / ${photos.length}`;
  $('#photo-loading').hidden = false;
  img.alt = `${photo.label} (original evidence photograph)`;
  img.onload = () => { $('#photo-loading').hidden = true; };
  img.onerror = () => { $('#photo-loading').textContent = 'This photograph could not be loaded.'; };
  img.src = photo.src;
}
$('#photo-button').addEventListener('click', () => { updatePhoto(); $('#photo-dialog').showModal(); });
$('#photo-close').addEventListener('click', () => $('#photo-dialog').close());
$('#photo-prev').addEventListener('click', () => { photoIndex = (photoIndex + photos.length - 1) % photos.length; updatePhoto(); });
$('#photo-next').addEventListener('click', () => { photoIndex = (photoIndex + 1) % photos.length; updatePhoto(); });
$('#photo-dialog').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') $('#photo-prev').click();
  if (e.key === 'ArrowRight') $('#photo-next').click();
});
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) d.close(); });
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#help-dialog [data-close]').addEventListener('click', () => $('#help-dialog').close());
$('#help-tour').addEventListener('click', () => { $('#help-dialog').close(); $('#onboarding').hidden = false; $('#onboard-done').focus(); });

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape') {
    if (document.querySelector('dialog[open]')) return;
    if (mode) { setMode(null); return; }
    if (!$('#onboarding').hidden) { dismissOnboarding(); return; }
    if ($('#index-panel').classList.contains('open')) { $('#index-panel').classList.remove('open'); return; }
    if (typing) { e.target.blur(); return; }
    if (selected) { select(null); closeSheet(); }
    return;
  }
  if (typing || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const actions = {
    f: () => setSide(side === 'top' ? 'bottom' : 'top'), 1: () => setView('plan'), 2: () => setView('three'), 3: () => setView('edge'),
    r: () => setView('three'), l: () => $('#label-toggle').click(), x: () => { if (!document.querySelector('[data-layer=xray]').disabled) toggleLayer('xray'); },
    i: () => toggleLayer('zones'), c: () => toggleLayer('links'), p: () => $('#surface-toggle').click(),
    '/': () => { if (innerWidth <= 800) $('#index-panel').classList.add('open'); $('#search').focus(); }, '?': () => $('#help-dialog').showModal()
  };
  if (actions[k]) { e.preventDefault(); actions[k](); }
});

// ---------- start ----------
renderIndex();
renderInspector();
refreshRefOptions();
refreshLinks();
syncXrayText();
syncSurfaceUi();
setTab('record');

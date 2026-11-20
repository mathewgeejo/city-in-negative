import * as THREE from 'three';
import type { Game } from '../game/game';
import { getPhoto, loadSave, type PrintMeta } from '../game/save';
import { CURATED_SEED, person, train } from '../gen/history';
import { normalizeSeed, randomSeed } from '../gen/world';
import type { WorldState } from '../sim/events';
import { type DocId, docView, judgeTheory, SLOT_LABEL, SLOTS, type Slot } from '../sim/evidence';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const key = (k: string) => `<span class="key">${k}</span>`;
const P = new THREE.Vector3(), Q = new THREE.Vector3();

export class UI {
  private root = document.getElementById('ui')!;
  private el: Record<string, HTMLElement> = {};
  private subs: HTMLElement;
  private toasts: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private heldImg: HTMLImageElement;
  private perfOn = false;
  private perfT = 0;
  private journalHintShown = false;
  private openScreen: string | null = null;

  constructor(private g: Game) {
    const r = this.root;
    r.innerHTML = '';
    for (const [k, cls] of [['dot', 'dot'], ['prompt', 'prompt'], ['hint', 'hint'], ['status', 'status'], ['vf', 'vf'], ['held', 'held'], ['heldChip', 'held-chip'], ['flash', 'flash'], ['cross', 'cross'], ['perf', 'perf']] as const) {
      this.el[k] = r.appendChild(h('div', cls));
    }
    this.el.vf.innerHTML = '<i></i><i></i><i></i><i></i><span class="vlabel"></span><span class="vhint"></span>';
    this.heldImg = this.el.held.appendChild(h('img')) as HTMLImageElement;
    this.heldImg.alt = 'Held print';
    this.subs = r.appendChild(h('div', 'subs'));
    this.subs.setAttribute('aria-live', 'polite');
    this.toasts = r.appendChild(h('div', 'toasts'));
    this.toasts.setAttribute('aria-live', 'polite');
    for (const s of ['title', 'pause', 'settings', 'journal', 'doc', 'case', 'ending', 'resume']) this.screens[s] = r.appendChild(h('div', 'screen'));
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    addEventListener('keydown', (e) => this.onKey(e));
    g.canvas.addEventListener('click', () => { if (!this.openScreen) this.resume(); });
  }

  /* ---------------- screens ---------------- */
  private show(name: string | null) {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === name);
    this.openScreen = name;
    this.g.uiOpen = !!name;
    if (name) this.g.input.unlock();
  }
  close() { this.show(null); this.resume(); }
  resume() {
    if (this.openScreen) return;
    this.g.audio.start();
    this.g.input.lock();
  }
  private onLockChange() {
    if (!this.g.input.locked && !this.openScreen && this.g.running) this.showPause();
    if (this.g.input.locked && this.openScreen === 'resume') this.show(null);
  }
  private onKey(e: KeyboardEvent) {
    if (!this.openScreen) return;
    if (e.code === 'Escape' || (e.code === 'Tab' && this.openScreen === 'journal')) {
      e.preventDefault();
      if (this.openScreen === 'title' || this.openScreen === 'ending') return;
      if (this.openScreen === 'pause') { this.show('resume'); this.screens.resume.innerHTML = `<div class="scrim"></div><div class="panel interactive" style="text-align:center;width:auto"><p>Click to return to the street</p></div>`; this.screens.resume.onclick = () => { this.show(null); this.resume(); }; return; }
      this.show(null);
      this.show('resume');
      this.screens.resume.innerHTML = `<div class="scrim" style="background:rgba(9,14,20,.35)"></div><div class="panel interactive" style="text-align:center;width:auto;padding:1rem 1.6rem"><p style="margin:0">Click to continue</p></div>`;
      this.screens.resume.onclick = () => { this.show(null); this.resume(); };
    }
  }

  showTitle() {
    const s = this.screens.title;
    const save = loadSave();
    s.innerHTML = `
      <div class="title-print interactive" role="dialog" aria-labelledby="t-h">
        <span class="hand">one block, two eras</span>
        <h1 id="t-h">The City<br>in Negative</h1>
        <p class="lede">The central station vanished thirty years ago. Its board still hangs over a bricked-up door, and one lamp still lights. Six minutes after closing, someone sent a train away.</p>
        <div class="seed"><label for="seed">Seed</label><input id="seed" spellcheck="false" autocomplete="off" value="${esc(this.g.world?.seed ?? CURATED_SEED)}" aria-describedby="seed-help"><span id="seed-help" class="small" style="margin:0">Same seed, same block and the same history.</span></div>
        <div class="row">
          <button class="btn" data-a="begin">Begin the case</button>
          ${save ? `<button class="btn ghost" data-a="continue">Continue ${esc(save.seed)}</button>` : ''}
          <button class="btn ghost" data-a="random">New seed</button>
        </div>
        <div class="row" style="margin-top:.6rem"><button class="btn ghost" data-a="settings">Settings</button></div>
        <p class="small">${key('W')}${key('A')}${key('S')}${key('D')} walk · ${key('C')} camera · click photograph · ${key('E')} interact or step through · ${key('Tab')} journal · ${key('Esc')} pause. Headphones help: the past is heard faintly until you raise the camera.</p>
      </div>`;
    const input = s.querySelector('#seed') as HTMLInputElement;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      if (a === 'settings') { this.showSettings('title'); return; }
      if (a === 'random') { input.value = randomSeed(); return; }
      if (a === 'continue' && save) { await this.g.load(save.seed, save); this.show(null); this.resume(); return; }
      const seed = normalizeSeed(input.value);
      await this.g.newGame(seed);
      this.show(null);
      this.resume();
    }));
    this.show('title');
  }

  showPause() {
    const s = this.screens.pause;
    const c = this.g.world.case;
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="Paused" style="width:min(560px,94vw)">
      <h2>Paused</h2>
      <p class="case-intro">Seed <b>${esc(this.g.world.seed)}</b>, ${esc(this.g.world.layout.arrangement)}. ${c.pastYear} and ${c.presentYear}.</p>
      <div class="row" style="flex-direction:column;align-items:stretch;gap:.5rem">
        <button class="btn" data-a="resume">Resume</button>
        <button class="btn dark-ghost" data-a="journal">Journal</button>
        <button class="btn dark-ghost" data-a="settings">Settings</button>
        <button class="btn dark-ghost" data-a="replay">Replay this seed from the start</button>
        <button class="btn dark-ghost" data-a="title">Change seed</button>
      </div></div>`;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      if (a === 'resume') this.close();
      else if (a === 'journal') this.openJournal();
      else if (a === 'settings') this.showSettings('pause');
      else if (a === 'replay') { await this.g.newGame(this.g.world.seed); this.close(); }
      else if (a === 'title') this.showTitle();
    }));
    this.show('pause');
  }

  showSettings(back: 'title' | 'pause') {
    const s = this.screens.settings, st = this.g.settings;
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <div class="settings-grid">
        <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.05" data-k="sensitivity" value="${st.sensitivity}"></label>
        <label>Render scale <input type="range" min="0.5" max="1" step="0.05" data-k="renderScale" value="${st.renderScale}"></label>
        <label>Shadows <select data-k="shadows">${['off', 'low', 'high'].map((v) => `<option ${st.shadows === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${st.volume}"></label>
        <label>Head motion <input type="checkbox" data-k="headBob" ${st.headBob ? 'checked' : ''}></label>
        <label>Reduce flashes <input type="checkbox" data-k="reduceFlashes" ${st.reduceFlashes ? 'checked' : ''}></label>
        <label>Captions for sounds <input type="checkbox" data-k="captions" ${st.captions ? 'checked' : ''}></label>
        <label>Invert mouse Y <input type="checkbox" data-k="invertY" ${st.invertY ? 'checked' : ''}></label>
      </div>
      <div class="controls-list">${key('W A S D')}<span>Walk (Shift to hurry)</span>${key('C')}<span>Raise or lower the camera</span>${key('Click')}<span>Take a photograph</span>${key('E')}<span>Interact, or step through a lined-up print</span>${key('Tab')}<span>Journal</span>${key('Q')}<span>Put away the held print</span>${key('Esc')}<span>Pause, release the mouse</span>${key('F3')}<span>Frame timings</span></div>
      <button class="btn" data-a="back">Done</button></div>`;
    s.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k as keyof typeof st;
      const v = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? inp.checked : inp instanceof HTMLInputElement && inp.type === 'range' ? Number(inp.value) : inp.value;
      (st as any)[k] = v;
      this.g.applySettings();
    }));
    s.querySelector('[data-a="back"]')!.addEventListener('click', () => (back === 'title' ? this.showTitle() : this.showPause()));
    this.show('settings');
  }

  /* ---------------- journal ---------------- */
  openJournal(tab: 'prints' | 'docs' | 'history' = 'prints') {
    const s = this.screens.journal;
    const g = this.g;
    s.innerHTML = `<div class="scrim"></div><div class="sheet interactive" role="dialog" aria-label="Journal">
      <header><h2>Contact sheet</h2><div class="tabs" role="tablist">
        <button class="tab" role="tab" data-t="prints" aria-selected="${tab === 'prints'}">Prints (${g.prints.length})</button>
        <button class="tab" role="tab" data-t="docs" aria-selected="${tab === 'docs'}">Documents (${g.docs.size})</button>
        <button class="tab" role="tab" data-t="history" aria-selected="${tab === 'history'}">History</button></div>
        <span style="flex:1"></span>${g.pinned.length === 2 ? '<button class="btn oxblood" data-a="compare">Compare pinned prints</button>' : `<span class="small" style="color:var(--ivory-dim);margin:0">Pin two prints to compare them</span>`}
        <button class="btn dark-ghost" data-a="close">Close</button></header>
      <div class="body"></div></div>`;
    const body = s.querySelector('.body') as HTMLElement;
    s.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => this.openJournal(b.dataset.t as any)));
    s.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
    s.querySelector('[data-a="compare"]')?.addEventListener('click', () => this.openCompare());
    if (tab === 'prints') {
      if (!g.prints.length) body.innerHTML = '<p class="empty">No prints yet. Raise the camera with C and click to expose the other era.</p>';
      const strip = body.appendChild(h('div', 'strip'));
      const n = g.prints.length;
      g.prints.forEach((p, i) => {
        const contra = g.contradictions(p);
        const f = h('button', `frame${g.pinned.includes(p.id) ? ' pinned' : ''}`, `<span class="no">${n - i}A</span><img alt="${esc(p.caption)}" src="${p.thumb}"><span class="era-tag">${p.era === 'past' ? g.world.case.pastYear : g.world.case.presentYear}</span><div class="cap">${esc(p.caption)}</div>${contra.length ? '<div class="contra">No longer matches the street</div>' : ''}`);
        f.addEventListener('click', () => this.openPrint(p));
        strip.appendChild(f);
      });
    } else if (tab === 'docs') {
      if (!g.docs.size) body.innerHTML = '<p class="empty">Nothing collected yet.</p>';
      const list = body.appendChild(h('div', 'doc-list'));
      for (const d of g.docs.values()) {
        const v = docView(g.world.case, d.id, d.ws);
        const stale = d.id === 'doc.log' && g.ws.present.logAt === 'sealed';
        const b = h('button', 'doc-card', `${esc(v.title)}<small>${esc(d.viaPrint ? 'read from a print' : v.caption)}${stale ? ' · no longer where you found it' : ''}</small>`);
        b.addEventListener('click', () => this.openDoc(d.id, 'journal'));
        list.appendChild(b);
      }
    } else {
      const c = g.world.case;
      const acts = Object.entries(g.actions).filter(([, v]) => v).map(([k]) => k);
      body.innerHTML = `<p class="case-intro">The present is whatever these events leave behind. Change the past and they rewrite themselves; undo a change and they return.</p>
        <ol class="timeline">${g.hist.fired.map((f) => `<li><span class="yr">${f.year}</span>${esc(f.text)}</li>`).join('')}</ol>
        <p class="case-intro">Your changes in ${c.pastYear}: ${acts.length ? acts.map((a) => ({ gutter: 'turned the gutter', label: 'swapped the label', note: 'left a note', gate: 'opened the alley gate' } as any)[a]).join(', ') : 'none yet'}.</p>`;
    }
    this.show('journal');
  }

  private async photoURL(p: PrintMeta) {
    const b = await getPhoto(p.id).catch(() => undefined);
    return b ? URL.createObjectURL(b) : p.thumb;
  }

  private async openPrint(p: PrintMeta) {
    const g = this.g, c = g.world.case;
    const url = await this.photoURL(p);
    const contra = g.contradictions(p);
    const s = this.screens.journal;
    const yr = p.era === 'past' ? c.pastYear : c.presentYear;
    const clues = Object.entries(p.clues);
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="Print" style="width:min(1100px,96vw)">
      <div class="inspect"><div class="photo"><img alt="${esc(p.caption)}" src="${url}"><span class="cap">${esc(p.caption)}</span></div>
      <div><dl class="meta">
        <dt>Shows</dt><dd>${p.era === 'past' ? 'The past' : 'The present'}, ${yr}</dd>
        <dt>Taken from</dt><dd>${esc(p.locationLabel)}, standing in ${p.takenFrom === 'past' ? c.pastYear : c.presentYear}</dd>
        <dt>Seed</dt><dd>${esc(p.seed)}</dd>
        <dt>As exposed</dt><dd>${clues.length ? clues.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>') : 'No changeable evidence in frame.'}</dd>
        ${p.docs.length ? `<dt>Legible in the print</dt><dd>${p.docs.map((d) => esc(docView(c, d, g.docs.get(d)?.ws ?? g.ws).title)).join('<br>')}</dd>` : ''}
        ${contra.length ? `<dt style="color:var(--honey)">Contradicts the street now</dt><dd>${contra.map((x) => `${esc(x.name)}: <span style="color:var(--honey)">${esc(x.now)}</span>`).join('<br>')}</dd>` : ''}
      </dl>
      <div class="row" style="margin-top:1.2rem">
        <button class="btn" data-a="pin">${g.pinned.includes(p.id) ? 'Unpin' : 'Pin for comparison'}</button>
        ${p.anchorId ? '<button class="btn dark-ghost" data-a="hold">Hold this print up</button>' : ''}
        <button class="btn dark-ghost" data-a="back">Back</button></div></div></div></div>`;
    s.querySelector('[data-a="back"]')!.addEventListener('click', () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); this.openJournal(); });
    s.querySelector('[data-a="pin"]')!.addEventListener('click', () => {
      g.pinned = g.pinned.includes(p.id) ? g.pinned.filter((x) => x !== p.id) : [...g.pinned, p.id].slice(-2);
      g.save();
      this.openPrint(p);
    });
    s.querySelector('[data-a="hold"]')?.addEventListener('click', async () => { await g.holdPrint(p); this.close(); });
  }

  private async openCompare() {
    const g = this.g, c = g.world.case;
    const [a, b] = g.pinned.map((id) => g.prints.find((p) => p.id === id)!).filter(Boolean);
    if (!a || !b) return this.openJournal();
    const [ua, ub] = await Promise.all([this.photoURL(a), this.photoURL(b)]);
    const keys = [...new Set([...Object.keys(a.clues), ...Object.keys(b.clues)])];
    const diffs = keys.filter((k) => a.clues[k] !== b.clues[k]);
    const yr = (p: PrintMeta) => (p.era === 'past' ? c.pastYear : c.presentYear);
    const s = this.screens.journal;
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="Compare prints" style="width:min(1200px,96vw)">
      <h2>Pinned side by side</h2>
      <div class="compare"><div class="photo"><img alt="" src="${ua}"><span class="cap">${esc(a.caption)}</span></div><div class="photo"><img alt="" src="${ub}"><span class="cap">${esc(b.caption)}</span></div></div>
      <div class="diffs">${diffs.length ? diffs.map((k) => `<div>${esc(k)}: <span class="then">${esc(a.clues[k] ?? 'not in frame')} (${yr(a)})</span> → <span class="now">${esc(b.clues[k] ?? 'not in frame')} (${yr(b)})</span></div>`).join('') : '<div class="then">No recorded objects differ between these two prints. Look at the architecture: what stayed, what changed use.</div>'}
      ${[a, b].flatMap((p) => g.contradictions(p).map((x) => `<div>${esc(x.name)} in the ${yr(p)} print: <span class="then">${esc(x.then)}</span>, but now <span class="now">${esc(x.now)}</span></div>`)).join('')}</div>
      <div class="row" style="margin-top:1rem"><button class="btn dark-ghost" data-a="diff">Overlay difference</button><button class="btn dark-ghost" data-a="back">Back</button></div>
      <div class="overlay-diff" hidden><img alt="" src="${ua}"><img alt="" src="${ub}"></div></div>`;
    s.querySelector('[data-a="diff"]')!.addEventListener('click', () => { const o = s.querySelector('.overlay-diff') as HTMLElement; o.hidden = !o.hidden; });
    s.querySelector('[data-a="back"]')!.addEventListener('click', () => this.openJournal());
  }

  /* ---------------- documents ---------------- */
  openDoc(id: DocId, back?: 'journal' | 'case') {
    const g = this.g, c = g.world.case;
    const entry = g.docs.get(id);
    const ws: WorldState = entry?.ws ?? g.ws;
    const v = docView(c, id, ws);
    const ink = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="ink">$1</span>');
    let inner = '';
    if (v.style === 'diagram' && v.diagram) {
      const rows = v.diagram.map((d, i) => {
        const y = 50 + i * 110;
        return `<text x="20" y="${y + 6}" font-family="Josefin Sans" font-weight="700" font-size="18">P${d.platform}</text><line x1="60" y1="${y}" x2="200" y2="${y}" stroke="#23232b" stroke-width="5"/>` +
          d.lines.map((ln, k) => { const ty = y + (k ? 34 : -34); return `<polyline points="200,${y} 280,${ty} 320,${ty}" fill="none" stroke="#C84F3C" stroke-width="5"/><text x="330" y="${ty + 6}" font-family="Special Elite" font-size="18">${esc(ln)}</text>`; }).join('');
      }).join('');
      inner = `<svg viewBox="0 0 560 260" role="img" aria-label="Track diagram">${rows}</svg><div>${ink(v.lines[0])}</div>`;
    } else if (v.style === 'slip') inner = v.lines.map((l) => (l.startsWith('**') ? `<div class="stamp">${esc(l.replace(/\*\*/g, ''))}</div>` : `<div>${ink(l)}</div>`)).join('');
    else inner = v.lines.map((l) => `<div>${ink(l)}</div>`).join('');
    const s = this.screens.doc;
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="${esc(v.title)}" style="background:transparent;box-shadow:none;width:min(720px,96vw)">
      <div class="doc ${v.style}"><h3>${esc(v.title)}</h3>${inner}<div class="caption">${esc(entry?.viaPrint ? 'Enlarged from your print.' : v.caption)}</div></div>
      <div class="row" style="justify-content:center;margin-top:1.2rem"><button class="btn" data-a="back">${back === 'journal' ? 'Back to journal' : back === 'case' ? 'Back to the board' : 'Done'}</button></div></div>`;
    s.querySelector('[data-a="back"]')!.addEventListener('click', () => (back === 'journal' ? this.openJournal('docs') : back === 'case' ? this.openCaseBoard() : this.close()));
    this.show('doc');
    g.audio.ui('page');
  }

  /* ---------------- case board ---------------- */
  openCaseBoard(verdicts?: { slot: Slot; ok: boolean; message: string }[]) {
    const g = this.g, c = g.world.case;
    const th = g.theory;
    const opts: Record<Slot, [string, string][]> = {
      train: c.trains.map((t) => [t.id, t.label]),
      destination: c.destinations.map((d) => [d, d]),
      authorizer: c.people.map((p) => [p.id, `${p.name}, ${p.role}`]),
    };
    const docs = [...g.docs.values()].map((d) => [d.id, docView(c, d.id, d.ws).title] as [DocId, string]);
    const s = this.screens.case;
    s.innerHTML = `<div class="scrim"></div><div class="panel interactive" role="dialog" aria-label="Departure board">
      <h2>The departure board</h2>
      <p class="case-intro">One lamp still burns. Name the train that left six minutes after closing, where it went and who signed for it. Each answer needs a document or print behind it.</p>
      ${SLOTS.map((slot) => {
        const v = verdicts?.find((x) => x.slot === slot);
        return `<div class="case-row"><span class="q">${SLOT_LABEL[slot]}</span>
        <select data-slot="${slot}" aria-label="${SLOT_LABEL[slot]}"><option value="">Choose…</option>${opts[slot].map(([k, l]) => `<option value="${esc(k)}" ${th[slot] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select data-ev="${slot}" aria-label="Evidence for ${SLOT_LABEL[slot]}"><option value="">Evidence…</option>${docs.map(([k, l]) => `<option value="${k}" ${th.evidence[slot] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <div class="verdict ${v?.ok ? 'ok' : ''}">${v ? esc(v.message) : ''}</div></div>`;
      }).join('')}
      <div class="row" style="margin-top:1rem"><button class="btn oxblood" data-a="present">Present the theory</button><button class="btn dark-ghost" data-a="journal">Open documents</button><button class="btn dark-ghost" data-a="close">Keep investigating</button></div></div>`;
    s.querySelectorAll<HTMLSelectElement>('select').forEach((sel) => sel.addEventListener('change', () => {
      if (sel.dataset.slot) (th as any)[sel.dataset.slot] = sel.value || undefined;
      else th.evidence[sel.dataset.ev as Slot] = (sel.value || undefined) as DocId | undefined;
      g.save();
    }));
    s.querySelector('[data-a="present"]')!.addEventListener('click', () => {
      const res = judgeTheory(c, th, new Set(g.docs.keys()));
      if (res.solved) { g.progress.solved = true; g.save(); g.audio.ui('solve'); this.showEnding(); }
      else this.openCaseBoard(res.verdicts);
    });
    s.querySelector('[data-a="journal"]')!.addEventListener('click', () => this.openJournal('docs'));
    s.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
    this.show('case');
  }

  showEnding() {
    const g = this.g, c = g.world.case;
    const t = train(c, c.answerTrain), a = person(c, c.authorizer);
    const mins = Math.max(1, Math.round(g.playTime / 60));
    const changes = Object.values(g.actions).filter(Boolean).length;
    const s = this.screens.ending;
    s.innerHTML = `<div class="scrim"></div><div class="ending interactive" role="dialog" aria-labelledby="end-h">
      <h2 id="end-h">23:06, Platform ${c.answerPlatform}</h2>
      <p>Engine ${esc(t.label)} left Central Station six minutes after closing, bound for ${esc(c.answerDest)}, on the signature of ${esc(a.name)}, ${esc(a.role.toLowerCase())}.</p>
      <p>${esc(c.motive)}</p>
      <p>Tonight the last lamp on the board goes dark. The line is clear.</p>
      <div class="stats">${mins} min · ${g.prints.length} prints · ${changes} change${changes === 1 ? '' : 's'} to ${c.pastYear} · seed ${esc(c.seed)}</div>
      <div class="row"><button class="btn" data-a="replay">Replay this seed</button><button class="btn ghost" data-a="new">Try another seed</button><button class="btn ghost" data-a="stay">Keep exploring</button></div></div>`;
    s.querySelector('[data-a="replay"]')!.addEventListener('click', async () => { await g.newGame(c.seed); this.close(); });
    s.querySelector('[data-a="new"]')!.addEventListener('click', () => this.showTitle());
    s.querySelector('[data-a="stay"]')!.addEventListener('click', () => this.close());
    this.show('ending');
  }

  /* ---------------- HUD feedback ---------------- */
  subtitle(text: string, speaker?: string, cc = false) {
    const e = h('div', `sub${cc ? ' cc' : ''}`, `${speaker ? `<b>${esc(speaker)}</b>` : ''}${esc(text)}`);
    this.subs.appendChild(e);
    while (this.subs.children.length > 3) this.subs.firstChild!.remove();
    setTimeout(() => e.remove(), 2600 + text.length * 55);
  }
  toast(text: string) {
    const e = this.toasts.appendChild(h('div', 'toast', esc(text)));
    setTimeout(() => e.remove(), 4200);
    if (!this.journalHintShown && this.g.docs.size >= 1) { this.journalHintShown = true; setTimeout(() => this.subtitle('Tab opens your journal: prints, documents and the history you are changing.', undefined, true), 900); }
  }
  historyToast(lines: string[]) {
    const e = this.toasts.appendChild(h('div', 'toast history', `<strong>Thirty years on</strong>${lines.map(esc).join('<br>')}`));
    setTimeout(() => e.remove(), 6500 + lines.length * 1500);
  }
  setViewfinder(up: boolean) { this.el.vf.classList.toggle('up', up); }
  setHeld(url: string | null) {
    if (url) this.heldImg.src = url;
    this.el.held.style.opacity = '0';
  }
  flash(reduce: boolean) {
    const f = this.el.flash;
    f.classList.remove('go', 'soft');
    void f.offsetWidth;
    f.classList.add('go');
    if (reduce) f.classList.add('soft');
  }
  crossFx(on: boolean, reduce: boolean) { this.el.cross.classList.toggle('on', on); this.el.cross.classList.toggle('soft', reduce); }
  togglePerf() { this.perfOn = !this.perfOn; this.el.perf.classList.toggle('on', this.perfOn); }
  onWorldLoaded() { this.journalHintShown = this.g.docs.size > 0; }

  /** Per-frame HUD: prompt beside the focused object, viewfinder rect, held print alignment. */
  frame(dt: number) {
    const g = this.g, R = g.renderer;
    const c = g.world.case;
    const rect = R.viewfinderRect();
    const vf = this.el.vf;
    vf.style.left = `${rect.x}px`; vf.style.top = `${rect.y}px`; vf.style.width = `${rect.w}px`; vf.style.height = `${rect.h}px`;
    vf.classList.toggle('viable', !!g.vf.viable);
    (vf.querySelector('.vlabel') as HTMLElement).textContent = g.era === 'present' ? `${c.pastYear}, late summer` : `${c.presentYear}, rain`;
    (vf.querySelector('.vhint') as HTMLElement).textContent = g.vf.viable ? `${g.vf.viable.anchor.label}: a way through` : '';
    // prompt chip
    const pr = this.el.prompt;
    if (g.focus && !this.openScreen) {
      const p = g.focus.pos();
      R.project(P.set(p.x, p.y, p.z), Q);
      const x = Math.min(window.innerWidth - 260, Math.max(20, Q.z > 1 ? window.innerWidth / 2 : Q.x));
      const y = Math.min(window.innerHeight - 40, Math.max(40, Q.z > 1 ? window.innerHeight / 2 : Q.y));
      pr.style.left = `${x}px`; pr.style.top = `${y}px`;
      pr.innerHTML = `${key('E')}<span>${esc(g.focus.prompt() ?? '')}</span>`;
      pr.style.opacity = '1';
    } else pr.style.opacity = '0';
    // held print
    const al = g.heldAlign, held = this.el.held;
    if (g.held && al.visible && !g.vf.up) {
      const a = g.held.meta.anchorScreen!;
      held.style.left = `${rect.x - 10}px`; held.style.top = `${rect.y - 10}px`;
      held.style.width = `${rect.w + 20}px`; held.style.height = `${rect.h + 20}px`;
      held.style.transformOrigin = `${a.x - rect.x + 10}px ${a.y - rect.y + 10}px`;
      held.style.transform = `translate(${al.dx}px, ${al.dy}px) scale(${al.s})`;
      held.style.opacity = String(0.38 + 0.42 * al.score);
      held.classList.toggle('aligned', al.ok);
    } else held.style.opacity = '0';
    const chip = this.el.heldChip;
    if (g.held && !(al.visible && !g.vf.up)) chip.innerHTML = `<img alt="" src="${g.held.meta.thumb}"><span>Holding a print of the ${esc(g.held.meta.anchorId ? g.world.anchors.find((x) => x.id === g.held!.meta.anchorId)?.label.toLowerCase() ?? 'street' : 'street')}. Find the spot it was taken from. ${key('Q')} put away</span>`;
    else chip.innerHTML = '';
    // contextual hint
    this.el.hint.innerHTML = this.hintText();
    this.el.hint.classList.toggle('show', !!this.el.hint.innerHTML && !this.openScreen);
    const loc = g.world.layout.regions;
    void loc;
    this.el.status.innerHTML = `<span class="era">${g.era === 'present' ? `${c.presentYear}` : `${c.pastYear}`}</span><br>${g.era === 'present' ? 'Rain, blue hour' : 'Late summer afternoon'}`;
    this.el.dot.style.opacity = g.vf.up || this.openScreen ? '0' : '1';
    if (this.perfOn) {
      this.perfT -= dt;
      if (this.perfT < 0) {
        this.perfT = 0.25;
        const p = g.perf, n = p.frame.length;
        let sum = 0, cpu = 0, worst = 0, k = 0;
        for (let i = 0; i < 120; i++) { const j = (p.i - 1 - i + n) % n; if (!p.frame[j]) continue; sum += p.frame[j]; cpu += p.cpu[j]; worst = Math.max(worst, p.frame[j]); k++; }
        const s = R.stats, info = R.gl.info;
        this.el.perf.textContent = `frame ${(sum / Math.max(1, k)).toFixed(2)} ms (${(1000 / (sum / Math.max(1, k))).toFixed(0)} fps)  worst ${worst.toFixed(1)}\ncpu   ${(cpu / Math.max(1, k)).toFixed(2)} ms\ncalls main ${s.mainCalls}  viewfinder ${s.vfActive ? s.vfCalls : 'off'}\ntris  ${s.tris}\ngeo ${info.memory.geometries}  tex ${info.memory.textures}\nscale ${g.settings.renderScale}  shadows ${g.settings.shadows}`;
      }
    }
  }

  private hintText(): string {
    const g = this.g, t = g.progress.tutorial;
    if (g.held && g.heldAlign.visible && !g.vf.up) return g.heldAlign.ok ? `${key('E')}<span>Step through</span>` : '<span>Line the print up with the doorway</span>';
    if (g.vf.up && g.vf.viable) return `${key('Click')}<span>Photograph the ${g.vf.viable.anchor.label.toLowerCase()}</span>`;
    if (t === 0 && g.playTime > 1.2 && !g.vf.up) return `${key('C')}<span>Raise the camera</span>`;
    if (t === 1) return g.vf.up ? `${key('C')}<span>Lower the camera, raise it again as the tram passes</span>` : `${key('C')}<span>Raise the camera</span>`;
    if (t === 2 && g.era === 'present') return g.vf.up ? '<span>Frame the old station doorway</span>' : `${key('C')}<span>Raise the camera and frame the bricked-up doorway</span>`;
    if (t === 3 && !g.held && g.era === 'present') return `${key('C')}<span>Photograph the doorway, then line the print up</span>`;
    return '';
  }
}

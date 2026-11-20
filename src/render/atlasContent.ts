import { type CaseFile, person, routeName, train } from '../gen/history';
import type { Layout } from '../gen/layout';
import { PALETTES } from './palette';
import { Atlas, fitText, FONT_HAND, FONT_TYPE, FONT_UI } from './textures';

/** Painted lettering and paper for one generated world, both eras, in a single atlas. */
export function buildAtlas(c: CaseFile, l: Layout): Atlas {
  const A = new Atlas(2048);
  const P = PALETTES.present, Q = PALETTES.past;

  // Shop fascia signs: painted letters on a board, per era.
  const fascia = (id: string, text: string, bg: string, fg: string, gold = false) =>
    A.add(id, 384, 72, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = gold ? '#c9a35a' : 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
      if (!text) return;
      fitText(g, text, w - 36, 44, FONT_UI);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, w / 2 + 2, h / 2 + 4);
      g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
    });
  for (const f of l.facades) {
    if (!f.sign) continue;
    fascia(`sign.${f.id}.past`, f.sign.past, f.kind === 'station' ? '#c7b089' : '#5f7a63', f.kind === 'station' ? '#3b2f34' : '#f3e4c0', true);
    fascia(`sign.${f.id}.present`, f.sign.present, f.kind === 'cinema' ? '#1f2633' : '#2c3f47', f.kind === 'cinema' ? '#F1BB70' : '#cfd6d8');
  }
  // Ghost of removed station lettering in the present: holes where letters were fixed.
  A.add('sign.station.ghost', 384, 72, (g, w, h) => {
    g.fillStyle = '#4b5d6e'; g.fillRect(0, 0, w, h);
    fitText(g, 'CENTRAL STATION', w - 36, 44, FONT_UI);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(20,30,40,0.35)'; g.fillText('CENTRAL STATION', w / 2, h / 2 + 3);
  });

  // Departure board: past = lettered rows; present = blank slats with one lamp socket.
  const boardRows = c.trains.map((t) => [t.scheduled, t.label, t.sched === 'Stabled' ? `Stabled · P${t.platform}` : `${t.sched} · P${t.platform}`]);
  const board = (id: string, past: boolean) => A.add(id, 640, 320, (g, w, h) => {
    g.fillStyle = past ? '#1d2a2a' : '#141c26'; g.fillRect(0, 0, w, h);
    g.strokeStyle = past ? '#c9a35a' : '#3a4450'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = past ? '#e9dcc0' : '#58606a';
    g.font = `700 30px ${FONT_UI}`; g.textAlign = 'center';
    g.fillText(past ? 'DEPARTURES' : '', w / 2, 44);
    for (let i = 0; i < 4; i++) {
      const y = 70 + i * 52;
      g.fillStyle = past ? '#26353a' : '#1b242e'; g.fillRect(24, y, w - 120, 42);
      if (past) {
        g.fillStyle = '#efe3c6'; g.textAlign = 'left';
        g.font = `400 26px ${FONT_TYPE}`;
        const row = i < 3 ? boardRows[i] : ['23:00', 'STATION CLOSED', ''];
        g.fillText(row[0], 34, y + 30); g.fillText(row[1], 120, y + 30);
        g.textAlign = 'right'; g.fillText(row[2], w - 106, y + 30);
      }
    }
    // Lamp column on the right: platform lamps.
    for (let p = 1; p <= 2; p++) {
      const y = 92 + (p - 1) * 110;
      g.fillStyle = '#0d1218'; g.beginPath(); g.arc(w - 52, y, 26, 0, 7); g.fill();
      g.fillStyle = past ? '#e9dcc0' : 'rgba(120,120,120,0.3)'; g.font = `700 16px ${FONT_UI}`; g.textAlign = 'center';
      g.fillText(past ? `P${p}` : '', w - 52, y + 48);
    }
    if (past) { g.font = `400 17px ${FONT_TYPE}`; g.fillStyle = '#e9dcc0'; g.textAlign = 'left'; g.fillText(`Lamp lit: PLATFORM ${c.answerPlatform} LINE CLEAR`, 34, h - 22); }
  });
  board('board.past', true);
  board('board.present', false);

  // Clock face.
  const clock = (id: string, past: boolean) => A.add(id, 256, 256, (g, w) => {
    const r = w / 2 - 8;
    g.fillStyle = past ? '#f3ead6' : '#F1BB70'; g.beginPath(); g.arc(w / 2, w / 2, r, 0, 7); g.fill();
    g.strokeStyle = past ? '#3b2f34' : '#5a3a20'; g.lineWidth = 10; g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 ? 4 : 9;
      g.beginPath(); g.moveTo(w / 2 + Math.sin(a) * r * 0.78, w / 2 - Math.cos(a) * r * 0.78); g.lineTo(w / 2 + Math.sin(a) * r * 0.92, w / 2 - Math.cos(a) * r * 0.92); g.stroke();
    }
  });
  clock('clock.past', true);
  clock('clock.present', false);

  // Track diagram.
  A.add('diagram', 512, 352, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b2f34'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#3b2f34'; g.font = `700 22px ${FONT_UI}`; g.textAlign = 'center';
    g.fillText('CENTRAL STATION · TRACK DIAGRAM', w / 2, 44);
    g.lineWidth = 6; g.strokeStyle = '#C84F3C';
    for (let p = 1; p <= 2; p++) {
      const y = 110 + (p - 1) * 130;
      g.strokeStyle = '#3b2f34'; g.beginPath(); g.moveTo(40, y); g.lineTo(200, y); g.stroke();
      g.font = `700 20px ${FONT_UI}`; g.textAlign = 'left'; g.fillText(`P${p}`, 40, y - 12);
      const lines = c.platformLines[p as 1 | 2];
      lines.forEach((d, k) => {
        const ty = y + (k ? 40 : -40);
        g.strokeStyle = '#C84F3C'; g.beginPath(); g.moveTo(200, y); g.lineTo(290, ty); g.lineTo(330, ty); g.stroke();
        g.fillStyle = '#3b2f34'; g.font = `400 20px ${FONT_TYPE}`; g.fillText(d, 338, ty + 7);
      });
    }
    g.font = `400 15px ${FONT_TYPE}`; g.textAlign = 'right'; g.fillText(`Signal Dept. ${person(c, c.engineer).initials}`, w - 24, h - 22);
  });

  // Paper documents (small in-world, legible inspection happens in HTML).
  const paper = (id: string, lines: string[], opts: { bg?: string; stamp?: string; hand?: boolean; w?: number; h?: number } = {}) =>
    A.add(id, opts.w ?? 256, opts.h ?? 340, (g, w, h) => {
      g.fillStyle = opts.bg ?? '#eee6d5'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,60,40,0.12)'; g.fillRect(0, h - 10, w, 10);
      g.fillStyle = '#2b2a33'; g.textAlign = 'left';
      lines.forEach((ln, i) => { g.font = `${i === 0 ? 700 : 400} ${i === 0 ? 17 : 14}px ${opts.hand ? FONT_HAND : FONT_TYPE}`; g.fillText(ln.slice(0, 30), 16, 34 + i * 24); });
      if (opts.stamp) {
        g.save(); g.translate(w * 0.55, h * 0.72); g.rotate(-0.18);
        g.strokeStyle = '#8D4544'; g.fillStyle = '#8D4544'; g.lineWidth = 4; g.strokeRect(-90, -26, 180, 52);
        g.font = `700 16px ${FONT_UI}`; g.textAlign = 'center'; g.fillText(opts.stamp, 0, 6);
        g.restore();
      }
    });
  const sm = person(c, c.stationMaster), auth = person(c, c.authorizer);
  paper('notice', ['NOTICE', 'Station closes 23:00', 'No movements after', 'close except on', 'written order.', '', sm.name]);
  paper('slip.original', ['DISPATCH SLIP', 'Signal log, Box 3', 'Default carrier:', routeName(c, c.defaultRoute), '', 'Hold in archive.']);
  for (const r of ['print', 'depot'] as const) paper(`slip.dup.${r}`, ['DISPATCH SLIP (DUP.)', 'Signal log, Box 3', 'Despatched to:', routeName(c, r)], { stamp: r === 'print' ? `PRESS BAY ${c.pressBay}` : `SHELF ${c.shelfCode}` });
  paper('order', [`ORDER No. ${c.orderNo}`, `${c.orderReason}`, `${c.blockedDest}`, 'line blocked 22:00.', `Engine on P${c.answerPlatform} road`, 'to clear after close.', '', auth.name]);
  paper('note', ['Please keep the depot', `copy of Order ${c.orderNo}`, 'with the signal log.', '  - a friend'], { hand: true, bg: '#f4eedd', h: 160 });
  paper('log.cover', ['SIGNAL LOG', 'Central Station', `${c.pastYear}`, '', `Last entry 23:09`], { bg: '#3d3530', h: 300 });
  paper('poster.present', [c.cinema.toUpperCase(), 'Late show', 'tonight 23:00', '', 'Tram Street'], { bg: '#c9b48c' });
  paper('poster.past', ['TRAMWAY EXCURSION', 'Sunday to the Harbour', `${c.pastYear}`], { bg: '#e3d2a6' });

  // Crate labels.
  for (const r of ['print', 'depot'] as const) A.add(`label.${r}`, 256, 128, (g, w, h) => {
    g.fillStyle = '#efe3c6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b2f34'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#3b2f34'; g.textAlign = 'center';
    fitText(g, routeName(c, r).toUpperCase(), w - 30, 30, FONT_UI);
    g.fillText(routeName(c, r).toUpperCase(), w / 2, 60);
    g.font = `400 18px ${FONT_TYPE}`; g.fillText(r === 'print' ? `Press Bay ${c.pressBay}` : `Stores ${c.shelfCode}`, w / 2, 96);
  });

  // Brass plates.
  A.add('plate', 256, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#d8b66a'); grd.addColorStop(1, '#9c7a3c');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5c4520'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#3a2a10'; g.textAlign = 'center';
    fitText(g, c.printer.toUpperCase(), w - 40, 24, FONT_UI); g.fillText(c.printer.toUpperCase(), w / 2, 52);
    g.font = `700 30px ${FONT_UI}`; g.fillText(`BAY ${c.pressBay}`, w / 2, 94);
    for (const [x, y] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  });
  for (let b = 1; b <= 4; b++) A.add(`bay.${b}`, 128, 64, (g, w, h) => {
    g.fillStyle = '#c9a35a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2a10'; g.font = `700 26px ${FONT_UI}`; g.textAlign = 'center'; g.fillText(`BAY ${b}`, w / 2, h / 2 + 10);
  });

  // Locker numbers / stencils, shelf codes.
  const lockers = l.props.filter((p) => p.kind === 'locker');
  for (const lk of lockers) A.add(`locker.${lk.text}`, 96, 64, (g, w, h) => {
    g.fillStyle = '#3c5458'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e0cc'; g.font = `700 34px ${FONT_UI}`; g.textAlign = 'center'; g.fillText(String(lk.text), w / 2, h / 2 + 12);
  });
  A.add('stencil.transfer', 192, 160, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
    g.fillStyle = '#e8e0cc'; g.font = `700 24px ${FONT_TYPE}`; g.textAlign = 'center';
    g.fillText(`EX STORES`, w / 2, 40); g.font = `700 40px ${FONT_TYPE}`; g.fillText(c.shelfCode, w / 2, 88);
    g.font = `700 22px ${FONT_TYPE}`; g.fillText(`${c.depotRenovYear}`, w / 2, 128);
  });
  for (const sh of l.props.filter((p) => p.kind === 'shelf' && p.text)) A.add(`shelf.${sh.text}`, 128, 64, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b2f34'; g.font = `700 34px ${FONT_UI}`; g.textAlign = 'center'; g.fillText(String(sh.text), w / 2, h / 2 + 12);
  });
  A.add('rightofway', 256, 96, (g, w, h) => {
    g.fillStyle = '#2c3f47'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e0cc'; g.font = `700 22px ${FONT_UI}`; g.textAlign = 'center';
    g.fillText('PUBLIC RIGHT OF WAY', w / 2, 40); g.font = `400 16px ${FONT_TYPE}`; g.fillText(`gate open by custom since ${c.pastYear + 4}`, w / 2, 70);
  });
  A.add('tram.blind', 256, 64, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f3ead6'; g.font = `700 30px ${FONT_UI}`; g.textAlign = 'center'; g.fillText(`${(c.trains.length * 7) % 9 + 2}  HARBOUR`, w / 2, h / 2 + 11);
  });
  A.add('platforms.sign', 256, 64, (g, w, h) => {
    g.fillStyle = Q.enamel; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f3ead6'; g.font = `700 30px ${FONT_UI}`; g.textAlign = 'center'; g.fillText('PLATFORMS 1 · 2', w / 2, h / 2 + 11);
  });
  A.add('depot.office.sign', 192, 48, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b2f34'; g.font = `700 22px ${FONT_UI}`; g.textAlign = 'center'; g.fillText('FOREMAN · PRIVATE', w / 2, h / 2 + 8);
  });
  A.add('calendar', 160, 220, (g, w, h) => {
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
    g.fillStyle = P.enamel; g.fillRect(0, 0, w, 70);
    g.fillStyle = '#2b2a33'; g.font = `400 16px ${FONT_TYPE}`;
    for (let i = 0; i < 5; i++) for (let k = 0; k < 7; k++) g.fillText(String(i * 7 + k + 1), 10 + k * 21, 100 + i * 24);
  });
  void train;
  A.finish();
  return A;
}

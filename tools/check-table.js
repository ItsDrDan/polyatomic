// Oxyanion Table checker: node tools/check-table.js
// Checks the table cells, tiles and typed-answer grading against an independent copy of the
// Green Sheet -ate table (written out here, not read from the game).
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = html.split('<script>').map(x => x.split('</script>')[0]).find(x => x.includes('/*OT-LOGIC-START*/'));
if (!block) throw new Error('OT logic block not found');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(block + '\n;this.G={OT_LAYOUT,OT_IONS,otPat,otKey,otFits,otTiles,otWhy,otGrade,MODES,COLUMN_TIP};', ctx);
const G = ctx.G; let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; if (fail < 25) console.log('FAIL', m); } };
// Green Sheet staircase, row by row: [element, O count, charge, name]
const REF = [
  [['B', 3, -3, 'borate'], ['C', 3, -2, 'carbonate'], ['N', 3, -1, 'nitrate'], null],
  [['Si', 3, -2, 'silicate'], ['P', 4, -3, 'phosphate'], ['S', 4, -2, 'sulfate'], ['Cl', 3, -1, 'chlorate']],
  [null, ['As', 4, -3, 'arsenate'], ['Se', 4, -2, 'selenate'], ['Br', 3, -1, 'bromate']],
  [null, null, ['Te', 4, -2, 'tellurate'], ['I', 3, -1, 'iodate']]
].flat();
const sub = d => (d > 1 ? d : ''), chg = q => (Math.abs(q) === 1 ? '' : Math.abs(q)) + (q < 0 ? '-' : '+');
ok(G.OT_LAYOUT.length === 16, 'layout 16 slots');
REF.forEach((r, i) => {
  const name = G.OT_LAYOUT[i];
  if (!r) return ok(name === null, `slot ${i} blank`);
  ok(name === r[3], `slot ${i} is ${r[3]} (got ${name})`);
  const ion = G.OT_IONS.find(x => x.name === r[3]); ok(!!ion, r[3] + ' in game');
  if (!ion) return;
  const p = G.otPat(ion); ok(p.el === r[0] && p.o === r[1] && p.q === r[2], `${r[3]} pattern ${JSON.stringify(p)}`);
  ok(!!G.COLUMN_TIP[r[0]], `${r[0]} has a column tip`);
  // typed answers: every accepted style passes, common mistakes fail with a note
  const base = r[0] + 'O' + sub(r[1]), m = Math.abs(r[2]);
  for (const t of [base + '^' + chg(r[2]), base + chg(r[2]), base + (r[2] < 0 ? '-' : '+') + (m > 1 ? m : ''), r[0] + 'O' + (r[1] > 1 ? String.fromCharCode(0x2080 + r[1]) : '') + (m > 1 ? String.fromCharCode([0x2070, 0xb9, 0xb2, 0xb3][m]) : '') + '⁻'])
    ok(G.otGrade(t, ion, 1).ok, `${r[3]} accepts "${t}"`);
  const wrongs = [base, r[0] + 'O' + sub(r[1] === 3 ? 4 : 3) + '^' + chg(r[2]), base + '^' + chg(r[2] === -1 ? -2 : -1), base + '^' + m + '+', r[0].toUpperCase() + 'O' + sub(r[1]) + '^' + chg(r[2]), 'XeO4^2-'];
  for (const w of wrongs) { if (w === base + '^' + chg(r[2])) continue; const g = G.otGrade(w, ion, 1); if (r[0].length === 1 && w.startsWith(r[0].toUpperCase() + 'O' + sub(r[1]) + '^')) continue; ok(!g.ok && g.note && g.note.length > 15, `${r[3]} rejects "${w}" with a note`); }
  ok(G.otGrade('XeO4^2-', ion, 2).note.includes(G.COLUMN_TIP[r[0]]), `${r[3]} 2nd miss adds the column tip`);
});
// tiles: one per cell, every tile fits at least its own cell, multiset of patterns matches
for (let k = 0; k < 200; k++) {
  const t = G.otTiles(); ok(t.length === 12, 'tile count');
  const want = REF.filter(Boolean).map(r => r[1] + '|' + r[2]).sort().join(), got = [...t].sort().join(); ok(want === got, 'tile patterns match the table');
}
// fit rule matches the reference for every tile pattern × cell
const keys = [...new Set(REF.filter(Boolean).map(r => r[1] + '|' + r[2]))];
for (const key of keys) for (const r of REF.filter(Boolean)) {
  const ion = G.OT_IONS.find(x => x.name === r[3]), fits = key === r[1] + '|' + r[2];
  ok(G.otFits(key, ion) === fits, `${key} on ${r[0]}`);
  if (!fits) { const w = G.otWhy(key, ion, 1), [o, q] = key.split('|').map(Number); ok(w.length > 40, 'why text');
    ok((o !== r[1]) === /O count does not|Both/.test(w) && (q !== r[2]) === /charge does not|Both/.test(w), `why names the right part: ${key} on ${r[0]}`);
    ok(!/undefined|NaN/.test(w) && !/undefined|NaN/.test(G.otWhy(key, ion, 2)), 'no junk text'); }
}
// a greedy random player always completes the tile table (no dead ends)
for (let k = 0; k < 500; k++) {
  const tiles = G.otTiles().map(key => ({ key, used: false })), left = new Set(REF.filter(Boolean).map(r => r[3]));
  while (left.size) { const i = tiles.findIndex(t => !t.used), name = [...left].find(nm => G.otFits(tiles[i].key, G.OT_IONS.find(x => x.name === nm))); if (!name) break; tiles[i].used = true; left.delete(name); }
  ok(left.size === 0, 'tiles always complete');
}
ok(G.MODES.table && G.MODES.table.label === 'Oxyanion Table', 'mode registered');
console.log(`${n} checks: ${fail ? fail + ' FAILED' : 'all passed'}`);
process.exit(fail ? 1 : 0);

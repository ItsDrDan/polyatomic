// Ion Builder checker: node tools/check-builder.js [draws]
// Runs the game's data + IB logic in a sandbox and checks every builder question
// against an independent rule set: charge = (-ate parent charge) + (number of H⁺);
// per = ate+1 O, ite = ate−1 O, hypo = ate−2 O; O changes never change the charge.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = html.split('<script>').map(x => x.split('</script>')[0]).find(x => x.includes('/*IB-LOGIC-START*/'));
if (!block) throw new Error('IB logic block not found');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(block + '\n;this.G={ions,ALL,FAMILIES,MEMBER,parseIon,ibPairs,ibSpec,ibComp,ibStep,ibCan,ibIon,ibBase,ibCharge,ibSame,ibApplyPairs,gradeFormula,qFamily,IB_PRED,chargeOf,baseOf};', ctx);
const G = ctx.G; let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; if (fail < 25) console.log('FAIL', m); } };
// independent reference: -ate O count per central atom and charge, from the Green Sheet table
const ATE = { B: [3, -3], C: [3, -2], N: [3, -1], Si: [3, -2], P: [4, -3], S: [4, -2], Cl: [3, -1], As: [4, -3], Se: [4, -2], Br: [3, -1], Te: [4, -2], I: [3, -1] };
const DO = { per: 1, ate: 0, ite: -1, hypo: -2 };
function refIon(ion) { // expected composition from the naming rules alone
  const m = G.MEMBER.get(ion), c = Object.keys(ATE).find(k => G.FAMILIES.find(F => F.id === k) === m.fam) || m.fam.id;
  const [o, q] = ATE[m.fam.id]; return { o: o + DO[m.level], h: m.h, q: q + m.h };
}
function formulaOf(c, o, h) { return (h ? 'H' + (h > 1 ? h : '') : '') + c + 'O' + (o > 1 ? o : ''); }
// 1. every family member (non-thio) matches the reference and the game's data
for (const F of G.FAMILIES) for (const [name, level] of F.members) {
  if (level === 'thio') continue; const ion = G.ALL.find(i => i.name === name), r = refIon(ion), s = G.ibComp(ion);
  ok(s.o === r.o && s.h === r.h && G.ibCharge(s) === r.q, `${name} comp ${JSON.stringify(s)} vs ref ${JSON.stringify(r)}`);
  ok(G.ibBase(s) === G.parseIon(ion.formulas[0]).base, `${name} base ${G.ibBase(s)}`);
  ok(G.ibIon(s) === ion, `${name} lookup`);
}
// 2. every builder pair: reachable with the buttons, predict/explain answers right
const pairs = G.ibPairs(); ok(pairs.length > 20, 'pairs ' + pairs.length);
for (const [F, g, t] of pairs) {
  const a = refIon(g), b = refIon(t), dh = b.h - a.h, dO = b.o - a.o;
  // BFS over button presses within the limits
  const start = G.ibComp(g), goal = G.ibComp(t), seen = new Set([JSON.stringify(start)]); let frontier = [start], found = false, steps = 0;
  while (frontier.length && !found && steps < 12) { const nx = []; for (const s of frontier) for (const k of ['o+', 'o-', 'h+', 'h-']) { if (!G.ibCan(s, k)) continue; const s2 = G.ibStep(s, k); ok(G.ibCharge(s2) < 0, 'ion stayed negative'); if (G.ibSame(s2, goal)) found = true; const key = JSON.stringify(s2); if (!seen.has(key)) { seen.add(key); nx.push(s2); } } frontier = nx; steps++; }
  ok(found, `${g.name} → ${t.name} reachable`);
  ok(steps === Math.abs(dh) + Math.abs(dO), `${g.name} → ${t.name} shortest path ${steps}`);
  // O press never changes charge; H press changes it by exactly 1
  const s0 = G.ibComp(g);
  if (G.ibCan(s0, 'o+')) ok(G.ibCharge(G.ibStep(s0, 'o+')) === G.ibCharge(s0), 'O neutral');
  if (G.ibCan(s0, 'h+')) ok(G.ibCharge(G.ibStep(s0, 'h+')) === G.ibCharge(s0) + 1, 'H+ is +1');
  ok(G.ibApplyPairs(F, g, t).length > 0, `${g.name} → ${t.name} has an apply pair`);
}
// 3. random specs
const draws = +process.argv[2] || 3000;
for (let i = 0; i < draws; i++) {
  const S = G.ibSpec(), a = refIon(S.given), b = refIon(S.target);
  ok(S.dh === b.h - a.h && S.dO === b.o - a.o, 'deltas');
  ok(+S.predict.answer === b.q - a.q, `predict answer ${S.predict.answer} vs ${b.q - a.q}`);
  ok(S.predict.opts.length >= 3 && S.predict.opts.some(o => o[0] === S.predict.answer) && S.predict.opts.every(o => G.IB_PRED[o[0]]), 'predict opts');
  const kind = S.dh && S.dO ? 'both' : S.dh ? 'H' : 'O'; ok(S.kind === kind, 'kind');
  ok(S.explain.opts.filter(o => o[0] === S.explain.answer).length === 1 && S.explain.opts.every(o => o[0] === S.explain.answer || o[2].length > 20), 'explain whys');
  ok(S.apply && S.apply.fam !== S.fam, 'apply in another family');
  const A = S.apply, a2 = refIon(A.given), b2 = refIon(A.target);
  ok(b2.h - a2.h === S.dh && b2.o - a2.o === S.dO, `apply same change ${A.given.name}→${A.target.name}`);
  const q = G.qFamily({ fam: A.fam, given: A.given, target: A.target, dir: 'formula' });
  const typed = formulaOf(A.fam.id, b2.o, b2.h) + '^' + (Math.abs(b2.q) === 1 ? '' : Math.abs(b2.q)) + '-';
  ok(q.check(typed).ok, `apply accepts ${typed}`);
  ok(!q.check(formulaOf(A.fam.id, b2.o, b2.h) + '^' + Math.abs(a2.q) + '-').ok || a2.q === b2.q, 'apply rejects starting charge');
  ok(!/\bundefined\b|NaN/.test(JSON.stringify(S.predict) + JSON.stringify(S.explain)), 'no junk text');
}
console.log(`${n} checks on ${pairs.length} builder pairs and ${draws} questions: ${fail ? fail + ' FAILED' : 'all passed'}`);
process.exit(fail ? 1 : 0);

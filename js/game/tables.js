// Crane Tables: the 2, 5 and 10 times tables with rows of containers on the ship.
// Level 1 Load: Finn loads rows with the crane while the count goes 5, 10, 15, then says how many.
// Level 2 Count: an array of rows on the deck; how many boxes?
// Level 3 Quick: facts, missing numbers and sharing into rows, with Show me.
import { completeRound, addTally } from './progress.js';
import { ask, choices, pickWeighted, sleep, shuffle, cheer, say } from './common.js';
import * as audio from '../audio.js';

const ROUND = 8;

export class Tables {
  constructor(app) { this.app = app; this.ui = app.ui; this.st = app.stage; }

  async run(key, level) {
    const ui = this.ui, st = this.st;
    ui.question('The ship is getting ready…', false);
    ui.counter(null);
    await st.tablesReady(s => ui.feedback(s));
    ui.feedback('');
    const pickT = () => (key === 'mix' ? [2, 5, 10][Math.floor(Math.random() * 3)] : Number(key));
    let summary;
    if (level === 1) summary = await this.load(pickT());
    else if (level === 2) summary = await this.count(key, pickT);
    else summary = await this.quick(key, pickT);
    const { patch, first } = completeRound('tables', key, level);
    st.voyage();
    addTally('voyages');
    return ui.patch(patch, summary, first);
  }

  // ---- level 1: load the ship ---------------------------------------------------------------------------
  async load(t) {
    const ui = this.ui, st = this.st;
    await st.prepTables(t);
    const plan = shuffle([[3, 2, 3, 2], [2, 3, 2, 3], [4, 2, 2, 2], [2, 2, 3, 3], [3, 3, 2, 2]])[0];
    let rows = 0;
    ui.dots(0, plan.length);
    for (let qi = 0; qi < plan.length; qi++) {
      const k = plan[qi];
      ui.sentence(''); ui.feedback('');
      ui.question(qi === 0 ? `Load <em>${k} rows</em> of ${t}.` : `Load <em>${k} more rows</em> of ${t}.`);
      ui.counter(rows * t, rows ? `boxes on the ship` : 'boxes on the ship');
      ui.help(null);
      for (let i = 0; i < k; i++) {
        const tap = ui.big(rows === 0 ? 'Load a row' : 'Load the next row', 'crane');
        st.hintRow(rows);
        await tap;
        ui.bigEnabled(false);
        await st.loadRow(rows, t);
        rows++;
        ui.counter(rows * t, `boxes on the ship`);
        st.rowLabel(rows - 1, rows * t, 1.8);
        audio.countNote(rows - 1);
        say(String(rows * t), { interrupt: true });
        addTally('boxes', t);
      }
      ui.clearAct();
      await sleep(1.0);
      st.clearLabels();
      const ans = rows * t;
      ui.counter('?', '');
      ui.question(`<em>${rows} rows</em> of ${t}. How many boxes?`);
      ui.help(() => st.countRows(rows, t, { voice: true }));
      await ask(ui, ans, choices(ans, t, t, 10 * t + 2 * t), `${t}x${rows}`, () => st.countRows(rows, t, { voice: true }));
      ui.help(null);
      ui.counter(ans, 'boxes on the ship');
      ui.sentence(`<span class="eq">${rows} × ${t} = ${ans}</span>`);
      ui.feedback(`${cheer()} ${rows} rows of ${t} make ${ans}.`, true);
      await say(`${cheer()} ${rows} rows of ${t} make ${ans}.`);
      ui.dots(qi + 1, plan.length);
      await sleep(0.5);
    }
    ui.question(`The ship is full! 10 rows of ${t} make ${10 * t}.`);
    await sleep(1.2);
    return `You loaded ${10 * t} boxes in rows of ${t}.`;
  }

  // ---- level 2: count the cargo ---------------------------------------------------------------------------
  async count(key, pickT) {
    const ui = this.ui, st = this.st;
    let last = null, firstTry = 0;
    ui.dots(0, ROUND);
    for (let q = 0; q < ROUND; q++) {
      const t = pickT();
      const n = pickWeighted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], n => `${t}x${n}`, last);
      last = n;
      ui.sentence(''); ui.feedback(''); ui.clearAct();
      ui.counter('?', '');
      await st.showRows(n, t);
      ui.question(`How many boxes are on the ship?`, true, `How many boxes are on the ship? ${n} rows of ${t}.`);
      ui.counter('?', `${n} rows of ${t}`);
      ui.help(() => st.countRows(n, t, { voice: true }));
      const ans = n * t;
      if (await ask(ui, ans, choices(ans, t, t, 10 * t + 2 * t), `${t}x${n}`, () => st.countRows(n, t, { voice: true }))) firstTry++;
      ui.help(null);
      ui.counter(ans, `${n} rows of ${t}`);
      ui.sentence(`<span class="eq">${n} × ${t} = ${ans}</span>`);
      ui.feedback(`${cheer()} ${n} rows of ${t} make ${ans}.`, true);
      await st.countRows(n, t, { fast: true });
      await say(`${n} rows of ${t} make ${ans}.`);
      ui.dots(q + 1, ROUND);
      await sleep(0.4);
    }
    st.clearLabels();
    return `You counted ${ROUND} shiploads${firstTry >= 6 ? ', most of them first time' : ''}.`;
  }

  // ---- level 3: quick facts ------------------------------------------------------------------------------
  async quick(key, pickT) {
    const ui = this.ui, st = this.st;
    let last = null;
    ui.dots(0, ROUND);
    const kinds = shuffle(['times', 'times', 'times', 'missing', 'share', 'times', 'missing', 'share']);
    for (let q = 0; q < ROUND; q++) {
      const t = pickT();
      const n = pickWeighted([2, 3, 4, 5, 6, 7, 8, 9, 10, 1], n => `${t}x${n}`, last);
      last = n;
      const A = n * t;
      ui.sentence(''); ui.feedback(''); ui.clearAct();
      await st.showRows(0, t);
      let text, spoken, ans, opts;
      if (kinds[q] === 'times') {
        text = `<span class="eq">${n} × ${t} = ?</span>`; spoken = `${n} times ${t}?`; ans = A; opts = choices(A, t, 0, 10 * t + 2 * t);
      } else if (kinds[q] === 'missing') {
        text = `How many rows of ${t} make ${A}?<br><span class="eq">? × ${t} = ${A}</span>`; spoken = `How many rows of ${t} make ${A}?`; ans = n; opts = choices(n, 1, 1, 12);
      } else {
        text = `${A} boxes go in rows of ${t}. How many rows?`; spoken = text; ans = n; opts = choices(n, 1, 1, 12);
      }
      ui.question(text, true, spoken);
      ui.counter(null);
      const show = async () => { await st.showRows(n, t); await st.countRows(n, t, { voice: true }); };
      ui.help(show);
      await ask(ui, ans, opts, `${t}x${n}`, show);
      ui.help(null);
      ui.sentence(`<span class="eq">${n} × ${t} = ${A}</span>`);
      ui.feedback(`${cheer()} ${n} rows of ${t} make ${A}.`, true);
      await st.showRows(n, t);
      await st.countRows(n, t, { fast: true });
      await say(`${n} times ${t} is ${A}.`);
      ui.dots(q + 1, ROUND);
      await sleep(0.4);
    }
    st.clearLabels();
    return `${ROUND} quick facts, captain!`;
  }
}

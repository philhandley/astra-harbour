// Gulls on the Roof: number bonds to 10 and 20 with real gulls on the fish shed's roof pegs (red five, white five).
// Level 1 Left: Finn sounds the horn, some gulls fly off; how many are left?
// Level 2 Flew: the same, but how many flew away? (the empty pegs)
// Level 3 Back: some gulls are on the roof; how many more can land so every peg has a gull?
import { completeRound } from './progress.js';
import { ask, choices, pickWeighted, sleep, cheer, say } from './common.js';
import * as audio from '../audio.js';

const ROUND = 8;

export class Gulls {
  constructor(app) { this.app = app; this.ui = app.ui; this.st = app.stage; }

  async run(key, level) {
    const ui = this.ui, st = this.st;
    const N = Number(key);
    ui.question('The gulls are coming in to land…', false);
    ui.counter(null);
    await st.gullsReady(N);
    let last = null;
    ui.dots(0, ROUND);
    for (let q = 0; q < ROUND; q++) {
      const cands = [];
      for (let k = 1; k < N; k++) cands.push(k);
      const k = pickWeighted(cands, v => `g${N}:${Math.min(v, N - v)}`, last);   // k gulls fly away / are missing
      last = k;
      const left = N - k;
      const fid = `g${N}:${Math.min(k, left)}`;
      ui.sentence(''); ui.feedback(''); ui.clearAct(); ui.help(null);
      if (level === 3) {
        await st.setGulls(left);
        ui.question(`<em>${left}</em> gulls on the roof. How many more can land, so every peg has a gull?`);
        ui.counter(left, 'gulls on the roof');
        const help = () => st.countGulls('empty', { voice: true });
        ui.help(help);
        await ask(ui, k, choices(k, 1, 1, N - 1), fid, help);
        ui.help(null);
        let n = left;
        await st.gullsLand(k, () => { n++; ui.counter(n, 'gulls on the roof'); audio.countNote(n - 1); });
        ui.sentence(`<span class="eq">${left} + ${k} = ${N}</span>`);
        ui.feedback(`${cheer()} ${left} and ${k} make ${N}.`, true);
        await say(`${left} and ${k} make ${N}.`);
      } else {
        await st.setGulls(N);
        ui.question(`${N} gulls on the roof. Sound the horn!`);
        ui.counter(N, 'gulls on the roof');
        await ui.big('Sound the horn', 'horn');
        ui.clearAct();
        st.horn();
        await sleep(0.3);
        await st.gullsFlyAway(k);
        ui.counter('?', 'gulls on the roof');
        if (level === 1) {
          ui.question('How many gulls are <em>left</em> on the roof?');
          const help = () => st.countGulls('left', { voice: true });
          ui.help(help);
          await ask(ui, left, choices(left, 1, 0, N), fid, help);
          ui.sentence(`<span class="eq">${N} − ${k} = ${left}</span>`);
          ui.feedback(`${cheer()} ${k} flew away and ${left} are left.`, true);
          await say(`${N} take away ${k} leaves ${left}.`);
        } else {
          ui.question('How many gulls <em>flew away</em>?');
          const help = () => st.countGulls('empty', { voice: true });
          ui.help(help);
          await ask(ui, k, choices(k, 1, 1, N), fid, help);
          ui.sentence(`<span class="eq">${left} + ${k} = ${N}</span>`);
          ui.feedback(`${cheer()} ${k} flew away. ${left} and ${k} make ${N}.`, true);
          await say(`${left} and ${k} make ${N}.`);
        }
        ui.help(null);
        ui.counter(left, 'gulls on the roof');
      }
      ui.dots(q + 1, ROUND);
      await sleep(0.7);
    }
    const { patch, first } = completeRound('gulls', key, level);
    // a happy flurry: every gull lifts off, then they all come back to roost
    st.horn();
    await st.gullsFlyAway(st.gullsCount());
    st.setGulls(N);
    return ui.patch(patch, `${ROUND} gull puzzles solved!`, first);
  }
}

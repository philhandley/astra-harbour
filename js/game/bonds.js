// Fish Bonds: number bonds to 10 and 20 with the fishing boats' ten-frame decks (two boats make 20).
// Level 1 Fill: add crates until the boat is full, then say how many you added.
// Level 2 More: how many more to fill it? (and some "go to market" take-aways)
// Level 3 Quick: pairs and take-aways as number sentences, with Show me.
import { completeRound, addTally } from './progress.js';
import { ask, choices, pickWeighted, sleep, shuffle, cheer, say } from './common.js';
import * as audio from '../audio.js';

const ROUND = 8;

export class Bonds {
  constructor(app) { this.app = app; this.ui = app.ui; this.st = app.stage; }

  async run(key, level) {
    const ui = this.ui, st = this.st;
    const target = Number(key);
    ui.question('The fishing boats are getting ready…', false);
    await st.bondsReady(target);
    let summary;
    if (level === 1) summary = await this.fill(target);
    else if (level === 2) summary = await this.more(target);
    else summary = await this.quick(target);
    const { patch, first } = completeRound('bonds', key, level);
    st.parade();
    return ui.patch(patch, summary, first);
  }

  pickA(target, last) {
    const cands = [];
    for (let a = 1; a < target; a++) cands.push(a);
    return pickWeighted(cands, a => `b${target}:${Math.min(a, target - a)}`, last);
  }

  // ---- level 1: fill the boat ---------------------------------------------------------------------------
  async fill(target) {
    const ui = this.ui, st = this.st;
    let last = null;
    ui.dots(0, ROUND);
    const boats = target === 20 ? 'boats' : 'boat';
    for (let q = 0; q < ROUND; q++) {
      const a = this.pickA(target, last); last = a;
      const b = target - a;
      ui.sentence(''); ui.feedback(''); ui.help(null);
      await st.prepBoats(target, a);
      ui.question(`Fill the ${boats}! Add crates until there are <em>${target}</em>.`);
      ui.counter(a, 'crates on board');
      let added = 0;
      st.onSlotTap = null;
      while (added < b) {
        const tap = ui.big('Add a crate', 'crate');
        // tapping an empty place on the deck works too
        const tapDeck = new Promise(res => { st.onSlotTap = () => res(true); });
        await Promise.race([tap, tapDeck]);
        st.onSlotTap = null;
        ui.bigEnabled(false);
        await st.addCrate();
        added++;
        ui.counter(a + added, 'crates on board');
        audio.countNote(a + added - 1);
        say(String(a + added));
        addTally('crates');
      }
      ui.clearAct();
      await sleep(0.7);
      ui.question(`Full! There were ${a}. How many did you add?`);
      ui.counter(target, 'crates on board');
      const help = () => st.countCrates('added', { voice: true });
      ui.help(help);
      await ask(ui, b, choices(b, 1, 1, target - 1), `b${target}:${Math.min(a, b)}`, help);
      ui.help(null);
      ui.sentence(`<span class="eq">${a} + ${b} = ${target}</span>`);
      ui.feedback(`${cheer()} ${a} and ${b} make ${target}.`, true);
      await say(`${a} and ${b} make ${target}.`);
      ui.dots(q + 1, ROUND);
      await st.toMarket();
    }
    return `You filled ${ROUND} boats with ${target} crates each.`;
  }

  // ---- level 2: how many more? ----------------------------------------------------------------------------
  async more(target) {
    const ui = this.ui, st = this.st;
    let last = null;
    ui.dots(0, ROUND);
    const kinds = shuffle(['more', 'more', 'more', 'more', 'more', 'away', 'away', 'more']);
    for (let q = 0; q < ROUND; q++) {
      const a = this.pickA(target, last); last = a;
      const b = target - a;
      ui.sentence(''); ui.feedback(''); ui.clearAct();
      if (kinds[q] === 'more') {
        await st.prepBoats(target, a);
        ui.question(`<em>${a}</em> crates on board. How many more make ${target}?`);
        ui.counter(a, 'crates on board');
        const help = () => st.countCrates('empty', { voice: true });
        ui.help(help);
        await ask(ui, b, choices(b, 1, 0, target), `b${target}:${Math.min(a, b)}`, help);
        ui.help(null);
        ui.sentence(`<span class="eq">${a} + ${b} = ${target}</span>`);
        ui.feedback(`${cheer()} ${a} and ${b} make ${target}.`, true);
        for (let i = 0; i < b; i++) { await st.addCrate(true); ui.counter(a + i + 1, 'crates on board'); audio.countNote(a + i); }
        await say(`${a} and ${b} make ${target}.`);
      } else {
        await st.prepBoats(target, target);
        ui.question(`${target} crates. <em>${b}</em> go to market. How many are left?`);
        ui.counter(target, 'crates on board');
        const help = () => st.countCrates('last', { n: b, voice: true });
        ui.help(help);
        await ask(ui, a, choices(a, 1, 0, target), `b${target}:${Math.min(a, b)}`, help);
        ui.help(null);
        ui.sentence(`<span class="eq">${target} − ${b} = ${a}</span>`);
        ui.feedback(`${cheer()} ${target} take away ${b} leaves ${a}.`, true);
        await st.removeCrates(b);
        ui.counter(a, 'crates on board');
        await say(`${target} take away ${b} leaves ${a}.`);
      }
      ui.dots(q + 1, ROUND);
      await sleep(0.5);
      await st.toMarket();
    }
    return `${ROUND} boat puzzles solved.`;
  }

  // ---- level 3: quick pairs ---------------------------------------------------------------------------------
  async quick(target) {
    const ui = this.ui, st = this.st;
    let last = null;
    ui.dots(0, ROUND);
    const kinds = shuffle(['a+?', '?+b', 't-a', 'a+?', '?+b', 't-a', 'a+?', 't-?']);
    for (let q = 0; q < ROUND; q++) {
      const a = this.pickA(target, last); last = a;
      const b = target - a;
      ui.sentence(''); ui.feedback(''); ui.clearAct(); ui.counter(null);
      await st.prepBoats(target, 0);
      let text, ans;
      switch (kinds[q]) {
        case 'a+?': text = `${a} + ? = ${target}`; ans = b; break;
        case '?+b': text = `? + ${b} = ${target}`; ans = a; break;
        case 't-a': text = `${target} − ${a} = ?`; ans = b; break;
        default: text = `${target} − ? = ${a}`; ans = b;
      }
      ui.question(`<span class="eq">${text}</span>`, true, text);
      const show = async () => { await st.prepBoats(target, a); await st.countCrates('empty', { voice: true }); };
      ui.help(show);
      await ask(ui, ans, choices(ans, 1, 0, target), `b${target}:${Math.min(a, b)}`, show);
      ui.help(null);
      ui.sentence(`<span class="eq">${a} + ${b} = ${target}</span>`);
      ui.feedback(`${cheer()} ${a} and ${b} make ${target}.`, true);
      await st.prepBoats(target, a);
      for (let i = 0; i < b; i++) { await st.addCrate(true); audio.countNote(a + i); }
      await say(`${a} and ${b} make ${target}.`);
      ui.dots(q + 1, ROUND);
      await sleep(0.4);
    }
    return `${ROUND} quick pairs to ${target}!`;
  }
}

// Read-aloud with the browser's speech voices, preferring a British English voice. Maths symbols are spoken as words.
//
// Android Chrome quirks this works around:
// - speak() straight after cancel() is silently dropped, so we only cancel when something is actually talking,
//   and then wait a moment before speaking;
// - a voice object picked from getVoices() can belong to an engine that is not ready, and then nothing is said, so
//   on Android we only ask for the language (en-GB) and let the system pick its voice;
// - an utterance that gets garbage-collected stops mid-word, so we keep hold of the last few;
// - the speech engine can be left paused, so we resume() before speaking.
const ANDROID = /Android/i.test(navigator.userAgent);
let voice = null, enabled = true;
const keep = [];

function pickVoice() {
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const pref = ['Google UK English Female', 'Microsoft Libby', 'Microsoft Sonia', 'Serena', 'Kate', 'Martha', 'Google UK English Male', 'Microsoft Ryan'];
  for (const name of pref) { const v = vs.find(x => x.name.includes(name)); if (v) return v; }
  return vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if (window.speechSynthesis) {
  voice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
  // The first tap unlocks speech on some devices: say nothing, quietly.
  const unlock = () => {
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'en-GB'; keep.push(u); speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
}

export function setVoice(on) { enabled = on; if (!on) stop(); }
export function voiceOn() { return enabled; }
export function stop() {
  try { if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}

export function spoken(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' shared by ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s[−-]\s/g, ' take away ')
    .replace(/=/g, ' is ')
    .replace(/\?(\s*(times|plus|take away|is|shared))/g, ' what$1')
    .replace(/((times|plus|take away|is|shared by)\s*)\?/g, '$1 what ')
    .replace(/\s+/g, ' ').trim();
}

// Speak and resolve when finished (or after a timeout, since some devices never fire onend).
export function say(text, opts = {}) {
  if (!enabled || !window.speechSynthesis || !text) return Promise.resolve();
  const synth = window.speechSynthesis;
  let busy = false;
  try { busy = synth.speaking || synth.pending; } catch (e) { /* ignore */ }
  if (busy && opts.interrupt !== false) { try { synth.cancel(); } catch (e) { /* ignore */ } }
  return new Promise(res => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    const go = () => {
      const u = new SpeechSynthesisUtterance(spoken(text));
      if (voice && !ANDROID) u.voice = voice;
      u.lang = voice && !ANDROID ? voice.lang : 'en-GB';
      u.rate = opts.rate || 0.95;
      u.pitch = opts.pitch || 1.05;
      u.onend = fin; u.onerror = fin;
      keep.push(u); if (keep.length > 6) keep.shift();
      try { synth.resume(); synth.speak(u); } catch (e) { fin(); }
    };
    setTimeout(fin, 1200 + String(text).length * 90);
    // straight after a cancel, give the engine a moment or it drops the new line
    if (busy && opts.interrupt !== false) setTimeout(go, 150); else go();
  });
}

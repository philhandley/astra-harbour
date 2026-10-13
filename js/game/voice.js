// Read-aloud with the browser's speech voices, preferring a British English voice. Maths symbols are spoken as words.
let voice = null, enabled = true;

function pickVoice() {
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const pref = ['Google UK English Female', 'Microsoft Libby', 'Microsoft Sonia', 'Serena', 'Kate', 'Martha', 'Google UK English Male', 'Microsoft Ryan'];
  for (const name of pref) { const v = vs.find(x => x.name.includes(name)); if (v) return v; }
  return vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if (window.speechSynthesis) {
  voice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

export function setVoice(on) { enabled = on; if (!on) stop(); }
export function voiceOn() { return enabled; }
export function stop() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

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
  if (opts.interrupt !== false) stop();
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(spoken(text));
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-GB';
    u.rate = opts.rate || 0.95;
    u.pitch = opts.pitch || 1.05;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 900 + String(text).length * 90);
    try { speechSynthesis.speak(u); } catch (e) { fin(); }
  });
}

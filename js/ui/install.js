// Our own Install button.
// On Android, Chrome's menu (Add to home screen) says "This app is already installed" whenever ANY app from the
// same site is installed, and every Astra app shares philhandley.github.io; "open the app instead" then fails.
// Chrome's install offer to the page (beforeinstallprompt) checks this app's own address instead, so a button
// that uses it still installs Jelly Harbour. index.html catches the offer early, before the modules have loaded.
const subs = new Set();
const changed = () => subs.forEach(fn => fn());
addEventListener('install-offer', changed);
addEventListener('appinstalled', () => { window.__installOffer = null; changed(); });

export function canInstall() {
  const asApp = matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches;
  return !!window.__installOffer && !asApp;
}

// Shows Chrome's install dialog. An offer can only be used once; Chrome makes a new one on a later visit.
export async function install() {
  const offer = window.__installOffer;
  if (!offer) return false;
  window.__installOffer = null;
  changed();
  try { await offer.prompt(); return (await offer.userChoice).outcome === 'accepted'; } catch (e) { return false; }
}

export function onInstallChange(fn) { subs.add(fn); }

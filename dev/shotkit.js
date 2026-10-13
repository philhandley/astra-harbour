// Screenshot helper for tools/shot.sh: holds the page's load event until shotReady() is called.
const q = new URLSearchParams(location.search);
export const shotName = q.get('shot');
if (shotName) {
  const img = new Image();
  img.src = `/__wait/${shotName}?t=${q.get('wait') || 40}`;
  img.style.display = 'none';
  document.documentElement.appendChild(img);
}
export function shotReady() {
  if (!shotName) return;
  fetch(`/__done/${shotName}`, { method: 'PUT' }).catch(() => {});
}

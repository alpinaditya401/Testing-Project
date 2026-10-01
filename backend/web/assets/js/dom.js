// DOM and routing helpers with no dependency on application state.
// escapeHtml is the only escaping barrier in the template strings; its
// String() coercion and character class are load bearing, not style.
export function route() { return (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]; }
export function navigate(path) { location.hash = `#/${path}`; }
export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }
export function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

// Host elements from index.html. Module scripts are deferred, so these run
// after parsing; index.html keeps the three divs above the script tags.
export const app = document.getElementById('app');
export const modalRoot = document.getElementById('modal-root');
export const toastRegion = document.getElementById('toast-region');

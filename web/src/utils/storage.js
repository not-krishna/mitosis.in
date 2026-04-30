export function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") || fallback;
  } catch (_error) {
    return fallback;
  }
}

export function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Storage can be blocked in embedded contexts.
  }
}

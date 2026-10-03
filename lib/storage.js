// Drop-in replacement for Claude's artifact-only `window.storage` API, backed by the browser's
// real localStorage — so the app works in any normal browser (and on Vercel), not just inside a
// Claude.ai artifact preview. Each app gets its own prefix so saved data never mixes.
//
// Later, to sync data across devices/users, swap the body of each function for a Supabase call:
// the shape (get/set/list/delete, all async, keyed by a string) maps onto a table of
// { key text primary key, value text }.

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createStorage(PREFIX) {
  return {
    async get(key) {
      if (!isBrowser()) return null;
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw };
    },
    async set(key, value) {
      if (!isBrowser()) return null;
      window.localStorage.setItem(PREFIX + key, value);
      return { key, value };
    },
    async delete(key) {
      if (!isBrowser()) return null;
      window.localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    },
    async list(prefix) {
      if (!isBrowser()) return { keys: [] };
      const keys = [];
      const fullPrefix = PREFIX + (prefix || "");
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys };
    },
  };
}

export const storage = createStorage("labshift:");        // Laborversion
export const genericStorage = createStorage("dienstplan:"); // allgemeine Version

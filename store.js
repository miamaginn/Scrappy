/*
  Where scrapbooks live.

  Every book is saved in this browser first (IndexedDB), photos and videos
  included, so editing is instant and works offline. When syncing is set up
  (config.js) and you're signed in, each change is then copied to your
  Supabase account, which is what other devices and visitors read from.

  Books unzipped into /trips/<id>/ and listed in /trips/index.json also show
  on the shelf, read-only.
*/
window.Store = (function () {
  const cfg = window.SHELF_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;
  let user = null;
  const authListeners = [];

  /* ---------- This browser ---------- */

  let dbPromise;

  function open() {
    dbPromise = dbPromise || new Promise((resolve, reject) => {
      const req = indexedDB.open("travel-shelf", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("books", { keyPath: "id" });
        req.result.createObjectStore("media", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // Media ids double as file names in a public bucket, so they're long and random
  const mediaId = () => (crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid());

  const idbBooks = () => run("books", "readonly", (s) => s.getAll());
  const idbBook = (id) => run("books", "readonly", (s) => s.get(id));
  const idbPutBook = (rec) => run("books", "readwrite", (s) => s.put(rec));
  const idbDeleteBook = (id) => run("books", "readwrite", (s) => s.delete(id));
  const getMedia = (id) => run("media", "readonly", (s) => s.get(id));
  const putMedia = (id, blob) => run("media", "readwrite", (s) => s.put({ id, blob, uploaded: false }));
  const deleteMedia = (id) => run("media", "readwrite", (s) => s.delete(id));

  // Bookkeeping fields that stay in this browser
  const clean = ({ _dirty, _synced, static: isStatic, ...book }) => book;

  const mediaIds = (book) => [...new Set(book.pages.flatMap((p) => p.items).map((it) => it.media).filter(Boolean))];

  /* ---------- Books published as files ---------- */

  async function staticBooks() {
    try {
      const ids = await fetch("trips/index.json", { cache: "no-cache" }).then((r) => r.json());
      return await Promise.all(ids.map(async (id) => {
        const book = await fetch(`trips/${id}/book.json`, { cache: "no-cache" }).then((r) => r.json());
        return { ...book, id, static: true };
      }));
    } catch {
      return [];
    }
  }

  /* ---------- The cloud ---------- */

  async function cloudBooks() {
    const { data, error } = await sb.from("books").select("id, owner, published, data");
    if (error) throw error;
    return data.map((r) => ({ ...r.data, id: r.id, owner: r.owner, shared: r.published }));
  }

  const queue = new Map();

  // Syncs run one at a time per book, always from the newest copy in this browser
  function sync(id) {
    const next = (queue.get(id) || Promise.resolve()).then(() => upload(id), () => upload(id));
    queue.set(id, next);
    return next;
  }

  async function upload(id) {
    if (!sb || !user) return false;
    const rec = await idbBook(id);
    if (!rec) return true;
    if (rec.owner && rec.owner !== user.id) return true;
    if (!rec._dirty && rec._synced) return true;

    for (const m of mediaIds(rec)) {
      const file = await getMedia(m);
      if (!file || file.uploaded) continue;
      const { error } = await sb.storage.from("media").upload(`${user.id}/${m}`, file.blob, { contentType: file.blob.type, upsert: true });
      if (error) throw error;
      await run("media", "readwrite", (s) => s.put({ ...file, uploaded: true }));
    }

    const book = clean(rec);
    delete book.owner;
    const shared = !!book.shared;
    delete book.shared;
    const { error } = await sb.from("books").upsert({
      id, owner: user.id, data: book, published: shared, updated_at: new Date(rec.updated || Date.now()).toISOString()
    });
    if (error) throw error;

    // Only mark it clean if nothing changed while we were uploading
    const now = await idbBook(id);
    if (now && now.updated === rec.updated) await idbPutBook({ ...now, owner: user.id, _dirty: false, _synced: true });
    return true;
  }

  let syncingAll = null;

  function syncAll() {
    if (!sb || !user) return Promise.resolve();
    syncingAll = syncingAll || idbBooks()
      .then((books) => Promise.all(books.filter((b) => b._dirty || !b._synced).map((b) => sync(b.id).catch(() => false))))
      .finally(() => { syncingAll = null; });
    return syncingAll;
  }

  /* ---------- Reading books ---------- */

  async function allBooks() {
    const [local, published] = await Promise.all([idbBooks(), staticBooks()]);
    const byId = new Map(published.map((b) => [b.id, b]));

    if (!sb) {
      local.forEach((b) => byId.set(b.id, clean(b)));
    } else {
      let remote = null;
      try { remote = await cloudBooks(); } catch {}
      (remote || []).forEach((b) => byId.set(b.id, b));

      if (user) {
        for (const b of local) {
          if (b.owner && b.owner !== user.id) continue;
          const theirs = byId.get(b.id);
          if (!b._synced || (b._dirty && (!theirs || (b.updated || 0) >= (theirs.updated || 0)))) {
            byId.set(b.id, { ...clean(b), owner: user.id });
          } else if (!theirs && remote) {
            // Deleted on another device
            await idbDeleteBook(b.id);
          } else if (!theirs) {
            byId.set(b.id, clean(b));
          }
        }
      }
    }
    return [...byId.values()].sort((a, b) => (a.created || 0) - (b.created || 0));
  }

  async function getBook(id) {
    return (await allBooks()).find((b) => b.id === id);
  }

  /* ---------- Saving ---------- */

  // Saves here right away, then syncs. `synced` settles to true once the
  // cloud has it, or false if that has to wait (offline, signed out).
  async function putBook(book) {
    const prev = await idbBook(book.id);
    const owner = user ? user.id : prev && prev.owner;
    await idbPutBook({ ...clean(book), owner, _dirty: true, _synced: !!(prev && prev._synced) });
    const synced = sb && user ? sync(book.id).catch(() => false) : Promise.resolve(false);
    return { cloud: !!(sb && user), synced };
  }

  async function deleteBook(book) {
    const ids = mediaIds(book);
    if (sb && user && book.owner === user.id) {
      const { error } = await sb.from("books").delete().eq("id", book.id);
      if (error) throw error;
      if (ids.length) await sb.storage.from("media").remove(ids.map((m) => `${user.id}/${m}`));
    }
    await Promise.all(ids.map(deleteMedia));
    await idbDeleteBook(book.id);
  }

  /* ---------- Photos and videos ---------- */

  const urls = new Map();

  async function mediaUrl(book, id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await getMedia(id);
    if (rec) {
      const url = URL.createObjectURL(rec.blob);
      urls.set(id, url);
      return url;
    }
    if (book.static && book.mediaFiles && book.mediaFiles[id]) return `trips/${book.id}/media/${book.mediaFiles[id]}`;
    if (sb && book.owner) return sb.storage.from("media").getPublicUrl(`${book.owner}/${id}`).data.publicUrl;
    return "";
  }

  const extFor = (type) => ({
    "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"
  }[type] || "bin");

  /* ---------- Backups ---------- */

  // A book exports as one .zip: book.json plus a media folder
  async function exportBook(book) {
    const zip = new JSZip();
    const mediaFiles = {};
    for (const id of mediaIds(book)) {
      const rec = await getMedia(id);
      let blob = rec && rec.blob;
      if (!blob) {
        const url = await mediaUrl(book, id);
        blob = url ? await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : null;
      }
      if (!blob) continue;
      mediaFiles[id] = `${id}.${extFor(blob.type)}`;
      zip.file(`media/${mediaFiles[id]}`, blob);
    }
    const { owner, shared, ...rest } = clean(book);
    zip.file("book.json", JSON.stringify({ ...rest, mediaFiles }, null, 2));
    return zip.generateAsync({ type: "blob" });
  }

  async function importBook(file) {
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file("book.json");
    if (!entry) throw new Error("That file isn't a scrapbook export.");
    const book = JSON.parse(await entry.async("string"));
    const mimes = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
    for (const [id, name] of Object.entries(book.mediaFiles || {})) {
      const part = zip.file(`media/${name}`);
      if (!part) continue;
      const blob = await part.async("blob");
      await putMedia(id, new Blob([blob], { type: mimes[name.split(".").pop()] || "" }));
    }
    delete book.mediaFiles;
    await putBook(book);
    return book;
  }

  /* ---------- Signing in ---------- */

  async function ready() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((_event, session) => {
      const was = user && user.id;
      user = session ? session.user : null;
      if ((user && user.id) !== was) {
        if (user) syncAll();
        authListeners.forEach((fn) => fn(user));
      }
    });
    if (user) syncAll();
    addEventListener("online", syncAll);
    setInterval(syncAll, 60000);
  }

  const signIn = (email) =>
    sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  const signOut = () => sb.auth.signOut();

  return {
    cloud: !!sb,
    user: () => user,
    onAuth: (fn) => authListeners.push(fn),
    ready, signIn, signOut, syncAll,
    uid, mediaId, allBooks, getBook, localBooks: idbBooks, putBook, deleteBook, putMedia, mediaUrl, exportBook, importBook
  };
})();

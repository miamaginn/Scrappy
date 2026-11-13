(function () {
  const app = document.getElementById("app");
  const overlay = document.getElementById("overlay");
  const toastEl = document.getElementById("toast");

  // Pages are laid out on a fixed 600 x 800 sheet and scaled to fit the screen
  const PAGE_W = 600, PAGE_H = 800;

  const SPINE_COLORS = [
    "#c8473a", "#e06c4c", "#e58fa7", "#b0476e", "#7b5ea7", "#2f6fa8", "#5bb3e0",
    "#3aa6a0", "#2e7d5b", "#9bbf5a", "#f2c94c", "#e0a43a", "#e8ddc4", "#161412"
  ];
  const NOTE_COLORS = ["#fbe98a", "#f9b9c6", "#b6e3d4", "#bcd7f3", "#f7c98b"];
  const INK_COLORS = ["#161412", "#a8402f", "#27405e", "#2f6b4f", "#ffffff"];
  const FONTS = {
    Handwritten: "Caveat, cursive",
    Serif: "'Cormorant Garamond', serif",
    Elegant: "'Playfair Display', serif",
    Typewriter: "'Special Elite', monospace"
  };
  // Starting text size for each kind of writing, in page pixels
  const TEXT_SIZE = { text: 40, postit: 29, note: 25 };
  const PEN_COLORS = ["#161412", "#a8402f", "#e06c4c", "#e58fa7", "#f2c94c", "#2e7d5b", "#2f6fa8", "#7b5ea7", "#ffffff"];
  const PENS = {
    Fine: { width: 3 },
    Pen: { width: 6 },
    Marker: { width: 12 },
    Highlighter: { width: 24, alpha: 0.4 }
  };
  const BACKGROUNDS = { cream: "Cream", lined: "Lined", grid: "Grid", dots: "Dots", kraft: "Kraft", blush: "Blush", sky: "Sky", night: "Night" };
  const FRAMES = { polaroid: "Polaroid", plain: "White border", none: "No border" };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const inkFor = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 150 ? "#161412" : "#f3ecdc";
  };

  /* ---------- Who can edit ---------- */
  // Visiting the site with ?edit once turns on the editing buttons for that browser.
  // This only tidies the page for guests: books are saved per browser, so a guest
  // can never change yours either way.

  const params = new URLSearchParams(location.search);
  const memory = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    remove(k) { try { localStorage.removeItem(k); } catch {} }
  };
  // With syncing set up, signing in is what makes you the owner instead.
  if (params.has("edit")) memory.set("shelf-owner", "1");
  if (params.has("view")) memory.remove("shelf-owner");
  const ownerHere = ["localhost", "127.0.0.1"].includes(location.hostname) || memory.get("shelf-owner") === "1";
  const isOwner = () => (Store.cloud ? !!Store.user() : ownerHere);

  /* ---------- State ---------- */

  const state = {
    book: null, first: 0, active: 0, sel: null, editing: false,
    undo: [], redo: [], scale: 1, maps: new Map(), saveTimer: null, drawer: null,
    pen: { color: "#161412", kind: "Pen" }, doodle: null
  };
  const drawing = () => state.drawer === "draw";
  const single = () => matchMedia("(max-width: 760px)").matches;
  const canEdit = () => {
    const b = state.book;
    return isOwner() && b && !b.static && (!Store.cloud || !b.owner || b.owner === Store.user().id);
  };

  let toastTimer;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), ms);
  }

  /* ---------- Routing ---------- */
  // #/            bookshelf
  // #/trip/<id>   an open scrapbook

  async function render() {
    await saveNow();
    closeOverlay();
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const book = parts[0] === "trip" ? await Store.getBook(parts[1]) : null;
    if (book) openBook(book);
    else {
      if (parts.length) { location.hash = "#/"; return; }
      state.book = null;
      await renderShelf();
    }
  }

  /* ---------- Bookshelf ---------- */

  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  function spine(b) {
    const size = b.place.length > 26 ? 0.95 : b.place.length > 20 ? 1.1 : b.place.length > 14 ? 1.35 : 1.6;
    return `
      <a class="spine" href="#/trip/${esc(b.id)}"
         style="--spine:${esc(b.color)};--spine-ink:${inkFor(b.color)};--h:${86 + (hash(b.id) % 15)}%">
        <span class="spine__band"></span>
        <span class="spine__text">
          <span class="spine__place" style="font-size:${size}rem">${esc(b.place)}</span>
          <span class="spine__date">${esc(b.dates)}</span>
        </span>
        <span class="spine__band"></span>
      </a>`;
  }

  async function renderShelf() {
    let books = await Store.allBooks();
    if (isOwner() && !memory.get("shelf-seeded") && !books.length) {
      await Store.putBook(sampleBook());
      memory.set("shelf-seeded", "1");
      books = await Store.allBooks();
    }
    const slots = books.map(spine);
    if (isOwner()) slots.push(`<button class="spine spine--new" type="button" data-act="new-book"><span>+ New scrapbook</span></button>`);

    const perRow = Math.max(3, Math.min(8, Math.floor((Math.min(app.clientWidth, 900) - 32) / 102)));
    const rows = [];
    for (let i = 0; i < slots.length; i += perRow) rows.push(slots.slice(i, i + perRow));
    if (!rows.length) rows.push([]);

    app.innerHTML = `
      <div class="travel-decor" aria-hidden="true">
        <svg class="flight" viewBox="0 0 1000 200" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke" d="M-10 170C180 40 340 30 520 90S840 150 1010 20"/></svg>
        <svg class="plane" viewBox="0 0 64 64"><path fill="currentColor" d="M60 4 4 28l18 8 4 20 9-12 13 8z"/></svg>
        <svg class="postmark" viewBox="0 0 170 110" fill="none" stroke="currentColor"><circle cx="55" cy="55" r="50" stroke-width="2.5"/><circle cx="55" cy="55" r="39" stroke-width="1.5"/><path stroke-width="2.5" d="M108 30c10-7 16 7 26 0s16 7 30 0M110 55c10-7 16 7 26 0s16 7 30 0M108 80c10-7 16 7 26 0s16 7 30 0"/></svg>
      </div>
      <section class="shelf-view">
        <header class="masthead">
          <p class="eyebrow">Places &amp; memories</p>
          <h1 class="masthead__title">The Travel Shelf</h1>
          <p class="lede">Pull a book from the shelf to flip through the trip.</p>
        </header>
        ${rows.map((r) => `
          <div class="shelf">
            <div class="shelf__books">${r.join("")}</div>
            <div class="shelf__plank"></div>
          </div>`).join("")}
        ${books.length || isOwner() ? "" : `<p class="lede">The shelf is empty for now.</p>`}
        <p class="shelf-tools">
          ${isOwner() ? `<label class="text-link">Import a scrapbook<input id="importIn" type="file" accept=".zip" hidden></label>` : ""}
          ${Store.cloud
            ? Store.user()
              ? `<button class="text-link" type="button" data-act="sign-out">Sign out</button>`
              : `<button class="text-link" type="button" data-act="sign-in">Owner sign-in</button>`
            : ""}
        </p>
      </section>`;

    app.querySelectorAll("a.spine").forEach((a) =>
      a.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        a.classList.add("is-pulling");
        setTimeout(() => (location.hash = a.getAttribute("href")), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500);
      })
    );

    const importIn = document.getElementById("importIn");
    if (importIn) importIn.onchange = async () => {
      if (!window.JSZip) return toast("Importing needs an internet connection");
      try {
        const book = await Store.importBook(importIn.files[0]);
        location.hash = `#/trip/${book.id}`;
      } catch (e) { toast(e.message); }
    };
  }

  function bookDialog(book) {
    const color = book ? book.color : SPINE_COLORS[hash(Store.uid()) % 12];
    openOverlay(`
      <header class="overlay-head">
        <p class="eyebrow">${book ? "Book details" : "A new scrapbook"}</p>
        <h2 class="masthead__title masthead__title--sm">${book ? esc(book.place) : "Where did you go?"}</h2>
      </header>
      <form class="form" id="bookForm">
        <label>Place<input name="place" required maxlength="34" placeholder="Kyoto, Japan" value="${esc(book && book.place)}"></label>
        <label>Date<input name="dates" maxlength="30" placeholder="April 2026" value="${esc(book && book.dates)}"></label>
        <fieldset>
          <legend>Spine color</legend>
          <div class="swatches">
            ${SPINE_COLORS.map((c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === color ? "checked" : ""}><span></span></label>`).join("")}
            <label class="swatch-custom">Custom<input type="color" name="custom" value="${SPINE_COLORS.includes(color) ? "#8a6d4f" : color}"></label>
          </div>
        </fieldset>
        ${Store.cloud ? `
          <label class="check">
            <input type="checkbox" name="shared" ${book && book.shared ? "checked" : ""}>
            <span>Show on the public shelf<small>Anyone visiting the site can open it. Off means only you can see it.</small></span>
          </label>` : ""}
        <button class="pill pill--solid" type="submit">${book ? "Save" : "Make the book"}</button>
      </form>
      ${book ? `
        <div class="form-extra">
          <button class="text-link" type="button" data-act="export">Download a backup (.zip)</button>
          <button class="text-link text-link--danger" type="button" data-act="delete-book">Delete this scrapbook</button>
        </div>` : ""}`, "form", (root) => {
      const form = root.querySelector("#bookForm");
      let custom = !SPINE_COLORS.includes(color);
      form.custom.oninput = () => { custom = true; form.querySelectorAll("[name=color]").forEach((r) => (r.checked = false)); };
      form.querySelectorAll("[name=color]").forEach((r) => (r.onchange = () => (custom = false)));
      form.onsubmit = async (e) => {
        e.preventDefault();
        const details = {
          place: form.place.value.trim(),
          dates: form.dates.value.trim(),
          color: custom ? form.custom.value : form.color.value
        };
        if (form.shared) details.shared = form.shared.checked;
        if (book) {
          Object.assign(state.book, details);
          commit();
          closeOverlay();
          renderBookShell();
        } else {
          const fresh = { id: Store.uid(), created: Date.now(), updated: Date.now(), ...details, places: [], pages: [blankPage(), blankPage()] };
          await Store.putBook(fresh);
          closeOverlay();
          location.hash = `#/trip/${fresh.id}`;
        }
      };
    });
  }

  const blankPage = () => ({ id: Store.uid(), bg: "cream", items: [] });

  function signInDialog() {
    openOverlay(`
      <header class="overlay-head">
        <p class="eyebrow">Owner sign-in</p>
        <h2 class="masthead__title masthead__title--sm">Welcome back</h2>
        <p class="hint">We'll email you a sign-in link. Open it on the device you want to use.</p>
      </header>
      <form class="form" id="signInForm">
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <button class="pill pill--solid" type="submit">Email me a link</button>
        <p class="hint" id="signInMsg" role="status"></p>
      </form>`, "form", (root) => {
      const form = root.querySelector("#signInForm");
      form.onsubmit = async (e) => {
        e.preventDefault();
        const msg = root.querySelector("#signInMsg");
        form.querySelector("button").disabled = true;
        const { error } = await Store.signIn(form.email.value.trim());
        msg.textContent = error ? `Couldn't send the link: ${error.message}` : "Check your email for the link. You can close this.";
        form.querySelector("button").disabled = false;
      };
    });
  }

  /* ---------- Open book ---------- */

  function openBook(book) {
    Object.assign(state, { book, first: 0, active: 0, sel: null, editing: false, undo: [], redo: [], drawer: null });
    document.title = `${book.place} · The Travel Shelf`;
    renderBookShell();
  }

  function renderBookShell() {
    const b = state.book;
    app.innerHTML = `
      <section class="book-view${state.editing ? " is-editing" : ""}">
        <nav class="book-nav">
          <a class="text-link" href="#/">← Back to the shelf</a>
          <h1 class="book-nav__title">${esc(b.place)}${b.dates ? ` <span>${esc(b.dates)}</span>` : ""}</h1>
          <div class="book-nav__right">
            ${state.editing ? `<span class="save-status" id="saveStatus">${Store.cloud ? "Saved" : "Saved on this device"}</span>` : ""}
            ${canEdit() && !state.editing ? `<button class="text-link" type="button" data-act="details">Book details</button>` : ""}
            ${!state.editing ? `<button class="text-link" type="button" data-act="share">Share</button>` : ""}
            ${canEdit() ? `<button class="pill${state.editing ? " pill--solid" : ""}" type="button" data-act="toggle-edit">${state.editing ? "Done" : "Edit pages"}</button>` : ""}
          </div>
        </nav>
        ${state.editing ? `
          <div class="toolbar">
            <label class="tool">Photo / video<input id="fileIn" type="file" accept="image/*,video/*,.heic,.heif" multiple hidden></label>
            <button class="tool" type="button" data-act="add-text">Text</button>
            <button class="tool" type="button" data-act="add-note">Activity note</button>
            <button class="tool" type="button" data-act="add-postit">Post-it</button>
            <button class="tool" type="button" data-act="drawer" data-drawer="stickers">Stickers</button>
            <button class="tool" type="button" data-act="drawer" data-drawer="draw">Draw</button>
            <button class="tool" type="button" data-act="add-map">Map</button>
            <button class="tool" type="button" data-act="drawer" data-drawer="page">Page style</button>
            <button class="tool" type="button" data-act="add-pages">Add pages</button>
            <span class="toolbar__gap"></span>
            <button class="tool" type="button" data-act="undo" id="undoBtn">Undo</button>
            <button class="tool" type="button" data-act="redo" id="redoBtn">Redo</button>
          </div>
          <div class="drawer" id="drawer" hidden></div>
          <div class="context" id="context"></div>
          <input id="replaceIn" type="file" accept="image/*,video/*,.heic,.heif" hidden>` : ""}
        <div class="spread" id="spread"></div>
        <div class="pager" id="pager"></div>
      </section>`;

    const fileIn = document.getElementById("fileIn");
    if (fileIn) fileIn.onchange = () => { addFiles([...fileIn.files]); fileIn.value = ""; };
    const replaceIn = document.getElementById("replaceIn");
    if (replaceIn) replaceIn.onchange = () => { replaceMedia(replaceIn.files[0]); replaceIn.value = ""; };

    bindSpread();
    drawSpread();
    drawDrawer();
    updateUndoButtons();
  }

  function visiblePages() {
    return single() ? [state.first] : [state.first, state.first + 1];
  }

  function drawSpread() {
    const spread = document.getElementById("spread");
    if (!spread) return;
    const pages = state.book.pages;
    if (!single()) state.first -= state.first % 2;
    state.first = Math.max(0, Math.min(state.first, pages.length - 1));
    if (!visiblePages().includes(state.active)) state.active = state.first;

    state.maps.forEach((m) => m.remove());
    state.maps.clear();

    spread.innerHTML = visiblePages()
      .map((i) => (pages[i] ? pageHTML(pages[i], i) : `<div class="sheet sheet--blank"></div>`))
      .join("");

    fit();
    spread.querySelectorAll("[data-media]").forEach(async (el) => {
      el.src = await Store.mediaUrl(state.book, el.dataset.media);
    });
    spread.querySelectorAll("[data-map]").forEach((el) => {
      const m = buildMap(el, !state.editing);
      if (m) state.maps.set(el.dataset.map, m);
    });

    const pager = document.getElementById("pager");
    const shown = visiblePages().filter((i) => pages[i]).map((i) => i + 1);
    pager.innerHTML = `
      <button class="round" type="button" data-act="prev" aria-label="Previous pages" ${state.first === 0 ? "disabled" : ""}>‹</button>
      <span>${shown.length > 1 ? "Pages" : "Page"} ${shown.join("–")} of ${pages.length}</span>
      <button class="round" type="button" data-act="next" aria-label="Next pages" ${state.first + (single() ? 1 : 2) >= pages.length ? "disabled" : ""}>›</button>`;

    select(find(state.sel) ? state.sel : null);
    markActive();
  }

  function pageHTML(page, i) {
    const bg = page.color ? `style="background:${esc(page.color)}"` : "";
    return `
      <div class="sheet" data-page="${i}">
        <div class="page bg-${esc(page.bg)}" ${bg}>
          ${page.items.map(itemHTML).join("")}
        </div>
        <span class="folio">${i + 1}</span>
      </div>`;
  }

  const boxStyle = (it) =>
    `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;transform:rotate(${it.rot || 0}deg)`;

  function field(name, value, placeholder, cls) {
    return `<div class="${cls}" data-field="${name}" data-ph="${esc(placeholder)}">${esc(value)}</div>`;
  }

  function itemHTML(it) {
    let inner = "";
    if (it.type === "text") {
      inner = `<div class="t" data-field="text" data-ph="Type here" style="font-family:${esc(it.font)};font-size:${it.size}px;color:${esc(it.color)};text-align:${esc(it.align || "left")}">${esc(it.text)}</div>`;
    } else if (it.type === "postit") {
      const look = `${it.font ? `font-family:${esc(it.font)};` : ""}${it.ink ? `color:${esc(it.ink)};` : ""}`;
      inner = `<div class="postit" style="background:${esc(it.color)};font-size:${it.size || TEXT_SIZE.postit}px"><div class="postit__text" data-field="text" data-ph="Write a note" style="${look}">${esc(it.text)}</div></div>`;
    } else if (it.type === "note") {
      const look = `--note:${esc(it.color || "#fffdf7")};font-size:${it.size || TEXT_SIZE.note}px;${it.ink ? `color:${esc(it.ink)};` : ""}${it.font ? `--note-font:${esc(it.font)};` : ""}`;
      inner = `
        <div class="note" style="${look}">
          ${field("when", it.when, "Day / time", "note__when")}
          ${field("title", it.title, "What we did", "note__title")}
          ${field("text", it.text, "How it went...", "note__text")}
        </div>`;
    } else if (it.type === "photo" || it.type === "video") {
      const media = !it.media
        ? `<div class="photo__empty">Your photo here</div>`
        : it.type === "photo"
          ? `<img data-media="${esc(it.media)}" alt="${esc(it.caption)}" draggable="false">`
          : `<video data-media="${esc(it.media)}" controls playsinline preload="metadata"></video>`;
      inner = `
        <figure class="photo photo--${esc(it.frame || "polaroid")}">
          <div class="photo__img">${media}</div>
          ${(it.frame || "polaroid") === "polaroid" ? field("caption", it.caption, "Add a caption", "photo__caption") : ""}
        </figure>`;
    } else if (it.type === "sticker") {
      inner = it.graphic
        ? window.STICKERS.graphics[it.graphic].svg
        : `<svg viewBox="0 0 100 100"><text x="50" y="54" text-anchor="middle" dominant-baseline="central" font-size="78">${esc(it.emoji)}</text></svg>`;
    } else if (it.type === "map") {
      inner = `<div class="map-frame"><div class="map" data-map="${esc(it.id)}"></div></div>`;
    } else if (it.type === "draw") {
      inner = `
        <svg viewBox="0 0 ${it.vw} ${it.vh}" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round">
          ${it.paths.map((p) => {
            const d = pathD(p.pts);
            // A wider invisible copy of each line makes thin lines easy to grab
            return `<path class="hit" d="${d}" stroke="transparent" stroke-width="${p.width + 16}"/><path d="${d}" stroke="${esc(p.color)}" stroke-width="${p.width}"${p.alpha ? ` stroke-opacity="${p.alpha}"` : ""}/>`;
          }).join("")}
        </svg>`;
    }
    return `<div class="item item--${esc(it.type)}" data-id="${esc(it.id)}" style="${boxStyle(it)}">${inner}</div>`;
  }

  /* ---------- Drawing ---------- */

  // Smooth a stroke by curving through the midpoints between samples
  function pathD(pts) {
    if (pts.length < 3) return `M${pts[0]}L${pts[pts.length - 1]}`;
    let d = `M${pts[0]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1), my = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
      d += `Q${pts[i]} ${mx},${my}`;
    }
    return d + `L${pts[pts.length - 1]}`;
  }

  function startStroke(down, sheet) {
    const pageIndex = +sheet.dataset.page;
    const r = sheet.getBoundingClientRect(), s = state.scale;
    const pen = { color: state.pen.color, ...PENS[state.pen.kind] };
    const at = (e) => [+((e.clientX - r.left) / s).toFixed(1), +((e.clientY - r.top) / s).toFixed(1)];
    const pts = [at(down)];

    const ns = "http://www.w3.org/2000/svg";
    const live = document.createElementNS(ns, "svg");
    live.setAttribute("class", "ink-live");
    live.setAttribute("viewBox", `0 0 ${PAGE_W} ${PAGE_H}`);
    const path = document.createElementNS(ns, "path");
    Object.entries({ fill: "none", stroke: pen.color, "stroke-width": pen.width, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-opacity": pen.alpha || 1 })
      .forEach(([k, v]) => path.setAttribute(k, v));
    live.append(path);
    sheet.querySelector(".page").append(live);

    const onMove = (e) => {
      for (const c of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) {
        const p = at(c), last = pts[pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5) pts.push(p);
      }
      path.setAttribute("d", pathD(pts));
    };
    const onUp = () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      live.remove();
      if (pts.length === 1) pts.push([pts[0][0] + 0.5, pts[0][1] + 0.5]);
      addStroke(pageIndex, pts, pen);
    };
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
  }

  // Strokes drawn in one go on the same page join into one doodle you can move as a whole
  function addStroke(pageIndex, pts, pen) {
    pushUndo();
    const page = state.book.pages[pageIndex];
    const pad = pen.width / 2 + 2;
    let x0 = Math.min(...pts.map((p) => p[0])) - pad, y0 = Math.min(...pts.map((p) => p[1])) - pad;
    let x1 = Math.max(...pts.map((p) => p[0])) + pad, y1 = Math.max(...pts.map((p) => p[1])) + pad;

    let it = state.doodle && state.doodle.page === pageIndex && page.items.find((i) => i.id === state.doodle.id);
    let paths = [];
    if (it) {
      x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y);
      x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h);
      paths = it.paths.map((p) => ({ ...p, pts: p.pts.map(([a, b]) => [+(a + it.x - x0).toFixed(1), +(b + it.y - y0).toFixed(1)]) }));
    }
    paths.push({ color: pen.color, width: pen.width, alpha: pen.alpha, pts: pts.map(([a, b]) => [+(a - x0).toFixed(1), +(b - y0).toFixed(1)]) });
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, vw: x1 - x0, vh: y1 - y0, paths };

    if (it) Object.assign(it, box);
    else {
      it = { id: Store.uid(), type: "draw", rot: 0, ...box };
      page.items.push(it);
      state.doodle = { page: pageIndex, id: it.id };
    }
    commit();
    const el = itemEl(it.id);
    if (el) el.outerHTML = itemHTML(it);
    else document.querySelector(`[data-page="${pageIndex}"] .page`).insertAdjacentHTML("beforeend", itemHTML(it));
  }

  function fit() {
    const spread = document.getElementById("spread");
    if (!spread) return;
    const width = spread.clientWidth;
    const s = single()
      ? width / PAGE_W
      : Math.max(0.42, Math.min(1.2, width / (PAGE_W * 2), (innerHeight - (state.editing ? 210 : 140)) / PAGE_H));
    state.scale = s;
    spread.style.setProperty("--s", s);
    state.maps.forEach((m) => m.invalidateSize());
  }

  function turn(step) {
    state.first += step * (single() ? 1 : 2);
    state.sel = null;
    state.doodle = null;
    state.active = state.first;
    drawSpread();
    drawContext();
  }

  /* ---------- Saving and undo ---------- */

  function setStatus(text) {
    const el = document.getElementById("saveStatus");
    if (el) el.textContent = text;
  }

  function commit() {
    state.book.updated = Date.now();
    setStatus("Saving…");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 300);
  }

  async function saveNow() {
    if (!state.saveTimer) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    try {
      const saved = await Store.putBook(state.book);
      if (!saved.cloud) return setStatus("Saved on this device");
      setStatus("Syncing…");
      saved.synced.then((ok) => {
        if (!state.saveTimer) setStatus(ok ? "Saved" : "Saved here · will sync when you're online");
      });
    } catch {
      setStatus("Couldn't save");
      toast("This browser is out of storage space. Try a smaller video.");
    }
  }

  function pushUndo() {
    state.undo.push(JSON.stringify(state.book));
    if (state.undo.length > 60) state.undo.shift();
    state.redo = [];
    updateUndoButtons();
  }

  function timeTravel(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(state.book));
    state.book = JSON.parse(from.pop());
    state.sel = null;
    commit();
    drawSpread();
    updateUndoButtons();
  }

  function updateUndoButtons() {
    const u = document.getElementById("undoBtn"), r = document.getElementById("redoBtn");
    if (u) u.disabled = !state.undo.length;
    if (r) r.disabled = !state.redo.length;
  }

  /* ---------- Items ---------- */

  function find(id) {
    if (!id || !state.book) return null;
    for (const page of state.book.pages) {
      const it = page.items.find((x) => x.id === id);
      if (it) return it;
    }
    return null;
  }

  const pageOf = (id) => state.book.pages.find((p) => p.items.some((x) => x.id === id));
  const itemEl = (id) => document.querySelector(`.item[data-id="${id}"]`);

  function addItem(props, at) {
    pushUndo();
    const page = state.book.pages[state.active] || state.book.pages[state.first];
    const nudge = (page.items.length % 6) * 18;
    const it = {
      id: Store.uid(), rot: 0,
      x: at ? at.x - props.w / 2 : (PAGE_W - props.w) / 2 + nudge,
      y: at ? at.y - props.h / 2 : (PAGE_H - props.h) / 2 - 60 + nudge,
      ...props
    };
    page.items.push(it);
    state.sel = it.id;
    commit();
    drawSpread();
    return it;
  }

  function removeSelected() {
    const it = find(state.sel);
    if (!it) return;
    pushUndo();
    const page = pageOf(it.id);
    page.items.splice(page.items.indexOf(it), 1);
    state.sel = null;
    commit();
    drawSpread();
  }

  function layer(step) {
    const it = find(state.sel);
    const items = pageOf(it.id).items;
    const i = items.indexOf(it), j = i + step;
    if (j < 0 || j >= items.length) return;
    pushUndo();
    [items[i], items[j]] = [items[j], items[i]];
    commit();
    drawSpread();
  }

  function duplicate() {
    const it = find(state.sel);
    if (!it) return;
    pushUndo();
    const copy = { ...it, id: Store.uid(), x: it.x + 24, y: it.y + 24 };
    pageOf(it.id).items.push(copy);
    state.sel = copy.id;
    commit();
    drawSpread();
  }

  function update(changes) {
    const it = find(state.sel);
    if (!it) return;
    pushUndo();
    Object.assign(it, changes);
    commit();
    drawSpread();
    // Bigger writing makes a post-it or note grow to fit
    const paper = itemEl(it.id) && itemEl(it.id).querySelector(".postit, .note");
    if (paper && paper.scrollHeight > it.h) {
      it.h = paper.scrollHeight;
      itemEl(it.id).style.cssText = boxStyle(it);
      select(it.id);
    }
  }

  /* ---------- Photos and videos ---------- */

  // iPhone photos are often HEIC, which only Safari can read. Elsewhere they're
  // converted to JPEG: heic-to (a current libheif) first, heic2any as a backup.
  // Each converter is downloaded the first time it's needed.
  const isHeic = (f) => /image\/hei[cf]/.test(f.type) || /\.hei[cf]$/i.test(f.name || "");
  const scripts = new Map();

  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { scripts.delete(src); reject(new Error("couldn't download the converter")); };
        document.head.append(s);
      }));
    }
    return scripts.get(src);
  }

  const reason = (e) => String((e && (e.message || e.code)) || e || "unknown error").slice(0, 120);

  async function convertHeic(file) {
    toast("Converting an iPhone photo…", 20000);
    const problems = [];
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/heic-to@1.6.6/dist/iife/heic-to.js");
      return await window.HeicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    } catch (e) {
      problems.push(reason(e));
    }
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js");
      const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      return Array.isArray(out) ? out[0] : out;
    } catch (e) {
      problems.push(reason(e));
    }
    throw new Error(problems.join("; "));
  }

  async function decode(file) {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      if (!isHeic(file)) throw e;
      return createImageBitmap(await convertHeic(file));
    }
  }

  function prepImage(file) {
    if (file.type === "image/gif") return dimensions(file).then((d) => ({ blob: file, ...d }));
    return decode(file).then((bmp) => {
      const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob.type === "image/webp" || file.type === "image/png") return resolve({ blob, w, h });
          canvas.toBlob((jpg) => resolve({ blob: jpg, w, h }), "image/jpeg", 0.85);
        }, "image/webp", 0.85);
      });
    });
  }

  function dimensions(file) {
    return new Promise((resolve) => {
      const video = file.type.startsWith("video");
      const el = document.createElement(video ? "video" : "img");
      const url = URL.createObjectURL(file);
      const done = (w, h) => { URL.revokeObjectURL(url); resolve({ w: w || 16, h: h || 9 }); };
      el.onerror = () => done();
      if (video) {
        el.preload = "metadata";
        el.onloadedmetadata = () => done(el.videoWidth, el.videoHeight);
      } else {
        el.onload = () => done(el.naturalWidth, el.naturalHeight);
      }
      el.src = url;
    });
  }

  async function storeFile(file) {
    const video = file.type.startsWith("video");
    const prepared = video ? { blob: file, ...(await dimensions(file)) } : await prepImage(file);
    const media = Store.mediaId();
    await Store.putMedia(media, prepared.blob);
    return { media, type: video ? "video" : "photo", ratio: prepared.h / prepared.w };
  }

  async function addFiles(files, at) {
    files = files.filter((f) => /^(image|video)\//.test(f.type) || isHeic(f));
    if (!files.length) return;
    toast(files.length > 1 ? `Adding ${files.length} files…` : "Adding…");
    let i = 0;
    for (const file of files) {
      try {
        const { media, type, ratio } = await storeFile(file);
        const w = 280;
        const h = Math.round(w * ratio) + (type === "photo" ? 58 : 0);
        addItem({ type, media, w, h, frame: type === "photo" ? "polaroid" : "none", caption: "", rot: i % 2 ? 2 : -2 },
          at && { x: at.x + i * 24, y: at.y + i * 24 });
        i += 1;
      } catch (e) {
        console.error(file.name, e);
        toast(`Couldn't add ${file.name} (${reason(e)}). Try a JPEG or PNG, or a smaller video.`, 12000);
      }
    }
    if (i) toast(i > 1 ? `Added ${i} files` : "Added");
  }

  async function replaceMedia(file) {
    if (!file) return;
    try {
      const { media, type, ratio } = await storeFile(file);
      const it = find(state.sel);
      update({ media, type, h: Math.round(it.w * ratio) + (type === "photo" && (it.frame || "polaroid") === "polaroid" ? 58 : 0) });
    } catch (e) {
      console.error(file.name, e);
      toast(`Couldn't use that file (${reason(e)}). Try a JPEG or PNG.`, 12000);
    }
  }

  /* ---------- Selecting, moving, resizing, turning ---------- */

  function select(id) {
    document.querySelectorAll(".item.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
      el.querySelectorAll(".handle").forEach((h) => h.remove());
    });
    state.sel = id;
    const el = id && itemEl(id);
    if (el && state.editing) {
      el.classList.add("is-selected");
      el.insertAdjacentHTML("beforeend", `<span class="handle handle--turn" data-h="turn" title="Turn"></span><span class="handle handle--size" data-h="size" title="Resize"></span>`);
    }
    drawContext();
  }

  function markActive() {
    document.querySelectorAll(".sheet").forEach((s) => s.classList.toggle("is-active", state.editing && +s.dataset.page === state.active));
  }

  function bindSpread() {
    const spread = document.getElementById("spread");

    spread.addEventListener("pointerdown", (e) => {
      if (!state.editing) return;
      const sheet = e.target.closest("[data-page]");
      if (sheet && +sheet.dataset.page !== state.active) {
        state.active = +sheet.dataset.page;
        markActive();
      }
      if (e.target.closest("[contenteditable]")) return;
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      if (drawing()) {
        if (sheet) {
          e.preventDefault();
          startStroke(e, sheet);
        }
        return;
      }

      const el = e.target.closest(".item");
      if (!el) return select(null);
      const it = find(el.dataset.id);
      const wasSelected = state.sel === it.id;
      if (!wasSelected) select(it.id);
      e.preventDefault();
      const handle = e.target.closest(".handle");
      gesture(e, el, it, handle ? handle.dataset.h : "move", wasSelected);
    });

    spread.addEventListener("dragover", (e) => { if (state.editing) e.preventDefault(); });
    spread.addEventListener("drop", (e) => {
      if (!state.editing) return;
      e.preventDefault();
      const sheet = e.target.closest("[data-page]");
      if (!sheet) return addFiles([...e.dataTransfer.files]);
      state.active = +sheet.dataset.page;
      const r = sheet.getBoundingClientRect();
      addFiles([...e.dataTransfer.files], { x: (e.clientX - r.left) / state.scale, y: (e.clientY - r.top) / state.scale });
    });
  }

  function gesture(down, el, it, kind, wasSelected) {
    const s = state.scale;
    const start = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot || 0, size: it.size || TEXT_SIZE[it.type] };
    const paper = el.querySelector(".postit, .note");
    const keepShape = it.type === "sticker" && !(it.graphic || "").startsWith("tape");
    let moved = false;

    const onMove = (e) => {
      if (!moved) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 3) return;
        moved = true;
        pushUndo();
      }
      const dx = (e.clientX - down.clientX) / s, dy = (e.clientY - down.clientY) / s;

      if (kind === "move") {
        // Free to travel over the facing page; it's kept on a page when dropped
        it.x = Math.round(start.x + dx);
        it.y = Math.round(start.y + dy);
      } else if (kind === "size") {
        // Work in the item's own turned axes, and keep its top-left corner pinned
        const a = (start.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
        let w = Math.max(30, start.w + dx * cos + dy * sin);
        let h = Math.max(24, start.h - dx * sin + dy * cos);
        if (keepShape) {
          const k = Math.max(w / start.w, h / start.h);
          w = start.w * k;
          h = start.h * k;
        }
        const left = start.x + start.w / 2 - (start.w / 2) * cos + (start.h / 2) * sin;
        const top = start.y + start.h / 2 - (start.w / 2) * sin - (start.h / 2) * cos;
        it.w = Math.round(w);
        it.h = Math.round(h);
        it.x = Math.round(left + (w / 2) * cos - (h / 2) * sin - w / 2);
        it.y = Math.round(top + (w / 2) * sin + (h / 2) * cos - h / 2);
        // Post-its and notes scale their writing with their width
        if (paper) {
          it.size = Math.max(8, Math.round(start.size * (w / start.w) * 2) / 2);
          paper.style.fontSize = `${it.size}px`;
        }
      } else {
        const r = el.getBoundingClientRect();
        const deg = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
        const norm = ((deg + 180) % 360 + 360) % 360 - 180;
        it.rot = Math.abs(norm) < 3 ? 0 : Math.round(norm);
      }
      el.style.cssText = boxStyle(it);
    };

    const onUp = () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      if (moved) {
        if (kind === "move") moveAcrossPages(el, it);
        if (state.maps.has(it.id)) state.maps.get(it.id).invalidateSize();
        commit();
      } else if (wasSelected && kind === "move") {
        const target = down.target.closest("[data-field]");
        if (target) startTyping(target, it);
      }
    };

    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onUp);
  }

  function moveAcrossPages(el, it) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const home = el.closest("[data-page]");
    const other = [...document.querySelectorAll("[data-page]")].find((s) => {
      const b = s.getBoundingClientRect();
      return s !== home && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    });
    if (other) {
      const from = state.book.pages[+home.dataset.page], to = state.book.pages[+other.dataset.page];
      it.x += Math.round((home.getBoundingClientRect().left - other.getBoundingClientRect().left) / state.scale);
      from.items.splice(from.items.indexOf(it), 1);
      to.items.push(it);
      state.active = +other.dataset.page;
    }
    it.x = Math.max(-it.w / 2, Math.min(PAGE_W - it.w / 2, it.x));
    it.y = Math.max(-it.h / 2, Math.min(PAGE_H - it.h / 2, it.y));
    if (other) drawSpread();
    else el.style.cssText = boxStyle(it);
  }

  function startTyping(target, it) {
    pushUndo();
    try { target.contentEditable = "plaintext-only"; } catch { target.contentEditable = "true"; }
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // A Polaroid grows taller as its caption wraps, so the photo keeps its size
    const box = itemEl(it.id);
    const photo = target.dataset.field === "caption" && box.querySelector(".photo__img");
    const photoH = photo && photo.offsetHeight;
    const fitCaption = () => {
      it.h = photoH + 12 + target.offsetHeight;
      box.style.cssText = boxStyle(it);
    };
    if (photo) target.addEventListener("input", fitCaption);

    target.addEventListener("blur", () => {
      if (photo) {
        target.removeEventListener("input", fitCaption);
        fitCaption();
      }
      target.removeAttribute("contenteditable");
      it[target.dataset.field] = target.innerText.replace(/\n+$/, "");
      if (!it[target.dataset.field]) target.textContent = "";
      const need = Math.max(box.scrollHeight, target.closest(".note,.postit") ? target.closest(".note,.postit").scrollHeight : 0);
      if (need > it.h && it.type !== "photo") {
        it.h = need;
        box.style.cssText = boxStyle(it);
      }
      commit();
    }, { once: true });
  }

  /* ---------- Selected-item controls ---------- */

  const swatches = (colors, act, current) =>
    colors.map((c) => `<button class="dot${c === current ? " is-on" : ""}" type="button" style="--c:${c}" data-act="${act}" data-v="${c}" aria-label="Color ${c}"></button>`).join("");

  function drawContext() {
    const box = document.getElementById("context");
    if (!box) return;
    const it = find(state.sel);
    if (!it) {
      box.innerHTML = `
        <span class="hint">Drag anything to move it. Click something once to select it, and again to type in it.</span>
        <span class="toolbar__gap"></span>
        <button class="text-link text-link--danger" type="button" data-act="delete-page">Delete page ${state.active + 1}</button>`;
      return;
    }
    const textControls = (font, ink, classic) => `
        <select data-change="font" aria-label="Font">
          ${classic ? `<option value="" ${font ? "" : "selected"}>Classic</option>` : ""}
          ${Object.entries(FONTS).map(([n, f]) => `<option value="${esc(f)}" ${f === font ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <button class="mini" type="button" data-act="size" data-v="-4" aria-label="Smaller text">A−</button>
        <button class="mini" type="button" data-act="size" data-v="4" aria-label="Larger text">A+</button>
        ${swatches(INK_COLORS, "ink", ink)}
        <input type="color" data-change="ink" value="${esc(ink)}" aria-label="Custom text color">`;
    let own = "";
    if (it.type === "text") {
      own = `
        ${textControls(it.font, it.color)}
        <button class="mini" type="button" data-act="align">${{ left: "Left", center: "Center", right: "Right" }[it.align || "left"]}</button>`;
    } else if (it.type === "postit") {
      own = `
        ${textControls(it.font || FONTS.Handwritten, it.ink || "#161412")}
        <span class="context__label">Paper</span>
        ${swatches(NOTE_COLORS, "paper", it.color)}`;
    } else if (it.type === "note") {
      own = `
        ${textControls(it.font || "", it.ink || "#161412", true)}
        <span class="context__label">Paper</span>
        ${swatches(["#fffdf7", ...NOTE_COLORS], "paper", it.color)}`;
    } else if (it.type === "photo") {
      own = `
        <select data-change="frame" aria-label="Photo frame">
          ${Object.entries(FRAMES).map(([k, n]) => `<option value="${k}" ${k === (it.frame || "polaroid") ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <button class="mini" type="button" data-act="replace">${it.media ? "Swap photo" : "Choose photo"}</button>`;
    } else if (it.type === "map") {
      own = `<button class="mini" type="button" data-act="places">Edit places</button>`;
    }
    box.innerHTML = `
      ${own}
      <span class="toolbar__gap"></span>
      <button class="mini" type="button" data-act="forward">Bring forward</button>
      <button class="mini" type="button" data-act="backward">Send back</button>
      <button class="mini" type="button" data-act="duplicate">Copy</button>
      <button class="mini mini--danger" type="button" data-act="remove">Delete</button>`;
  }

  function drawDrawer() {
    const box = document.getElementById("drawer");
    if (!box) return;
    box.hidden = !state.drawer;
    document.querySelectorAll("[data-drawer]").forEach((b) => b.classList.toggle("is-on", b.dataset.drawer === state.drawer));
    document.querySelector(".book-view").classList.toggle("is-drawing", drawing());
    if (!drawing()) state.doodle = null;
    if (drawing()) {
      box.innerHTML = `
        <div class="drawer__group draw-bar">
          <p class="label">Draw on the page</p>
          <div class="draw-bar__row">
            ${Object.keys(PENS).map((k) => `<button class="mini${k === state.pen.kind ? " is-on" : ""}" type="button" data-act="pen" data-v="${k}">${k}</button>`).join("")}
            <span class="draw-bar__gap"></span>
            ${swatches(PEN_COLORS, "pen-color", state.pen.color)}
            <input type="color" data-change="pen-color" value="${esc(state.pen.color)}" aria-label="Custom pen color">
            <span class="toolbar__gap"></span>
            <button class="pill pill--solid" type="button" data-act="drawer" data-drawer="draw">Done drawing</button>
          </div>
          <p class="hint">Everything you draw now becomes one doodle you can move or resize afterwards. Undo removes the last line.</p>
        </div>`;
    } else if (state.drawer === "stickers") {
      const { emoji, graphics } = window.STICKERS;
      box.innerHTML = `
        <div class="drawer__group">
          <p class="label">Graphics</p>
          <div class="sticker-grid">
            ${Object.entries(graphics).map(([k, g]) => `<button class="sticker sticker--g" type="button" data-act="sticker" data-graphic="${k}" aria-label="${k}">${g.svg}</button>`).join("")}
          </div>
        </div>
        ${Object.entries(emoji).map(([name, list]) => `
          <div class="drawer__group">
            <p class="label">${name}</p>
            <div class="sticker-grid">
              ${list.map((e) => `<button class="sticker" type="button" data-act="sticker" data-emoji="${e}">${e}</button>`).join("")}
            </div>
          </div>`).join("")}
        <p class="hint">Have your own sticker? Add it with Photo / video and set its frame to No border.</p>`;
    } else if (state.drawer === "page") {
      const page = state.book.pages[state.active];
      box.innerHTML = `
        <div class="drawer__group">
          <p class="label">Style for page ${state.active + 1}</p>
          <div class="bg-grid">
            ${Object.entries(BACKGROUNDS).map(([k, n]) => `<button class="bg-chip bg-${k}${k === page.bg && !page.color ? " is-on" : ""}" type="button" data-act="bg" data-v="${k}">${n}</button>`).join("")}
            <label class="swatch-custom">Any color<input type="color" data-change="pagecolor" value="${esc(page.color || "#f3ecdc")}"></label>
          </div>
        </div>`;
    } else box.innerHTML = "";
  }

  /* ---------- Map ---------- */

  function buildMap(el, interactive) {
    if (!window.L) {
      el.innerHTML = `<p class="map-off">The map needs an internet connection</p>`;
      return null;
    }
    const map = L.map(el, {
      zoomControl: interactive, dragging: interactive, doubleClickZoom: interactive, touchZoom: interactive,
      scrollWheelZoom: false, boxZoom: false, keyboard: false
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);
    map.pins = L.layerGroup().addTo(map);
    drawPins(map);
    return map;
  }

  function drawPins(map, keepView) {
    const places = state.book.places;
    map.pins.clearLayers();
    places.forEach((p, i) => {
      const icon = L.divIcon({ className: "", html: `<span class="pin">${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(`<strong>${esc(p.name)}</strong>${p.note ? `<br>${esc(p.note)}` : ""}`)
        .addTo(map.pins);
    });
    if (places.length > 1) {
      L.polyline(places.map((p) => [p.lat, p.lng]), { color: "#a8402f", weight: 2, dashArray: "6 7" }).addTo(map.pins);
    }
    if (keepView) return;
    if (!places.length) map.setView([25, 5], 1);
    else if (places.length === 1) map.setView([places[0].lat, places[0].lng], 10);
    else map.fitBounds(places.map((p) => [p.lat, p.lng]), { padding: [34, 34] });
  }

  function placesDialog() {
    if (!window.L) return toast("The map needs an internet connection");
    pushUndo();
    openOverlay(`
      <header class="overlay-head overlay-head--tight">
        <p class="eyebrow">The map</p>
        <h2 class="masthead__title masthead__title--sm">Places visited</h2>
        <p class="hint">Search for a place, or click the map to drop a pin.</p>
      </header>
      <div class="places">
        <div class="places__map" id="placesMap"></div>
        <div class="places__side">
          <form class="places__search" id="placeSearch">
            <input name="q" placeholder="Search for a place" aria-label="Search for a place">
            <button class="mini" type="submit">Search</button>
          </form>
          <ul class="places__results" id="placeResults"></ul>
          <ol class="places__list" id="placeList"></ol>
        </div>
      </div>`, "wide", (root) => {
      const map = buildMap(root.querySelector("#placesMap"), true);
      setTimeout(() => map.invalidateSize(), 450);
      const list = root.querySelector("#placeList");
      const results = root.querySelector("#placeResults");
      const places = () => state.book.places;

      const changed = (keepView) => { drawPins(map, keepView); commit(); };

      function drawList() {
        list.innerHTML = places().map((p, i) => `
          <li data-i="${i}">
            <span class="pin">${i + 1}</span>
            <div class="places__fields">
              <input data-k="name" value="${esc(p.name)}" aria-label="Place name">
              <input data-k="note" value="${esc(p.note)}" placeholder="A note for the pin" aria-label="Note">
            </div>
            <button class="mini" type="button" data-do="up" aria-label="Move earlier" ${i ? "" : "disabled"}>↑</button>
            <button class="mini mini--danger" type="button" data-do="remove" aria-label="Remove">×</button>
          </li>`).join("") || `<li class="hint">No places yet.</li>`;
      }

      function add(name, lat, lng) {
        places().push({ id: Store.uid(), name, lat, lng, note: "" });
        changed();
        drawList();
      }

      map.on("click", (e) => {
        add("New place", +e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5));
        const inputs = list.querySelectorAll('[data-k="name"]');
        inputs[inputs.length - 1].select();
      });

      list.addEventListener("input", (e) => {
        const li = e.target.closest("[data-i]");
        places()[+li.dataset.i][e.target.dataset.k] = e.target.value;
        changed(true);
      });
      list.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-do]");
        if (!btn) return;
        const i = +btn.closest("[data-i]").dataset.i;
        if (btn.dataset.do === "remove") places().splice(i, 1);
        else [places()[i - 1], places()[i]] = [places()[i], places()[i - 1]];
        changed();
        drawList();
      });

      root.querySelector("#placeSearch").onsubmit = async (e) => {
        e.preventDefault();
        const q = e.target.q.value.trim();
        if (!q) return;
        results.innerHTML = `<li class="hint">Searching…</li>`;
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
          const found = await fetch(url).then((r) => r.json());
          results.innerHTML = found.map((f, i) => `<li><button class="text-link" type="button" data-r="${i}">${esc(f.display_name)}</button></li>`).join("") || `<li class="hint">Nothing found. Try clicking the map instead.</li>`;
          results.onclick = (ev) => {
            const b = ev.target.closest("[data-r]");
            if (!b) return;
            const f = found[+b.dataset.r];
            add(f.name || f.display_name.split(",")[0], +(+f.lat).toFixed(5), +(+f.lon).toFixed(5));
            results.innerHTML = "";
            e.target.q.value = "";
          };
        } catch {
          results.innerHTML = `<li class="hint">Search isn't available right now. Try clicking the map instead.</li>`;
        }
      };

      drawList();
      return () => { map.remove(); drawSpread(); };
    });
  }

  /* ---------- Overlay ---------- */

  let cleanup = null;

  function openOverlay(html, variant, mount) {
    overlay.innerHTML = `
      <div class="overlay__backdrop" data-close></div>
      <div class="overlay__panel overlay__panel--${variant}" role="dialog" aria-modal="true">
        <button class="close" type="button" data-close aria-label="Close">×</button>
        ${html}
      </div>`;
    overlay.hidden = false;
    document.body.classList.add("no-scroll");
    cleanup = (mount && mount(overlay)) || null;
  }

  function closeOverlay() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    const done = cleanup;
    cleanup = null;
    if (done) done();
    overlay.innerHTML = "";
    document.body.classList.remove("no-scroll");
  }

  overlay.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) return closeOverlay();
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "export") {
      if (!window.JSZip) return toast("Exporting needs an internet connection");
      await saveNow();
      toast("Packing up your scrapbook…");
      const blob = await Store.exportBook(state.book);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.book.place.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-scrapbook.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    if (act.dataset.act === "delete-book") {
      if (!confirm(`Delete “${state.book.place}” and its photos from this device? This can't be undone.`)) return;
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      await Store.deleteBook(state.book);
      closeOverlay();
      location.hash = "#/";
    }
  });

  /* ---------- Buttons ---------- */

  // A post-it's or note's color is its paper, so its writing color is kept as ink
  const inkField = () => (["postit", "note"].includes(find(state.sel).type) ? "ink" : "color");

  const stickerSize = (b) => {
    if (b.dataset.graphic) {
      const g = window.STICKERS.graphics[b.dataset.graphic];
      return { graphic: b.dataset.graphic, w: g.w, h: g.h };
    }
    return { emoji: b.dataset.emoji, w: 96, h: 96 };
  };

  const actions = {
    "new-book": () => bookDialog(null),
    "sign-in": signInDialog,
    "sign-out": async () => {
      await saveNow();
      await Store.signOut();
      render();
    },
    details: () => bookDialog(state.book),
    share: async () => {
      if (!state.book.static && !state.book.shared) {
        return toast(Store.cloud
          ? "Only you can see this book. Turn on “Show on the public shelf” in Book details to share it."
          : "This book only lives on this device so far. Publish it to share a link.");
      }
      try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
      catch { toast("Copy the link from your address bar"); }
    },
    "toggle-edit": () => {
      state.editing = !state.editing;
      state.sel = null;
      state.drawer = null;
      renderBookShell();
    },
    prev: () => turn(-1),
    next: () => turn(1),
    undo: () => timeTravel(state.undo, state.redo),
    redo: () => timeTravel(state.redo, state.undo),
    drawer: (b) => {
      state.drawer = state.drawer === b.dataset.drawer ? null : b.dataset.drawer;
      if (drawing()) select(null);
      drawDrawer();
      fit();
    },
    pen: (b) => { state.pen.kind = b.dataset.v; drawDrawer(); },
    "pen-color": (b) => { state.pen.color = b.dataset.v; drawDrawer(); },
    "add-text": () => addItem({ type: "text", text: "", w: 320, h: 70, font: FONTS.Handwritten, size: 40, color: "#161412", align: "left" }),
    "add-note": () => addItem({ type: "note", when: "", title: "", text: "", w: 300, h: 210, color: "#fffdf7", rot: -1 }),
    "add-postit": () => addItem({ type: "postit", text: "", w: 190, h: 190, color: NOTE_COLORS[hash(Store.uid()) % NOTE_COLORS.length], rot: 2 }),
    "add-map": () => {
      addItem({ type: "map", w: 440, h: 340 });
      if (!state.book.places.length) placesDialog();
    },
    "add-pages": () => {
      pushUndo();
      state.book.pages.push(blankPage(), blankPage());
      state.first = state.book.pages.length - 2;
      state.active = state.first;
      state.sel = null;
      commit();
      drawSpread();
    },
    "delete-page": () => {
      const pages = state.book.pages;
      if (pages.length === 1) return toast("A scrapbook needs at least one page");
      pushUndo();
      pages.splice(state.active, 1);
      state.active = Math.min(state.active, pages.length - 1);
      commit();
      drawSpread();
      drawContext();
      toast("Page deleted. Undo brings it back.");
    },
    sticker: (b) => addItem({ type: "sticker", ...stickerSize(b) }),
    bg: (b) => {
      pushUndo();
      const page = state.book.pages[state.active];
      page.bg = b.dataset.v;
      delete page.color;
      commit();
      drawSpread();
      drawDrawer();
    },
    forward: () => layer(1),
    backward: () => layer(-1),
    duplicate,
    remove: removeSelected,
    size: (b) => {
      const it = find(state.sel);
      update({ size: Math.max(8, (it.size || TEXT_SIZE[it.type]) + +b.dataset.v) });
    },
    align: () => update({ align: { left: "center", center: "right", right: "left" }[find(state.sel).align || "left"] }),
    ink: (b) => update({ [inkField()]: b.dataset.v }),
    paper: (b) => update({ color: b.dataset.v }),
    replace: () => document.getElementById("replaceIn").click(),
    places: placesDialog
  };

  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && actions[b.dataset.act]) actions[b.dataset.act](b);
  });

  app.addEventListener("change", (e) => {
    const kind = e.target.dataset.change;
    if (kind === "font") update({ font: e.target.value });
    if (kind === "ink") update({ [inkField()]: e.target.value });
    if (kind === "frame") {
      const it = find(state.sel);
      const was = (it.frame || "polaroid") === "polaroid", now = e.target.value === "polaroid";
      update({ frame: e.target.value, h: it.h + (now === was ? 0 : now ? 58 : -58) });
    }
    if (kind === "pen-color") {
      state.pen.color = e.target.value;
      drawDrawer();
    }
    if (kind === "pagecolor") {
      pushUndo();
      state.book.pages[state.active].color = e.target.value;
      commit();
      drawSpread();
      drawDrawer();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) return closeOverlay();
    if (!state.editing || !overlay.hidden) return;
    const typing = e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if (typing) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? actions.redo() : actions.undo();
    }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); return actions.redo(); }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); return duplicate(); }
    const it = find(state.sel);
    if (!it) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); }
    if (e.key === "Escape") select(null);
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 2;
      it.x += arrows[0] * step;
      it.y += arrows[1] * step;
      itemEl(it.id).style.cssText = boxStyle(it);
      commit();
    }
  });

  /* ---------- A sample book to play with ---------- */

  function sampleBook() {
    const id = Store.uid;
    const tape = (name, x, y, rot) => ({ id: id(), type: "sticker", graphic: name, x, y, w: 150, h: 38, rot });
    const emoji = (e, x, y, size, rot) => ({ id: id(), type: "sticker", emoji: e, x, y, w: size, h: size, rot });
    return {
      id: id(), created: Date.now(), updated: Date.now(),
      place: "Sample Trip", dates: "Delete me anytime", color: "#27405e",
      places: [
        { id: id(), name: "Lisbon", lat: 38.7223, lng: -9.1393, note: "" },
        { id: id(), name: "Sintra", lat: 38.8029, lng: -9.3817, note: "" },
        { id: id(), name: "Porto", lat: 41.1579, lng: -8.6291, note: "" }
      ],
      pages: [
        {
          id: id(), bg: "cream", items: [
            { id: id(), type: "text", text: "A sample scrapbook", x: 60, y: 44, w: 480, h: 80, rot: -2, font: FONTS.Handwritten, size: 58, color: "#161412", align: "center" },
            { id: id(), type: "photo", media: "", frame: "polaroid", caption: "Your photo here", x: 70, y: 150, w: 290, h: 340, rot: -4 },
            tape("tape-yellow", 140, 136, -6),
            { id: id(), type: "postit", text: "Click Edit pages, then drag me anywhere!", x: 370, y: 190, w: 190, h: 190, rot: 4, color: "#fbe98a" },
            { id: id(), type: "note", when: "Day 1 · Morning", title: "Activity notes go here", text: "Write what you did, where you ate, and what you'd do again.", x: 240, y: 520, w: 310, h: 210, rot: 1.5, color: "#fffdf7" },
            emoji("🌴", 60, 560, 110, -8),
            emoji("✈️", 470, 60, 80, 10)
          ]
        },
        {
          id: id(), bg: "grid", items: [
            { id: id(), type: "text", text: "Where we went", x: 70, y: 40, w: 460, h: 70, rot: 0, font: FONTS.Elegant, size: 42, color: "#161412", align: "center" },
            { id: id(), type: "map", x: 60, y: 130, w: 480, h: 400, rot: -1 },
            tape("tape-pink", 30, 118, -24),
            tape("tape-blue", 430, 118, 24),
            { id: id(), type: "sticker", graphic: "postmark", x: 60, y: 570, w: 170, h: 110, rot: -8 },
            { id: id(), type: "sticker", graphic: "banner-best", x: 270, y: 610, w: 280, h: 86, rot: 3 }
          ]
        }
      ]
    };
  }

  /* ---------- Start ---------- */

  window.addEventListener("hashchange", render);
  window.addEventListener("resize", () => {
    if (state.book) fit();
    else if (!location.hash.replace(/^#\/?/, "")) renderShelf();
  });
  matchMedia("(max-width: 760px)").addEventListener("change", () => { if (state.book) drawSpread(); });
  window.addEventListener("pagehide", saveNow);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  Store.onAuth(() => { if (!state.editing) render(); });
  Store.ready()
    .catch(() => toast("Couldn't reach the cloud. Showing what's saved here."))
    .then(() => {
      // Coming back from a sign-in link leaves tokens in the address bar
      if (/access_token|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
      render();
    });
})();

/*
  The sticker drawer. Add an emoji to any list to add a sticker.
  Graphics are small drawings: w and h are the size they start at on the page.
*/
(function () {
  const tape = (color) => ({
    w: 200, h: 50,
    svg: `<svg viewBox="0 0 200 50" preserveAspectRatio="none"><path fill="${color}" fill-opacity=".72" d="M0 0l5 6-5 6 5 6-5 7 5 6-5 6 5 7-5 6h200l-5-6 5-6-5-7 5-6-5-6 5-7-5-6 5-6z"/></svg>`
  });

  const ink = "#2b2622";

  window.STICKERS = {
    emoji: {
      Travel: "✈️ 🧳 🗺️ 🧭 📍 🚗 🚆 ⛵ 🚲 🛵 🏖️ 🏔️ 🏕️ ⛺ 🗽 🗼 🏰 🌉 🎡 🎒 📸 🎟️ 🛂 🌍".split(" "),
      Food: "🍕 🍝 🥐 🍣 🌮 🍦 🍷 🍹 ☕ 🍺 🥂 🍔 🧀 🍓 🥖 🍜".split(" "),
      Nature: "☀️ 🌙 ⭐ 🌈 🌊 🌴 🌸 🌻 🍁 🌵 🐚 🦋 🐠 🐢 🐘 🦜".split(" "),
      Fun: "❤️ ✨ 🎉 🎶 💃 😎 🥳 😍 🤩 💌 🎈 🔥 💯 👏 🪩 👑".split(" ")
    },
    graphics: {
      "tape-yellow": tape("#f2cf6b"),
      "tape-pink": tape("#efa3b0"),
      "tape-blue": tape("#8fc3d9"),
      "tape-green": tape("#a9c99a"),
      stamp: {
        w: 110, h: 135,
        svg: `<svg viewBox="0 0 110 135"><rect x="3" y="3" width="104" height="129" fill="#fffdf7" stroke="#b9ad98" stroke-width="4" stroke-dasharray="1 8" stroke-linecap="round"/><rect x="13" y="13" width="84" height="109" fill="#c9553f"/><path fill="#fffdf7" d="M26 74l58-26-17 44-11-15-9 12-3-15z"/><text x="55" y="112" text-anchor="middle" font-family="Special Elite, monospace" font-size="11" fill="#fffdf7">AIR MAIL</text></svg>`
      },
      postmark: {
        w: 170, h: 110,
        svg: `<svg viewBox="0 0 170 110" fill="none" stroke="${ink}" stroke-opacity=".75"><circle cx="55" cy="55" r="50" stroke-width="2.5"/><circle cx="55" cy="55" r="39" stroke-width="1.5"/><text x="55" y="61" text-anchor="middle" font-family="Special Elite, monospace" font-size="16" fill="${ink}" fill-opacity=".75" stroke="none">VISITED</text><path stroke-width="2.5" d="M108 30c10-7 16 7 26 0s16 7 30 0M110 55c10-7 16 7 26 0s16 7 30 0M108 80c10-7 16 7 26 0s16 7 30 0"/></svg>`
      },
      ticket: {
        w: 220, h: 95,
        svg: `<svg viewBox="0 0 220 95"><path fill="#f2cf6b" d="M6 4h208a4 4 0 0 1 4 4v22a17 17 0 0 0 0 35v22a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V65a17 17 0 0 0 0-35V8a4 4 0 0 1 4-4z"/><path stroke="${ink}" stroke-width="2" stroke-dasharray="5 6" d="M160 10v75"/><text x="88" y="56" text-anchor="middle" font-family="Special Elite, monospace" font-size="20" fill="${ink}">ADMIT ONE</text><text x="188" y="56" text-anchor="middle" font-family="Special Elite, monospace" font-size="15" fill="${ink}">No. 1</text></svg>`
      },
      "banner-best": {
        w: 260, h: 80,
        svg: `<svg viewBox="0 0 260 80"><path fill="#a8402f" d="M2 22h40v44H2l12-22z"/><path fill="#a8402f" d="M258 22h-40v44h40l-12-22z"/><rect x="26" y="10" width="208" height="46" fill="#c9553f"/><text x="130" y="43" text-anchor="middle" font-family="Caveat, cursive" font-weight="700" font-size="33" fill="#fffdf7">Best. Day. Ever.</text></svg>`
      },
      "label-wish": {
        w: 260, h: 70,
        svg: `<svg viewBox="0 0 260 70"><rect x="3" y="3" width="254" height="64" rx="4" fill="#fffdf7" stroke="${ink}" stroke-width="2"/><text x="130" y="46" text-anchor="middle" font-family="Playfair Display, serif" font-style="italic" font-size="25" fill="${ink}">Wish you were here</text></svg>`
      },
      arrow: {
        w: 150, h: 90,
        svg: `<svg viewBox="0 0 150 90" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20c32 52 76 60 132 40"/><path d="M116 44l23 15-18 21"/></svg>`
      },
      squiggle: {
        w: 200, h: 34,
        svg: `<svg viewBox="0 0 200 34" fill="none" stroke="#c9553f" stroke-width="5" stroke-linecap="round"><path d="M5 18c16-18 28 16 45 0s28 16 45 0 28 16 45 0 30 16 55-2"/></svg>`
      },
      circle: {
        w: 190, h: 110,
        svg: `<svg viewBox="0 0 190 110" fill="none" stroke="#c9553f" stroke-width="4" stroke-linecap="round"><path d="M120 10C60 0 8 26 6 56c-2 32 56 50 110 46 44-4 72-26 68-52C180 22 130 6 72 16"/></svg>`
      },
      heart: {
        w: 90, h: 84,
        svg: `<svg viewBox="0 0 90 84" fill="none" stroke="#c9553f" stroke-width="4.5" stroke-linejoin="round"><path d="M45 78C20 58 5 44 5 26 5 12 16 5 26 5c9 0 15 5 19 13C49 10 55 5 64 5c10 0 21 7 21 21 0 18-15 32-40 52z"/></svg>`
      },
      star: {
        w: 90, h: 88,
        svg: `<svg viewBox="0 0 90 88" fill="none" stroke="#c99a2e" stroke-width="4.5" stroke-linejoin="round"><path d="M45 6l12 27 30 3-23 20 7 29-26-15-26 15 7-29L3 36l30-3z"/></svg>`
      },
      clip: {
        w: 44, h: 110,
        svg: `<svg viewBox="0 0 44 110" fill="none" stroke="#8d8a85" stroke-width="4.5" stroke-linecap="round"><path d="M32 30v56a11 11 0 0 1-22 0V20a15 15 0 0 1 30 0v64"/></svg>`
      },
      pin: {
        w: 60, h: 90,
        svg: `<svg viewBox="0 0 60 90"><path fill="#a8402f" d="M30 3a27 27 0 0 1 27 27c0 20-27 57-27 57S3 50 3 30A27 27 0 0 1 30 3z"/><circle cx="30" cy="30" r="10" fill="#fffdf7"/></svg>`
      }
    }
  };
})();

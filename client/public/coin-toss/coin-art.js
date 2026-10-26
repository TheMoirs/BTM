// BTM Coin Toss artwork: an old-penny-style bronze coin, a hand and a gravel piste.
// Heads: a generic classical laureate head (not any real monarch). Tails: a seated Britannia.
(function () {
  "use strict";

  function rim(id, legendTop, legendBottom) {
    let beads = "";
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      beads += `<circle cx="${(100 + Math.cos(a) * 89).toFixed(2)}" cy="${(100 + Math.sin(a) * 89).toFixed(2)}" r="1.6" fill="url(#${id}-relief)"/>`;
    }
    const font = `font-family="Georgia, 'Times New Roman', serif" font-size="13" letter-spacing="2" fill="#5a2f14" fill-opacity="0.85" font-weight="bold"`;
    return `
      <defs>
        <radialGradient id="${id}-metal" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#e9b07a"/><stop offset="45%" stop-color="#b8723f"/>
          <stop offset="80%" stop-color="#8a4f27"/><stop offset="100%" stop-color="#6b3a1b"/>
        </radialGradient>
        <linearGradient id="${id}-relief" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f6c999"/><stop offset="100%" stop-color="#7a431f"/>
        </linearGradient>
        <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d9955e"/><stop offset="50%" stop-color="#8f532a"/><stop offset="100%" stop-color="#5e3216"/>
        </linearGradient>
        <path id="${id}-arcTop" d="M 28 100 A 72 72 0 0 1 172 100"/>
        <path id="${id}-arcBottom" d="M 30 100 A 70 70 0 0 0 170 100"/>
      </defs>
      <circle cx="100" cy="100" r="99" fill="url(#${id}-edge)"/>
      <circle cx="100" cy="100" r="94" fill="url(#${id}-metal)"/>
      <circle cx="100" cy="100" r="94" fill="none" stroke="#5e3216" stroke-opacity="0.5" stroke-width="1.5"/>
      ${beads}
      <text ${font}><textPath href="#${id}-arcTop" startOffset="50%" text-anchor="middle">${legendTop}</textPath></text>
      ${legendBottom ? `<text ${font} dominant-baseline="hanging"><textPath href="#${id}-arcBottom" startOffset="50%" text-anchor="middle">${legendBottom}</textPath></text>` : ""}`;
  }

  function heads() {
    const id = "penny-heads";
    let strands = "";
    for (let i = 0; i < 9; i++) {
      strands += `<path d="M ${100 + i * 5} ${56 + i * 3} q 8 ${8 + i} 4 ${20 + i}" fill="none" stroke="#5e3216" stroke-opacity="0.35" stroke-width="1"/>`;
    }
    let laurel = "";
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = 90 + t * 52;
      const y = 62 + t * 10 + Math.sin(t * Math.PI) * -8 + t * t * 18;
      const ang = -25 + t * 85;
      laurel += `<g transform="rotate(${ang.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">
        <ellipse cx="${(x - 4).toFixed(1)}" cy="${(y - 3).toFixed(1)}" rx="6" ry="2.4" fill="#5e3216" fill-opacity="0.55" transform="rotate(-30 ${(x - 4).toFixed(1)} ${(y - 3).toFixed(1)})"/>
        <ellipse cx="${(x + 4).toFixed(1)}" cy="${(y - 3).toFixed(1)}" rx="6" ry="2.4" fill="#5e3216" fill-opacity="0.55" transform="rotate(30 ${(x + 4).toFixed(1)} ${(y - 3).toFixed(1)})"/>
      </g>`;
    }
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Heads">
      ${rim(id, "DEI GRATIA \u00b7 REX", "FID \u00b7 DEF")}
      <path d="M 112 46 C 96 46 86 54 84 66 C 83 72 80 76 80 80 C 80 84 76 90 71 96 C 70 98 72 100 76 100
               C 78 101 79 102 78 104 C 77 106 80 107 80 108 C 79 110 77 111 78 112 C 80 114 82 115 81 117
               C 80 120 78 122 79 125 C 81 130 88 132 93 132 C 96 136 96 146 93 158 L 140 158
               C 136 148 134 138 138 128 C 146 120 152 106 151 90 C 150 64 134 46 112 46 Z"
            fill="url(#${id}-relief)" stroke="#5e3216" stroke-opacity="0.6" stroke-width="1.3"/>
      <path d="M 86 64 C 92 50 110 44 126 48 C 142 54 152 70 151 90 C 150 104 146 116 138 126
               C 136 116 134 108 128 102 C 120 92 120 80 112 74 C 104 68 94 68 86 64 Z" fill="#7a431f" fill-opacity="0.4"/>
      ${strands}
      ${laurel}
      <path d="M 144 112 C 150 120 152 130 148 140 M 144 112 C 154 116 160 124 160 134" fill="none" stroke="#5e3216" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M 118 92 C 124 90 127 98 122 104 C 120 106 117 104 118 100" fill="none" stroke="#5e3216" stroke-opacity="0.6" stroke-width="1.3"/>
      <path d="M 86 81 C 89 79 92 80 93 82" fill="none" stroke="#5e3216" stroke-opacity="0.65" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M 80 108 L 85 108" stroke="#5e3216" stroke-opacity="0.45" stroke-width="1" stroke-linecap="round"/>
      <path d="M 93 158 L 140 158" stroke="#5e3216" stroke-opacity="0.6" stroke-width="1.6"/>
    </svg>`;
  }

  function tails() {
    const id = "penny-tails";
    const relief = `url(#${id}-relief)`;
    const line = `stroke="#5e3216" stroke-opacity="0.6" stroke-width="1.2"`;
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Tails">
      ${rim(id, "ONE PENNY", "1967")}
      <path d="M 44 142 Q 54 138 64 142 T 84 142 T 104 142 T 124 142 T 144 142 T 160 142" fill="none" ${line}/>
      <path d="M 48 149 Q 58 145 68 149 T 88 149 T 108 149 T 128 149 T 148 149" fill="none" ${line}/>
      <path d="M 70 138 C 72 124 84 118 100 118 C 116 118 126 124 128 138 Z" fill="${relief}" ${line}/>
      <line x1="76" y1="44" x2="84" y2="136" stroke="#5e3216" stroke-opacity="0.6" stroke-width="2.4"/>
      <path d="M 70 52 C 70 42 72 38 76 36 M 82 50 C 82 41 80 37 76 36 M 76 36 L 75 30" fill="none" stroke="#5e3216" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>
      <path d="M 96 70 C 88 74 86 86 88 96 C 84 104 82 114 86 124 C 92 132 112 132 118 124 C 120 116 116 108 112 100
               C 114 90 110 76 102 70 Z" fill="${relief}" ${line}/>
      <path d="M 92 84 C 86 86 82 84 79 80" fill="none" stroke="#5e3216" stroke-opacity="0.65" stroke-width="3" stroke-linecap="round"/>
      <circle cx="99" cy="62" r="8" fill="${relief}" ${line}/>
      <path d="M 91 60 C 92 50 104 48 109 56 C 112 52 114 48 112 44" fill="none" stroke="#5e3216" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>
      <circle cx="122" cy="116" r="15" fill="${relief}" ${line}/>
      <path d="M 122 101 L 122 131 M 107 116 L 137 116" stroke="#5e3216" stroke-opacity="0.65" stroke-width="3"/>
      <path d="M 112 106 L 132 126 M 132 106 L 112 126" stroke="#5e3216" stroke-opacity="0.45" stroke-width="1.6"/>
    </svg>`;
  }

  function hand() {
    const fingers = [
      { x: 92, h: 92, r: -8 },
      { x: 128, h: 108, r: -2 },
      { x: 164, h: 104, r: 3 },
      { x: 198, h: 86, r: 9 },
    ]
      .map((f) => `<rect x="${f.x - 16}" y="${112 - f.h}" width="32" height="${f.h + 40}" rx="16" fill="url(#skin)" stroke="#b97f57" stroke-opacity="0.5" transform="rotate(${f.r} ${f.x} 150)"/>`)
      .join("");
    return `<svg viewBox="0 0 300 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f2c9a5"/><stop offset="100%" stop-color="#d9a47c"/></linearGradient>
        <radialGradient id="palm" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#f6d3b3"/><stop offset="100%" stop-color="#dca97f"/></radialGradient>
      </defs>
      ${fingers}
      <rect x="32" y="120" width="34" height="100" rx="17" fill="url(#skin)" stroke="#b97f57" stroke-opacity="0.5" transform="rotate(-52 49 170)"/>
      <path d="M 70 112 C 70 96 230 96 230 112 L 236 196 C 236 236 200 260 150 260 C 100 260 64 236 64 196 Z" fill="url(#palm)" stroke="#b97f57" stroke-opacity="0.5"/>
      <path d="M 92 150 C 120 168 180 168 210 146" fill="none" stroke="#b97f57" stroke-opacity="0.35" stroke-width="2"/>
      <path d="M 96 190 C 130 178 170 180 204 196" fill="none" stroke="#b97f57" stroke-opacity="0.3" stroke-width="2"/>
    </svg>`;
  }

  // A gravel piste, painted to fill the canvas
  function paintGravel(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#b9a888";
    ctx.fillRect(0, 0, w, h);
    const colours = ["#a8957a", "#d8c9b0", "#8c7b63", "#e6dccb", "#c2b195", "#6f6352", "#9d8c72", "#ece4d6"];
    const count = Math.round((w * h) / 9);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.8 + Math.pow(Math.random(), 2.2) * 4.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * (0.6 + Math.random() * 0.4), 0, 0, Math.PI * 2);
      ctx.fillStyle = colours[(Math.random() * colours.length) | 0];
      ctx.fill();
      if (r > 2.2) {
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.35, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(r * 0.3, r * 0.35, r * 0.6, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(60,45,30,0.18)";
        ctx.fill();
      }
      ctx.restore();
    }
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(40,28,15,0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  window.PennyArt = { heads, tails, hand, paintGravel };
})();

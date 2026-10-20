import { useCallback, useEffect, useRef, useState } from "react";
import { PennyHeads, PennyTails } from "@/components/penny";

type Phase = "hand" | "tossing" | "landed";
type Side = "heads" | "tails";

// Fair, unpredictable result
function randomSide(): Side {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0] % 2 === 0 ? "heads" : "tails";
}
function randomInt(min: number, max: number) {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return min + (n[0] % (max - min + 1));
}

// A gravel piste, painted once per screen size
function paintGravel(canvas: HTMLCanvasElement) {
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
    const r = 0.8 + Math.random() ** 2.2 * 4.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (0.6 + Math.random() * 0.4), 0, 0, Math.PI * 2);
    ctx.fillStyle = colours[(Math.random() * colours.length) | 0];
    ctx.fill();
    if (r > 2.2) {
      // small highlight and shadow so stones look rounded
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
  // soft vignette
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(40,28,15,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function Hand() {
  return (
    <svg viewBox="0 0 300 260" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2c9a5" />
          <stop offset="100%" stopColor="#d9a47c" />
        </linearGradient>
        <radialGradient id="palm" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#f6d3b3" />
          <stop offset="100%" stopColor="#dca97f" />
        </radialGradient>
      </defs>
      {/* fingers */}
      {[
        { x: 92, h: 92, r: -8 },
        { x: 128, h: 108, r: -2 },
        { x: 164, h: 104, r: 3 },
        { x: 198, h: 86, r: 9 },
      ].map((f, i) => (
        <rect key={i} x={f.x - 16} y={112 - f.h} width="32" height={f.h + 40} rx="16" fill="url(#skin)" stroke="#b97f57" strokeOpacity="0.5" transform={`rotate(${f.r} ${f.x} 150)`} />
      ))}
      {/* thumb */}
      <rect x="32" y="120" width="34" height="100" rx="17" fill="url(#skin)" stroke="#b97f57" strokeOpacity="0.5" transform="rotate(-52 49 170)" />
      {/* palm and wrist */}
      <path d="M 70 112 C 70 96 230 96 230 112 L 236 196 C 236 236 200 260 150 260 C 100 260 64 236 64 196 Z" fill="url(#palm)" stroke="#b97f57" strokeOpacity="0.5" />
      <path d="M 92 150 C 120 168 180 168 210 146" fill="none" stroke="#b97f57" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M 96 190 C 130 178 170 180 204 196" fill="none" stroke="#b97f57" strokeOpacity="0.3" strokeWidth="2" />
    </svg>
  );
}

export default function CoinTossPage() {
  const [phase, setPhase] = useState<Phase>("hand");
  const [result, setResult] = useState<Side | null>(null);
  const [viewY, setViewY] = useState(0); // sideways turn (degrees), from slow swipes
  const [dragging, setDragging] = useState(false);

  const gravelRef = useRef<HTMLCanvasElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const gravelLayerRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const finalRot = useRef({ x: 0, z: 0 });
  const pointer = useRef<{ x: number; y: number; t: number; baseY: number; mode: "none" | "turn" } | null>(null);

  useEffect(() => {
    document.title = "Coin Toss – BTM";
    const repaint = () => gravelRef.current && paintGravel(gravelRef.current);
    repaint();
    window.addEventListener("resize", repaint);
    return () => window.removeEventListener("resize", repaint);
  }, []);

  const faceUp = (deg: number): Side => (Math.round(deg / 180) % 2 === 0 ? "heads" : "tails");

  const resetToHand = useCallback(() => {
    flyRef.current?.getAnimations().forEach((a) => a.cancel());
    spinRef.current?.getAnimations().forEach((a) => a.cancel());
    handRef.current?.getAnimations().forEach((a) => a.cancel());
    gravelLayerRef.current?.getAnimations().forEach((a) => a.cancel());
    shadowRef.current?.getAnimations().forEach((a) => a.cancel());
    finalRot.current = { x: 0, z: 0 };
    // Pick the coin up with the side it landed on still facing up
    setResult((r) => {
      if (r) setViewY(r === "heads" ? 0 : 180);
      return null;
    });
    setPhase("hand");
  }, []);

  const toss = useCallback(() => {
    if (phase !== "hand" || !flyRef.current || !spinRef.current) return;
    const outcome = randomSide();
    const startFace = faceUp(viewY);
    // Number of half-turns in the air: an even number keeps the same face up
    let halfTurns = randomInt(9, 13);
    if ((halfTurns % 2 === 0) !== (outcome === startFace)) halfTurns += 1;
    const endX = halfTurns * 180;
    const endZ = randomInt(-150, 150);
    finalRot.current = { x: endX, z: endZ };
    setPhase("tossing");

    const duration = 2100;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const d = reduce ? 600 : duration;

    flyRef.current.animate(
      [
        { transform: "translateY(var(--rest-y)) scale(1) rotate(0deg)", easing: "cubic-bezier(.15,.7,.35,1)" },
        { transform: `translateY(-38vh) scale(1.55) rotate(${endZ * 0.5}deg)`, offset: 0.42, easing: "cubic-bezier(.55,0,.85,.4)" },
        { transform: `translateY(0) scale(1) rotate(${endZ}deg)`, offset: 0.84, easing: "ease-out" },
        { transform: `translateY(-14px) scale(1.03) rotate(${endZ}deg)`, offset: 0.9, easing: "ease-in" },
        { transform: `translateY(0) scale(1) rotate(${endZ}deg)`, offset: 0.95 },
        { transform: `translateY(0) scale(1) rotate(${endZ}deg)` },
      ],
      { duration: d, fill: "forwards" },
    );
    const spin = spinRef.current.animate(
      [
        { transform: "rotateX(0deg)" },
        { transform: `rotateX(${endX}deg)`, offset: 0.84 },
        { transform: `rotateX(${endX + 16}deg)`, offset: 0.9 },
        { transform: `rotateX(${endX - 8}deg)`, offset: 0.95 },
        { transform: `rotateX(${endX}deg)` },
      ],
      { duration: d, fill: "forwards", easing: "linear" },
    );
    handRef.current?.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(0)", opacity: 1, offset: 0.12 },
        { transform: "translateY(60vh)", opacity: 0 },
      ],
      { duration: d * 0.55, fill: "forwards", easing: "ease-in" },
    );
    gravelLayerRef.current?.animate(
      [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }],
      { duration: d, fill: "forwards" },
    );
    shadowRef.current?.animate(
      [
        { opacity: 0, transform: "scale(0.4)" },
        { opacity: 0, transform: "scale(0.4)", offset: 0.6 },
        { opacity: 0.55, transform: "scale(1)", offset: 0.84 },
        { opacity: 0.4, transform: "scale(0.92)", offset: 0.9 },
        { opacity: 0.55, transform: "scale(1)" },
      ],
      { duration: d, fill: "forwards" },
    );
    spin.onfinish = () => {
      setResult(outcome);
      setPhase("landed");
    };
  }, [phase, viewY]);

  // Gestures: swipe up to toss; slow sideways swipe turns the coin over
  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: performance.now(), baseY: viewY, mode: "none" };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current;
    if (!p || phase !== "hand") return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.mode === "none" && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      p.mode = "turn";
      setDragging(true);
    }
    if (p.mode === "turn") setViewY(p.baseY + dx * 0.9);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = Math.max(1, performance.now() - p.t);
    if (p.mode === "turn") {
      setDragging(false);
      setViewY((y) => Math.round(y / 180) * 180); // settle on a face
      return;
    }
    const isSwipeUp = dy < -50 && Math.abs(dy) > Math.abs(dx) && dy / dt < -0.25;
    if (!isSwipeUp) return;
    if (phase === "hand") toss();
    else if (phase === "landed") resetToHand();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (phase === "hand") toss();
        else if (phase === "landed") resetToHand();
      }
      if (phase === "hand" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        setViewY((y) => y + (e.key === "ArrowLeft" ? -180 : 180));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, toss, resetToHand]);

  const showing = faceUp(viewY);
  const canClose = typeof window !== "undefined" && !!window.opener;

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ touchAction: "none", overscrollBehavior: "none", background: "linear-gradient(#dbeafe, #f1f5f9 55%, #e2e8f0)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointer.current = null;
        setDragging(false);
        setViewY((y) => Math.round(y / 180) * 180);
      }}
      data-testid="coin-toss"
    >
      {/* Gravel piste (fades in as the coin comes down) */}
      <div ref={gravelLayerRef} className="absolute inset-0" style={{ opacity: phase === "hand" ? 0 : undefined }}>
        <canvas ref={gravelRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* Hand */}
      <div
        ref={handRef}
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{ width: "min(92vw, 480px)", bottom: "-6vh" }}
      >
        <Hand />
      </div>

      {/* Coin */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          ref={shadowRef}
          className="absolute rounded-full"
          style={{
            width: "var(--coin)",
            height: "calc(var(--coin) * 0.9)",
            background: "radial-gradient(closest-side, rgba(30,20,10,0.55), rgba(30,20,10,0))",
            transform: "translate(6%, 10%)",
            opacity: 0,
          }}
        />
        <div
          ref={flyRef}
          style={{ ["--rest-y" as any]: "22vh", transform: phase === "hand" ? "translateY(var(--rest-y))" : undefined, perspective: "900px" }}
        >
          <div
            style={{
              width: "var(--coin)",
              height: "var(--coin)",
              transformStyle: "preserve-3d",
              transform: `rotateY(${viewY}deg)`,
              transition: dragging ? "none" : "transform 450ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <div ref={spinRef} className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
              {/* The coin's edge, so it doesn't vanish when seen side-on (one for turning, one for tossing) */}
              <div
                className="absolute"
                style={{
                  left: "calc(50% - var(--thick) / 2)", top: "4%", width: "var(--thick)", height: "92%",
                  borderRadius: "40%",
                  background: "linear-gradient(90deg,#6b3a1b,#c98a55 45%,#e3a874 55%,#6b3a1b)",
                  transform: "rotateY(90deg)",
                }}
              />
              <div
                className="absolute"
                style={{
                  top: "calc(50% - var(--thick) / 2)", left: "4%", height: "var(--thick)", width: "92%",
                  borderRadius: "40%",
                  background: "linear-gradient(180deg,#6b3a1b,#c98a55 45%,#e3a874 55%,#6b3a1b)",
                  transform: "rotateX(90deg)",
                }}
              />
              <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "translateZ(calc(var(--thick) / 2))" }}>
                <PennyHeads className="w-full h-full" />
              </div>
              <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg) translateZ(calc(var(--thick) / 2))" }}>
                <PennyTails className="w-full h-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Result */}
      {phase === "landed" && result && (
        <div className="absolute inset-x-0 top-[9vh] flex justify-center pointer-events-none" data-testid="coin-result">
          <div
            className="text-white font-bold tracking-widest animate-in zoom-in-50 fade-in duration-300"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "min(18vw, 96px)", textShadow: "0 4px 18px rgba(0,0,0,0.6)" }}
          >
            {result === "heads" ? "Heads" : "Tails"}
          </div>
        </div>
      )}

      {/* Hints and buttons */}
      <div className="absolute inset-x-0 top-0 p-3 flex justify-between items-start">
        <div className="flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 shadow-sm">
          <img src="/btm-logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-semibold text-slate-800">Coin Toss</span>
        </div>
        {canClose && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => window.close()}
            className="rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm"
          >
            Close
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col items-center gap-2 pointer-events-none">
        {phase === "hand" && (
          <div className="rounded-full bg-white/85 backdrop-blur px-4 py-2 text-sm text-slate-700 shadow text-center" data-testid="coin-hint">
            <strong>Swipe up</strong> to toss · <strong>slide sideways</strong> to turn the coin
            <span className="block text-xs text-slate-500">Showing: {showing === "heads" ? "Heads" : "Tails"}</span>
          </div>
        )}
        {phase === "landed" && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={resetToHand}
            className="pointer-events-auto rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg"
            data-testid="button-toss-again"
          >
            Toss again
          </button>
        )}
      </div>

      <style>{`[data-testid="coin-toss"]{--coin:min(44vw,220px);--thick:calc(var(--coin) * 0.07)}`}</style>
    </div>
  );
}

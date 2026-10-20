// An old-penny-style bronze coin, drawn as SVG.
// Heads: a generic laureate head (not any real monarch). Tails: a seated Britannia.

const uid = (side: string) => `penny-${side}`;

function Rim({ id, legendTop, legendBottom }: { id: string; legendTop: string; legendBottom?: string }) {
  const beads = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2;
    return <circle key={i} cx={100 + Math.cos(a) * 89} cy={100 + Math.sin(a) * 89} r={1.6} fill={`url(#${id}-relief)`} />;
  });
  return (
    <>
      <defs>
        <radialGradient id={`${id}-metal`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#e9b07a" />
          <stop offset="45%" stopColor="#b8723f" />
          <stop offset="80%" stopColor="#8a4f27" />
          <stop offset="100%" stopColor="#6b3a1b" />
        </radialGradient>
        <linearGradient id={`${id}-relief`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6c999" />
          <stop offset="100%" stopColor="#7a431f" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9955e" />
          <stop offset="50%" stopColor="#8f532a" />
          <stop offset="100%" stopColor="#5e3216" />
        </linearGradient>
        <path id={`${id}-arcTop`} d="M 28 100 A 72 72 0 0 1 172 100" />
        <path id={`${id}-arcBottom`} d="M 30 100 A 70 70 0 0 0 170 100" />
      </defs>
      <circle cx="100" cy="100" r="99" fill={`url(#${id}-edge)`} />
      <circle cx="100" cy="100" r="94" fill={`url(#${id}-metal)`} />
      <circle cx="100" cy="100" r="94" fill="none" stroke="#5e3216" strokeOpacity="0.5" strokeWidth="1.5" />
      {beads}
      <text fontFamily="Georgia, 'Times New Roman', serif" fontSize="13" letterSpacing="2" fill="#5a2f14" fillOpacity="0.85" fontWeight="bold">
        <textPath href={`#${id}-arcTop`} startOffset="50%" textAnchor="middle">{legendTop}</textPath>
      </text>
      {legendBottom && (
        <text fontFamily="Georgia, 'Times New Roman', serif" fontSize="13" letterSpacing="2" fill="#5a2f14" fillOpacity="0.85" fontWeight="bold" dominantBaseline="hanging">
          <textPath href={`#${id}-arcBottom`} startOffset="50%" textAnchor="middle">{legendBottom}</textPath>
        </text>
      )}
    </>
  );
}

export function PennyHeads({ className }: { className?: string }) {
  const id = uid("heads");
  return (
    <svg viewBox="0 0 200 200" className={className} aria-label="Heads">
      <Rim id={id} legendTop="DEI GRATIA · REX" legendBottom="FID · DEF" />
      {/* Generic classical head in profile, facing left (not any real person) */}
      <g>
        <path
          d="M 112 46 C 96 46 86 54 84 66 C 83 72 80 76 80 80 C 80 84 76 90 71 96 C 70 98 72 100 76 100
             C 78 101 79 102 78 104 C 77 106 80 107 80 108 C 79 110 77 111 78 112 C 80 114 82 115 81 117
             C 80 120 78 122 79 125 C 81 130 88 132 93 132 C 96 136 96 146 93 158 L 140 158
             C 136 148 134 138 138 128 C 146 120 152 106 151 90 C 150 64 134 46 112 46 Z"
          fill={`url(#${id}-relief)`}
          stroke="#5e3216"
          strokeOpacity="0.6"
          strokeWidth="1.3"
        />
        {/* hair */}
        <path
          d="M 86 64 C 92 50 110 44 126 48 C 142 54 152 70 151 90 C 150 104 146 116 138 126
             C 136 116 134 108 128 102 C 120 92 120 80 112 74 C 104 68 94 68 86 64 Z"
          fill="#7a431f"
          fillOpacity="0.4"
        />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M ${100 + i * 5} ${56 + i * 3} q 8 ${8 + i} 4 ${20 + i}`} fill="none" stroke="#5e3216" strokeOpacity="0.35" strokeWidth="1" />
        ))}
        {/* laurel wreath across the head */}
        {Array.from({ length: 9 }, (_, i) => {
          const t = i / 8;
          const x = 90 + t * 52;
          const y = 62 + t * 10 + Math.sin(t * Math.PI) * -8 + t * t * 18;
          const ang = -25 + t * 85;
          return (
            <g key={i} transform={`rotate(${ang} ${x} ${y})`}>
              <ellipse cx={x - 4} cy={y - 3} rx="6" ry="2.4" fill="#5e3216" fillOpacity="0.55" transform={`rotate(-30 ${x - 4} ${y - 3})`} />
              <ellipse cx={x + 4} cy={y - 3} rx="6" ry="2.4" fill="#5e3216" fillOpacity="0.55" transform={`rotate(30 ${x + 4} ${y - 3})`} />
            </g>
          );
        })}
        {/* ribbon ties at the back */}
        <path d="M 144 112 C 150 120 152 130 148 140 M 144 112 C 154 116 160 124 160 134" fill="none" stroke="#5e3216" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
        {/* ear, eye, mouth */}
        <path d="M 118 92 C 124 90 127 98 122 104 C 120 106 117 104 118 100" fill="none" stroke="#5e3216" strokeOpacity="0.6" strokeWidth="1.3" />
        <path d="M 86 81 C 89 79 92 80 93 82" fill="none" stroke="#5e3216" strokeOpacity="0.65" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M 80 108 L 85 108" stroke="#5e3216" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
        {/* bust truncation line */}
        <path d="M 93 158 L 140 158" stroke="#5e3216" strokeOpacity="0.6" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

export function PennyTails({ className }: { className?: string }) {
  const id = uid("tails");
  const relief = `url(#${id}-relief)`;
  const line = { stroke: "#5e3216", strokeOpacity: 0.6, strokeWidth: 1.2 };
  return (
    <svg viewBox="0 0 200 200" className={className} aria-label="Tails">
      <Rim id={id} legendTop="ONE PENNY" legendBottom="1967" />
      {/* Sea */}
      <path d="M 44 142 Q 54 138 64 142 T 84 142 T 104 142 T 124 142 T 144 142 T 160 142" fill="none" {...line} />
      <path d="M 48 149 Q 58 145 68 149 T 88 149 T 108 149 T 128 149 T 148 149" fill="none" {...line} />
      {/* Rock seat */}
      <path d="M 70 138 C 72 124 84 118 100 118 C 116 118 126 124 128 138 Z" fill={relief} {...line} />
      {/* Trident */}
      <line x1="76" y1="44" x2="84" y2="136" {...line} strokeWidth="2.4" stroke="#5e3216" />
      <path d="M 70 52 C 70 42 72 38 76 36 M 82 50 C 82 41 80 37 76 36 M 76 36 L 75 30" fill="none" stroke="#5e3216" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      {/* Figure: robe and body */}
      <path
        d="M 96 70 C 88 74 86 86 88 96 C 84 104 82 114 86 124 C 92 132 112 132 118 124 C 120 116 116 108 112 100
           C 114 90 110 76 102 70 Z"
        fill={relief}
        {...line}
      />
      {/* Arm reaching to trident */}
      <path d="M 92 84 C 86 86 82 84 79 80" fill="none" stroke="#5e3216" strokeOpacity="0.65" strokeWidth="3" strokeLinecap="round" />
      {/* Helmeted head */}
      <circle cx="99" cy="62" r="8" fill={relief} {...line} />
      <path d="M 91 60 C 92 50 104 48 109 56 C 112 52 114 48 112 44" fill="none" stroke="#5e3216" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      {/* Shield with union cross */}
      <g>
        <circle cx="122" cy="116" r="15" fill={relief} {...line} />
        <path d="M 122 101 L 122 131 M 107 116 L 137 116" stroke="#5e3216" strokeOpacity="0.65" strokeWidth="3" />
        <path d="M 112 106 L 132 126 M 132 106 L 112 126" stroke="#5e3216" strokeOpacity="0.45" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

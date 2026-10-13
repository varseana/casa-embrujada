// Fachada de la casa en SVG (viewBox 1600x1000, mismo sistema que .stage).
// Todo es vector: nitido a cualquier zoom de la camara y sin descargas.
// La puerta NO esta aca: es un elemento aparte (DoorLeaf) para poder girarla en 3D.
//
// Coordenadas clave (compartidas con house.css):
//   vano de la puerta: x 712..888, y 478..812 (arco de radio 88)
//   escalones: y 812..866 | porche: y 866..1000

const W = 1600

// Telaraña: radios desde una esquina + hilos curvos entre radios.
function Cobweb({ x, y, r, flip = 1 }: { x: number; y: number; r: number; flip?: 1 | -1 }) {
  const spokes = [0, 18, 38, 58, 76, 90].map((deg) => (deg * Math.PI) / 180)
  const pt = (a: number, d: number) => [x + flip * Math.cos(a) * d, y + Math.sin(a) * d] as const
  const rings = [0.28, 0.5, 0.72, 0.94]
  return (
    <g className="cobweb" fill="none" stroke="rgba(233,226,208,0.16)" strokeWidth="1">
      {spokes.map((a, i) => {
        const [ex, ey] = pt(a, r)
        return <line key={i} x1={x} y1={y} x2={ex} y2={ey} />
      })}
      {rings.map((k, j) => (
        <path
          key={j}
          d={spokes
            .slice(1)
            .map((a, i) => {
              const [ax, ay] = pt(spokes[i], r * k)
              const [bx, by] = pt(a, r * k)
              const [cx, cy] = pt((spokes[i] + a) / 2, r * k * 0.86) // el hilo cede hacia adentro
              return `${i === 0 ? `M${ax} ${ay}` : ''} Q${cx} ${cy} ${bx} ${by}`
            })
            .join(' ')}
        />
      ))}
    </g>
  )
}

// Ventana con luz mortecina; la derecha tiene una silueta que cruza cada tanto.
function Window({ x, ghost = false }: { x: number; ghost?: boolean }) {
  const y = 360
  const w = 130
  const h = 250
  const id = ghost ? 'win-r' : 'win-l'
  return (
    <g>
      <rect x={x - 16} y={y - 18} width={w + 32} height={h + 36} fill="#17120d" />
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="#0a0806" />
      <clipPath id={`${id}-clip`}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <g clipPath={`url(#${id}-clip)`}>
        <rect x={x} y={y} width={w} height={h} fill="url(#glass)" className="win-glow" />
        {ghost && (
          <path
            className="win-ghost"
            d={`M${x + 40} ${y + h} V${y + 120} q0 -46 26 -46 q26 0 26 46 V${y + h} Z`}
            fill="#050403"
          />
        )}
        {/* cortina rasgada */}
        <path
          d={`M${x} ${y} H${x + 46} q-6 70 4 120 q-10 40 -2 130 H${x} Z`}
          fill="#0e0b08"
          opacity="0.9"
        />
      </g>
      {/* parteluces */}
      <rect x={x + w / 2 - 3} y={y} width="6" height={h} fill="#17120d" />
      <rect x={x} y={y + h * 0.42} width={w} height="6" fill="#17120d" />
      {/* vidrio roto, esquina superior derecha */}
      <path
        d={`M${x + w} ${y} l-34 0 l12 18 l-10 10 l16 12 l16 -6 Z`}
        fill="#030202"
        opacity="0.85"
      />
      <rect x={x - 22} y={y + h + 18} width={w + 44} height="12" fill="#1e1811" />
    </g>
  )
}

// Farol de pared con llama que titila (la luz es la unica fuente "calida").
function Lantern({ x }: { x: number }) {
  const y = 520
  return (
    <g>
      <circle
        cx={x}
        cy={y + 30}
        r="120"
        fill="url(#lampHalo)"
        className="lamp-halo"
        style={{ animationDelay: x < W / 2 ? '0s' : '-1.7s' }} // titilan a destiempo
      />
      <path d={`M${x} ${y - 40} v-14 h${x < W / 2 ? -26 : 26}`} stroke="#0c0a08" strokeWidth="5" fill="none" />
      <path d={`M${x - 18} ${y - 22} h36 l-6 -18 h-24 Z`} fill="#0c0a08" />
      <rect x={x - 15} y={y - 22} width="30" height="58" fill="#2a1a08" />
      <ellipse cx={x} cy={y + 12} rx="5" ry="11" fill="#ffcf7a" className="lamp-flame" />
      <path d={`M${x - 15} ${y - 22} V${y + 36} M${x + 15} ${y - 22} V${y + 36} M${x} ${y - 22} V${y + 36}`} stroke="#0c0a08" strokeWidth="2.5" />
      <path d={`M${x - 19} ${y + 36} h38 l-8 12 h-22 Z`} fill="#0c0a08" />
    </g>
  )
}

// Calabaza tallada sobre el escalon, con la vela adentro.
function Pumpkin({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="62" ry="10" fill="#000" opacity="0.6" />
      <path d="M-4 -58 q2 -16 14 -22" stroke="#2f3a2a" strokeWidth="7" strokeLinecap="square" fill="none" />
      <ellipse cx="-22" cy="-28" rx="26" ry="30" fill="#7a3a12" />
      <ellipse cx="22" cy="-28" rx="26" ry="30" fill="#7a3a12" />
      <ellipse cx="0" cy="-29" rx="24" ry="31" fill="#8f4615" />
      <g fill="#ffb648" className="pumpkin-face">
        <path d="M-26 -38 l10 -12 l10 12 Z" />
        <path d="M6 -38 l10 -12 l10 12 Z" />
        <path d="M-30 -18 q30 22 60 0 l-8 2 l-4 -6 l-6 7 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6 l-4 6 Z" />
      </g>
    </g>
  )
}

export default function FacadeArt() {
  return (
    <svg className="facade" viewBox="0 0 1600 1000" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        {/* tablas horizontales del revestimiento */}
        <pattern id="siding" width="1600" height="36" patternUnits="userSpaceOnUse">
          <rect width="1600" height="36" fill="#100d0a" />
          <rect width="1600" height="2" fill="#1c1813" />
          <rect y="31" width="1600" height="5" fill="#060504" />
        </pattern>
        {/* vetas: lineas cortas sueltas sobre las tablas */}
        <pattern id="grain" width="420" height="72" patternUnits="userSpaceOnUse">
          <path d="M12 14 h90 M180 22 h60 M300 9 h96 M60 50 h70 M210 58 h110 M350 46 h50" stroke="#16120e" strokeWidth="1.2" />
        </pattern>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2a14" />
          <stop offset="1" stopColor="#3d2a10" />
        </linearGradient>
        <radialGradient id="lampHalo">
          <stop offset="0" stopColor="#e8a13a" stopOpacity="0.34" />
          <stop offset="0.45" stopColor="#e8a13a" stopOpacity="0.1" />
          <stop offset="1" stopColor="#e8a13a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="porch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120e0a" />
          <stop offset="1" stopColor="#040302" />
        </linearGradient>
        {/* luz que sale por la puerta abierta */}
        <linearGradient id="spill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8a13a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#e8a13a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="vignette" cx="0.5" cy="0.62" r="0.75">
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.92" />
        </radialGradient>
        {/* interior visto por el vano: hall en penumbra con luz de velas al fondo */}
        <radialGradient id="hallLight" cx="0.5" cy="0.8" r="0.7">
          <stop offset="0" stopColor="#6b4318" />
          <stop offset="0.5" stopColor="#24160a" />
          <stop offset="1" stopColor="#070504" />
        </radialGradient>
      </defs>

      {/* pared */}
      <rect y="96" width="1600" height="770" fill="url(#siding)" />
      <rect y="96" width="1600" height="770" fill="url(#grain)" />


      {/* alero: fascia + tejas en escama que cuelgan sobre la pared */}
      <rect width="1600" height="100" fill="#050404" />
      <path
        d={Array.from({ length: 40 }, (_, i) => `M${i * 40} 96 q20 30 40 0 Z`).join(' ')}
        fill="#080605"
      />
      <rect y="92" width="1600" height="5" fill="#16120d" />
      <Cobweb x={0} y={106} r={230} />
      <Cobweb x={1600} y={106} r={150} flip={-1} />

      <Window x={270} />
      <Window x={1200} ghost />

      {/* interior visto por el vano */}
      <path d="M712 812 V566 A88 88 0 0 1 888 566 V812 Z" fill="url(#hallLight)" />
      <g className="hall-hint" fill="#0a0705" opacity="0.7">
        {/* escalera del hall subiendo a la derecha, con baranda */}
        <path d="M784 812 V800 H800 V788 H816 V776 H832 V764 H848 V752 H864 V740 H888 V812 Z" />
        <path d="M780 784 L888 712" stroke="#0a0705" strokeWidth="3" fill="none" />
        <path
          d="M788 812 V781 M804 800 V771 M820 788 V760 M836 776 V749 M852 764 V739 M868 752 V728"
          stroke="#0a0705"
          strokeWidth="2"
        />
      </g>
      {/* marco de la puerta con arco y clave */}
      <path
        d="M676 812 V566 A124 124 0 0 1 924 566 V812 H888 V566 A88 88 0 0 0 712 566 V812 Z"
        fill="#1d1711"
      />
      <path d="M676 566 A124 124 0 0 1 924 566" fill="none" stroke="#2a2118" strokeWidth="3" />
      <path d="M786 436 h28 l-5 46 h-18 Z" fill="#2a2118" />
      <Cobweb x={924} y={566} r={70} flip={-1} />

      <Lantern x={618} />
      <Lantern x={982} />

      {/* escalones */}
      <rect x="640" y="812" width="320" height="26" fill="#1f1912" />
      <rect x="640" y="812" width="320" height="3" fill="#2c241a" />
      <rect x="606" y="838" width="388" height="28" fill="#17130e" />
      <rect x="606" y="838" width="388" height="3" fill="#251e16" />

      {/* porche en perspectiva */}
      <rect y="866" width="1600" height="134" fill="url(#porch)" />
      <path
        d={Array.from({ length: 17 }, (_, i) => {
          const xb = i * 100
          const xt = 800 + (xb - 800) * 0.82
          return `M${xt} 866 L${xb} 1000`
        }).join(' ')}
        stroke="#070504"
        strokeWidth="2"
      />

      {/* luz derramada sobre escalones y porche (se enciende al abrir) */}
      <path className="light-spill" d="M712 812 H888 L1060 1000 H540 Z" fill="url(#spill)" />

      <Pumpkin x={556} y={918} s={0.92} />

      <rect width="1600" height="1000" fill="url(#vignette)" />
    </svg>
  )
}

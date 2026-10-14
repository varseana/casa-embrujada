import { Cobweb } from './FacadeArt'

// Hall interior en SVG (viewBox 1600x1000). Se ancla abajo (ver .hall-stage):
// el piso siempre queda visible y lo que se recorta es el techo.
//
// Coordenadas clave (compartidas con walkers.ts):
//   zocalo: y 560..690 | piso: y 690..1000 | punto de fuga: (800, 420)

export const HALL = { w: 1600, h: 1000, floorTop: 690 }

// Aplique de pared con vela; mismo halo que los faroles de la fachada.
function Sconce({ x }: { x: number }) {
  const y = 400
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="170"
        fill="url(#hallHalo)"
        className="lamp-halo"
        style={{ animationDelay: x < 800 ? '-0.6s' : '-2.2s' }}
      />
      <path d={`M${x - 22} ${y + 44} h44 l-10 14 h-24 Z`} fill="#0c0806" />
      <rect x={x - 3} y={y + 20} width="6" height="26" fill="#0c0806" />
      <rect x={x - 7} y={y - 6} width="14" height="28" fill="#d9ccb0" />
      <ellipse cx={x} cy={y - 16} rx="4" ry="10" fill="#ffcf7a" className="lamp-flame" />
    </g>
  )
}

// Retrato con el lienzo en penumbra; uno trae una silueta mirando.
function Portrait({ x, y, w, h, figure = false }: { x: number; y: number; w: number; h: number; figure?: boolean }) {
  return (
    <g>
      <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} fill="#1d140b" />
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="#2a1d10" />
      <rect x={x} y={y} width={w} height={h} fill="#0f0b07" />
      {figure && (
        <g fill="#060403">
          <ellipse cx={x + w / 2} cy={y + h * 0.36} rx={w * 0.16} ry={h * 0.13} />
          <path d={`M${x + w * 0.18} ${y + h} q0 -${h * 0.42} ${w * 0.32} -${h * 0.46} q${w * 0.32} ${h * 0.04} ${w * 0.32} ${h * 0.46} Z`} />
          {/* ojos que reflejan la vela */}
          <circle cx={x + w * 0.45} cy={y + h * 0.35} r="2" fill="#e8a13a" className="win-glow" />
          <circle cx={x + w * 0.55} cy={y + h * 0.35} r="2" fill="#e8a13a" className="win-glow" />
        </g>
      )}
    </g>
  )
}

export default function HallArt() {
  // tablas del piso: lineas que convergen al punto de fuga
  const boards = Array.from({ length: 25 }, (_, i) => {
    const xb = -400 + i * 100
    const xt = 800 + (xb - 800) * 0.3
    return `M${xt} 690 L${xb} 1000`
  }).join(' ')
  // juntas transversales, mas apretadas hacia el fondo
  const joints = [700, 714, 732, 756, 788, 830, 884, 952].map((y) => `M0 ${y} H1600`).join(' ')

  return (
    <svg className="hall-art" viewBox="0 0 1600 1000" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        {/* papel tapiz: franjas verticales apenas perceptibles */}
        <pattern id="wallpaper" width="64" height="1000" patternUnits="userSpaceOnUse">
          <rect width="64" height="1000" fill="#0d0906" />
          <rect x="30" width="4" height="1000" fill="#110c08" />
        </pattern>
        <radialGradient id="hallHalo">
          <stop offset="0" stopColor="#e8a13a" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#e8a13a" stopOpacity="0.08" />
          <stop offset="1" stopColor="#e8a13a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="archDark" cx="0.5" cy="0.9" r="0.8">
          <stop offset="0" stopColor="#1a1009" />
          <stop offset="1" stopColor="#030201" />
        </radialGradient>
        <radialGradient id="hallVignette" cx="0.5" cy="0.7" r="0.78">
          <stop offset="0.4" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      <rect width="1600" height="690" fill="url(#wallpaper)" />

      {/* arco del fondo hacia la escalera */}
      <path d="M660 690 V380 A140 140 0 0 1 940 380 V690 Z" fill="url(#archDark)" />
      <path
        d="M700 690 V672 H730 V654 H760 V636 H790 V618 H820 V600 H850 V582 H880 V564 H940 V690 Z"
        fill="#070504"
      />
      <path d="M694 650 L940 520" stroke="#070504" strokeWidth="4" />
      <path
        d="M624 690 V380 A176 176 0 0 1 976 380 V690 H940 V380 A140 140 0 0 0 660 380 V690 Z"
        fill="#1d140b"
      />
      <path d="M786 196 h28 l-5 44 h-18 Z" fill="#2a1d10" />

      <Portrait x={250} y={250} w={170} h={220} figure />
      <Portrait x={1190} y={280} w={150} h={180} />

      <Sconce x={520} />
      <Sconce x={1080} />

      {/* zocalo con paneles */}
      <rect y="560" width="1600" height="130" fill="#120c07" />
      <rect y="556" width="1600" height="8" fill="#22170d" />
      <g fill="none" stroke="#0a0604" strokeWidth="3">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={20 + i * 160} y="584" width="130" height="84" />
        ))}
      </g>
      <rect y="684" width="1600" height="8" fill="#22170d" />

      {/* piso de madera en perspectiva */}
      <rect y="690" width="1600" height="310" fill="#150e08" />
      <path d={boards} stroke="#0a0604" strokeWidth="2" />
      <path d={joints} stroke="#0d0805" strokeWidth="1.5" opacity="0.7" />
      {/* alfombra que entra hacia el arco */}
      <path d="M690 690 H910 L1110 1000 H490 Z" fill="#2a0e0a" opacity="0.85" />
      <path d="M704 690 H896 L1082 1000 H518 Z" fill="none" stroke="#4a1a12" strokeWidth="3" opacity="0.6" />
      <rect y="690" width="1600" height="90" fill="url(#floorShade)" />

      <Cobweb x={0} y={0} r={260} />
      <Cobweb x={1600} y={0} r={180} flip={-1} />

      <rect width="1600" height="1000" fill="url(#hallVignette)" />
    </svg>
  )
}

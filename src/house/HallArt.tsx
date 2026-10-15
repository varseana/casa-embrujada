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
      {/* con cada rayo la pintura deja ver lo que hay debajo */}
      {figure && <PortraitSkull cx={x + w / 2} cy={y + h * 0.36} x={x} y={y} w={w} h={h} />}
    </g>
  )
}

// Ventana ojival al fondo de la escalera, vista a traves del arco. Afuera hay
// tormenta: el cielo, el rayo y la luz que entra al hall comparten la misma
// linea de tiempo (.storm-*, 14 s) para que todo destelle a la vez.
const WIN_GLASS = 'M752 480 V370 A96 96 0 0 1 800 287 A96 96 0 0 1 848 370 V480 Z'
const BOLT = 'M814 300 L805 338 L817 343 L798 398 L810 402 L793 470'
const BOLT_BRANCH = 'M806 341 L786 366 L791 371 L777 398'

function StormWindow() {
  return (
    <g>
      <path d="M744 488 V370 A112 112 0 0 1 800 273 A112 112 0 0 1 856 370 V488 Z" fill="#1d140b" />
      <clipPath id="hall-win-clip">
        <path d={WIN_GLASS} />
      </clipPath>
      <g clipPath="url(#hall-win-clip)">
        <rect x="752" y="287" width="96" height="193" fill="#06080c" />
        {/* relampagos lejanos, sin rayo, a otro ritmo */}
        <rect x="752" y="287" width="96" height="193" fill="#8d9bb0" fillOpacity="0.3" className="storm-far" />
        <rect x="752" y="287" width="96" height="193" fill="#9aa9c0" fillOpacity="0.6" className="storm-flash" />
        <g className="storm-bolt" fill="none" stroke="#f3f5f9" strokeLinejoin="miter">
          <path d={BOLT} strokeWidth="7" strokeOpacity="0.22" strokeLinejoin="round" />
          <path d={BOLT} strokeWidth="2.6" />
          <path d={BOLT_BRANCH} strokeWidth="1.4" />
        </g>
        {/* nubes y colina con arbol seco: siluetas contra el destello */}
        <path d="M752 287 H848 V322 q-10 6 -22 2 q-12 9 -26 2 q-14 8 -28 0 q-12 6 -20 -2 Z" fill="#080a0e" />
        <path d="M752 480 V458 q22 -9 42 -3 q26 -13 54 3 V480 Z" fill="#030405" />
        <path
          d="M826 458 V428 M826 440 l-9 -8 M826 434 l8 -9 l4 -2 M817 432 l-3 -6"
          fill="none"
          stroke="#030405"
          strokeWidth="2"
        />
      </g>
      {/* parteluces y alfeizar */}
      <g fill="#1d140b">
        <rect x="798" y="280" width="4" height="200" />
        <rect x="752" y="368" width="96" height="4" />
        <rect x="752" y="424" width="96" height="4" />
      </g>
      <rect x="736" y="486" width="128" height="8" fill="#22170d" />
    </g>
  )
}

// Arana colgando de su hilo; baja y sube despacio (.spider).
function Spider({ x, y }: { x: number; y: number }) {
  // patas en abanico desde la union del cuerpo: rodilla arriba, pie hacia afuera
  const knees = [-7, -3, 2, 6]
  const feet = [-12, -3, 7, 15]
  const legs = knees.flatMap((k, i) =>
    [-1, 1].map((s) => `M${x} ${y + 10} L${x + s * 8} ${y + 10 + k} L${x + s * 13} ${y + 10 + feet[i]}`),
  )
  return (
    <g className="spider">
      <line x1={x} y1={-400} x2={x} y2={y} stroke="rgba(233,226,208,0.2)" strokeWidth="0.8" />
      <path d={legs.join(' ')} fill="none" stroke="rgba(233,226,208,0.24)" strokeWidth="1" />
      <ellipse cx={x} cy={y + 5} rx="4.5" ry="5.5" fill="#050302" stroke="rgba(233,226,208,0.24)" />
      <circle cx={x} cy={y + 12.5} r="2.8" fill="#050302" stroke="rgba(233,226,208,0.24)" />
    </g>
  )
}

// Craneo bajo la pintura del retrato; solo se ve con la luz del rayo.
function PortraitSkull({ cx, cy, x, y, w, h }: { cx: number; cy: number; x: number; y: number; w: number; h: number }) {
  const teeth = [-6, -2, 2, 6].map((d) => `M${cx + d} ${cy + 13} v5`).join(' ')
  return (
    <g className="storm-flash">
      <rect x={x} y={y} width={w} height={h} fill="#c3cee0" fillOpacity="0.07" />
      <g opacity="0.42">
        <path
          d={`M${cx - 20} ${cy - 2} C${cx - 21} ${cy - 28} ${cx + 21} ${cy - 28} ${cx + 20} ${cy - 2}
            C${cx + 20} ${cy + 7} ${cx + 13} ${cy + 9} ${cx + 11} ${cy + 19} H${cx - 11}
            C${cx - 13} ${cy + 9} ${cx - 20} ${cy + 7} ${cx - 20} ${cy - 2} Z`}
          fill="#aeb6c2"
        />
        <g fill="#060403">
          <path d={`M${cx - 14} ${cy - 4} q5 -6 11 -1 q-1 8 -6 8 q-5 0 -5 -7 Z`} />
          <path d={`M${cx + 14} ${cy - 4} q-5 -6 -11 -1 q1 8 6 8 q5 0 5 -7 Z`} />
          <path d={`M${cx} ${cy + 4} l-3 6 h6 Z`} />
        </g>
        <path d={teeth} stroke="#060403" strokeWidth="1.2" />
      </g>
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
        <radialGradient id="hallStormGlow" cx="800" cy="390" r="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c3cee0" stopOpacity="0.2" />
          <stop offset="0.55" stopColor="#c3cee0" stopOpacity="0.06" />
          <stop offset="1" stopColor="#c3cee0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="hall-arch-clip">
          <path d="M660 690 V380 A140 140 0 0 1 940 380 V690 Z" />
        </clipPath>
        <radialGradient id="hallVignette" cx="0.5" cy="0.7" r="0.78">
          <stop offset="0.4" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      <rect width="1600" height="690" fill="url(#wallpaper)" />

      {/* arco del fondo hacia la escalera */}
      <path d="M660 690 V380 A140 140 0 0 1 940 380 V690 Z" fill="url(#archDark)" />
      <StormWindow />
      <rect
        x="660"
        y="240"
        width="280"
        height="450"
        fill="url(#hallStormGlow)"
        clipPath="url(#hall-arch-clip)"
        className="storm-flash"
      />
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
      <Cobweb x={434} y={236} r={58} flip={-1} />
      <Cobweb x={1176} y={266} r={44} />
      {/* hilo suelto junto al aplique y arana bajando junto al arco */}
      <path d="M572 -10 Q576 110 569 205 l-4 9 M569 205 l3 7" fill="none" stroke="rgba(233,226,208,0.14)" strokeWidth="0.8" />
      <Spider x={992} y={232} />

      <rect width="1600" height="1000" fill="url(#hallVignette)" />
    </svg>
  )
}

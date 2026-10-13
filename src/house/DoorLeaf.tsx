// La hoja de la puerta (176x334 en coordenadas de la fachada). Gira sobre la
// bisagra izquierda con CSS 3D; la cara de atras es otro SVG con backface oculta.

const ARCH = 'M0 334 V88 A88 88 0 0 1 176 88 V334 Z'
const PLANKS = [0, 1, 2, 3, 4]
const PLANK_W = 176 / PLANKS.length
const PLANK_TONES = ['#2a1b10', '#24170d', '#2d1d11', '#22160c', '#281a0f']

export function DoorFront() {
  return (
    <svg viewBox="0 0 176 334" className="door-face">
      <defs>
        <clipPath id="door-arch">
          <path d={ARCH} />
        </clipPath>
        <linearGradient id="door-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g clipPath="url(#door-arch)">
        {PLANKS.map((i) => (
          <rect key={i} x={i * PLANK_W} y="0" width={PLANK_W} height="334" fill={PLANK_TONES[i]} />
        ))}
        {PLANKS.slice(1).map((i) => (
          <rect key={i} x={i * PLANK_W - 1} y="0" width="2" height="334" fill="#0c0805" />
        ))}
        {/* vetas */}
        <path
          d="M10 60 q4 40 0 90 M48 120 q-3 50 2 110 M82 30 q5 60 -1 140 M122 180 q-4 50 2 120 M154 70 q3 40 -2 90"
          stroke="#170f08"
          strokeWidth="1.4"
          fill="none"
        />
        <rect width="176" height="334" fill="url(#door-shade)" />
        {/* herrajes: bisagras de lanza desde la izquierda */}
        {[112, 262].map((y) => (
          <g key={y} fill="#0b0b0a">
            <rect x="0" y={y} width="116" height="11" />
            <path d={`M116 ${y - 4} l16 9.5 l-16 9.5 Z`} />
            {[20, 52, 84].map((x) => (
              <rect key={x} x={x} y={y + 3.5} width="4" height="4" fill="#3a332a" />
            ))}
          </g>
        ))}
        <rect x="0" y="330" width="176" height="4" fill="#0b0b0a" />
      </g>
      {/* aldaba: placa + aro (el aro se mueve en cada golpe) */}
      <rect x="78" y="150" width="20" height="26" fill="#0b0b0a" />
      <circle cx="88" cy="158" r="3" fill="#4a4136" />
      <g className="knocker">
        <circle cx="88" cy="186" r="15" fill="none" stroke="#14130f" strokeWidth="5" />
        <circle cx="88" cy="186" r="15" fill="none" stroke="#5a4e3e" strokeWidth="1" />
      </g>
      {/* cerradura y manija */}
      <rect x="140" y="196" width="16" height="34" fill="#0b0b0a" />
      <circle cx="148" cy="206" r="3.2" fill="#000" />
      <path d="M146.4 207 h3.2 l1.6 9 h-6.4 Z" fill="#000" />
      <circle cx="148" cy="222" r="4" fill="#3d352b" />
    </svg>
  )
}

export function DoorBack() {
  return (
    <svg viewBox="0 0 176 334" className="door-face door-back">
      <path d={ARCH} fill="#140d07" />
      <path d="M0 140 H176 M0 250 H176" stroke="#0a0604" strokeWidth="10" />
    </svg>
  )
}

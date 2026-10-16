import { useSyncExternalStore } from 'react'
import { music } from './music'

type Props = {
  // en el minijuego queda solo el disco (se despliega al apuntarlo)
  compact?: boolean
}

// Tocadiscos de la casa: el disco gira a 33 1/3 (1.8 s por vuelta) solo
// mientras suena; el brazo baja al surco al dar play y se aparta en pausa.
export default function MusicPlayer({ compact = false }: Props) {
  const s = useSyncExternalStore(music.subscribe, music.snapshot)
  if (!s.tracks.length) return null
  const track = s.tracks[s.index]
  const label = s.playing ? 'Pausar musica' : 'Reproducir musica'

  return (
    <section
      className={`music bracket${s.playing ? ' is-playing' : ''}${compact ? ' is-compact' : ''}`}
      aria-label="Musica de la casa"
    >
      <button type="button" className="music-deck" onClick={music.toggle} aria-label={label} title={label}>
        <Turntable />
      </button>

      <div className="music-body">
        <div className="music-meta">
          <p className="eyebrow">{s.playing ? 'Sonando en la casa' : 'Silencio en la casa'}</p>
          <p className="music-title" title={track.title}>
            {track.title}
          </p>
          <p className="music-sub">
            {track.artist && <span>{track.artist}</span>}
            <span className="music-count">
              {String(s.index + 1).padStart(2, '0')} / {String(s.tracks.length).padStart(2, '0')}
            </span>
          </p>
          <input
            className="music-seek"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={s.progress}
            onChange={(e) => music.seek(Number(e.target.value))}
            style={{ '--p': s.progress } as React.CSSProperties}
            aria-label="Posicion de la pista"
          />
        </div>

        <div className="music-controls">
          <button
            type="button"
            className="music-btn"
            onClick={music.prev}
            aria-label="Anterior"
            title="Anterior"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6h2v12H6zM20 6v12l-9-6z" />
            </svg>
          </button>
          <button
            type="button"
            className="music-btn is-main"
            onClick={music.toggle}
            aria-label={label}
            title={label}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={s.playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'} />
            </svg>
          </button>
          <button
            type="button"
            className="music-btn"
            onClick={music.next}
            aria-label="Siguiente"
            title="Siguiente"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 6h2v12h-2zM4 6l9 6-9 6z" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}

// Sector de anillo entre r1 y r2, de a1 a a2 (grados, 0 = derecha).
function ringSector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => {
    const t = (a * Math.PI) / 180
    return `${(cx + Math.cos(t) * r).toFixed(2)} ${(cy + Math.sin(t) * r).toFixed(2)}`
  }
  return `M${p(r1, a1)} L${p(r2, a1)} A${r2} ${r2} 0 0 1 ${p(r2, a2)} L${p(r1, a2)} A${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`
}

const CX = 50
const CY = 50
const R = 47
const LABEL_R = 17
// surcos finos y tres separaciones entre pistas (bandas mas oscuras y lisas)
const GROOVES = Array.from({ length: 16 }, (_, i) => LABEL_R + 3 + i * 1.65)
const GAPS = [27.5, 34.5, 41]

function Turntable() {
  return (
    <svg className="turntable" viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <path
          id="vinyl-label-path"
          d={`M${CX} ${CY} m-12.4 0 a12.4 12.4 0 1 1 24.8 0 a12.4 12.4 0 1 1 -24.8 0`}
        />
      </defs>

      {/* plato */}
      <circle cx={CX} cy={CY} r={R + 2} fill="#120c07" />

      <g className="vinyl-disc">
        <circle cx={CX} cy={CY} r={R} fill="#070606" />
        <g fill="none" stroke="rgba(233,226,208,0.05)" strokeWidth="0.6">
          {GROOVES.map((r) => (
            <circle key={r} cx={CX} cy={CY} r={r} />
          ))}
        </g>
        <g fill="none" stroke="#020202" strokeWidth="1.3">
          {GAPS.map((r) => (
            <circle key={r} cx={CX} cy={CY} r={r} />
          ))}
        </g>
        <circle cx={CX} cy={CY} r={R - 0.6} fill="none" stroke="rgba(233,226,208,0.12)" strokeWidth="0.6" />

        {/* etiqueta: ember con texto en circulo y luna; la asimetria deja ver el giro */}
        <circle cx={CX} cy={CY} r={LABEL_R} fill="#b8432b" />
        <circle cx={CX} cy={CY} r={LABEL_R - 1.4} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
        <text
          fontSize="3.3"
          letterSpacing="0.45"
          fill="#e9e2d0"
          fontFamily="var(--font-sans)"
          fontWeight="600"
        >
          <textPath href="#vinyl-label-path" textLength="77" lengthAdjust="spacing">
            VIBE’S HAUNTED HOUSE · LADO A · 33 ·
          </textPath>
        </text>
        <path
          d={`M${CX - 4.5} ${CY - 5.5} a6 6 0 1 0 6.5 8.6 a4.8 4.8 0 1 1 -6.5 -8.6 Z`}
          fill="#e9e2d0"
          opacity="0.9"
        />
        <circle cx={CX} cy={CY} r="1.7" fill="#020202" />
      </g>

      {/* brillo fijo: no gira con el disco, por eso el disco se lee girando */}
      <path d={ringSector(CX, CY, LABEL_R + 1, R - 1, 196, 236)} fill="rgba(233,226,208,0.025)" />
      <path d={ringSector(CX, CY, LABEL_R + 1, R - 1, 208, 224)} fill="rgba(233,226,208,0.04)" />
      <path d={ringSector(CX, CY, LABEL_R + 1, R - 1, 16, 50)} fill="rgba(232,161,58,0.025)" />
      <path d={ringSector(CX, CY, LABEL_R + 1, R - 1, 27, 39)} fill="rgba(232,161,58,0.04)" />

      {/* brazo: pivote arriba a la derecha */}
      <g className="tonearm">
        <rect x="106" y="2" width="5" height="7" fill="#2a1d10" />
        <path
          d="M108 12 L101 50 L81 65"
          fill="none"
          stroke="#d9ccb0"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M84 61 l-6 5 l3 4 l6 -5 Z" fill="#d9ccb0" />
        <circle cx="108" cy="12" r="5.5" fill="#1d140b" stroke="#d9ccb0" strokeWidth="1" />
        <circle cx="108" cy="12" r="1.6" fill="#d9ccb0" />
      </g>
    </svg>
  )
}

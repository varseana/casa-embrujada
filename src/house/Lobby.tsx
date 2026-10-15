import { useEffect, useRef, useState } from 'react'
import { listCharacters, type Character } from '../lib/characters'
import { topScores, type ScoreRow } from '../lib/scores'
import HallArt from './HallArt'
import { HallScene } from './walkers'

type Props = {
  onPlay: () => void
}

// Hall: los disfraces del equipo deambulan por el piso. El fondo es SVG y los
// caminantes van en un canvas encima (ver walkers.ts).
export default function Lobby({ onPlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<HallScene | null>(null)
  const [items, setItems] = useState<Character[] | null>(null)
  const [podium, setPodium] = useState<ScoreRow[] | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = new HallScene(canvas)
    sceneRef.current = scene
    scene.start()
    window.addEventListener('resize', scene.resize)
    return () => {
      window.removeEventListener('resize', scene.resize)
      scene.stop()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    let alive = true
    listCharacters()
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])

  // el lobby se monta de nuevo al volver del juego: el podio se refresca solo
  useEffect(() => {
    let alive = true
    topScores(3)
      .then((rows) => alive && setPodium(rows))
      .catch(() => alive && setPodium([]))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (items) sceneRef.current?.setCharacters(items.map((c) => ({ id: c.id, url: c.thumb_url })))
  }, [items])

  const count = items?.length ?? 0

  return (
    <section className="lobby" aria-label="Hall de la casa">
      <div className="hall-stage">
        <HallArt />
      </div>
      <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" />
      {/* el destello del rayo tambien alcanza a los caminantes */}
      <div className="hall-stage hall-storm storm-flash" aria-hidden="true" />
      <div className="grain" />

      <header className="lobby-head">
        <p className="eyebrow">Hall principal</p>
        <h1>Casa Embrujada</h1>
        <p className="lobby-count" aria-live="polite">
          {items === null
            ? 'Encendiendo las velas…'
            : count === 0
              ? 'El hall esta vacio. Nadie ha llegado todavia.'
              : `${count} ${count === 1 ? 'habitante deambula' : 'habitantes deambulan'} por el hall.`}
        </p>
      </header>

      <aside className="lobby-game">
        <button type="button" className="play-btn bracket" onClick={onPlay}>
          <span className="eyebrow">Minijuego</span>
          <span className="play-label">Revienta los globos</span>
        </button>

        <section className="podium" aria-label="Mejores puntajes">
          <p className="eyebrow">Podio</p>
          {podium === null ? null : podium.length === 0 ? (
            <p className="podium-empty">Nadie ha jugado todavia.</p>
          ) : (
            <ol>
              {podium.map((r, i) => (
                <li key={r.alias}>
                  <span className="podium-rank">{i + 1}</span>
                  <span className="podium-alias">{r.alias}</span>
                  <span className="podium-score">{r.score.toLocaleString('es-CR')}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </section>
  )
}

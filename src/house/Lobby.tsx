import { useEffect, useRef, useState } from 'react'
import { listCharacters, type Character } from '../lib/characters'
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

      <button type="button" className="play-btn bracket" onClick={onPlay}>
        <span className="eyebrow">Minijuego</span>
        <span className="play-label">Revienta los globos</span>
      </button>
    </section>
  )
}

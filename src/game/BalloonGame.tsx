import { useCallback, useEffect, useRef, useState } from 'react'
import { listCharacters } from '../lib/characters'
import { unlockAudio } from '../house/sound'
import { BalloonScene, type GameResult, type Hud } from './engine'
import './game.css'

type Props = {
  onExit: () => void
}

type Phase = 'intro' | 'playing' | 'over'

const MAX_DARTS = 3

// Icono de dardo para el contador de vidas.
function DartIcon({ spent }: { spent: boolean }) {
  return (
    <svg className={spent ? 'dart-icon is-spent' : 'dart-icon'} viewBox="0 0 48 12" aria-hidden="true">
      <path d="M4 6 H38" stroke="#d9ccb0" strokeWidth="2" />
      <path d="M0 6 L6 3.5 V8.5 Z" fill="#9a9384" />
      <path d="M32 6 L46 0 V12 Z" fill="#b8432b" />
    </svg>
  )
}

// Minijuego: el canvas es todo el juego; React solo pinta el HUD y las pantallas
// de inicio y fin.
export default function BalloonGame({ onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<BalloonScene | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [hud, setHud] = useState<Hud | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = new BalloonScene(canvas)
    sceneRef.current = scene
    scene.onHud = setHud
    scene.onOver = (r) => {
      setResult(r)
      setPhase('over')
    }
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
      .then((list) => {
        if (alive) sceneRef.current?.setFaces(list.map((c) => ({ id: c.id, url: c.thumb_url, name: c.name })))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const play = useCallback(() => {
    unlockAudio() // dentro del gesto: el navegador deja sonar los efectos
    setResult(null)
    setPhase('playing')
    sceneRef.current?.newGame()
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  return (
    <section className={`game is-${phase}`} aria-label="Minijuego: Revienta los globos">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') sceneRef.current?.setAim(...point(e))
        }}
        onPointerDown={(e) => {
          if (phase !== 'playing') return
          const [x, y] = point(e)
          sceneRef.current?.setAim(x, y)
          sceneRef.current?.throwAt(x, y)
        }}
        onPointerLeave={() => sceneRef.current?.clearAim()}
      />
      <div className="grain" />

      {phase === 'playing' && hud && (
        <div className="game-hud">
          <div className="hud-room">
            <p className="eyebrow">Cuarto {hud.round + 1}</p>
            <p className="hud-room-name">{hud.roomName}</p>
          </div>
          <div className="hud-score" aria-live="polite">
            <p className="eyebrow">Puntaje</p>
            <p className="hud-score-num">{hud.score.toLocaleString('es-CR')}</p>
            {hud.streak >= 3 && <p className="hud-streak">Racha x{hud.streak}</p>}
          </div>
          <div className="hud-darts" aria-label={`${hud.darts} de ${MAX_DARTS} dardos`}>
            {Array.from({ length: MAX_DARTS }, (_, i) => (
              <DartIcon key={i} spent={i >= hud.darts} />
            ))}
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="game-card bracket">
          <p className="eyebrow">Minijuego</p>
          <h1>Revienta los globos</h1>
          <ul className="game-rules">
            <li>Apunta y haz clic (o toca la pantalla) para lanzar un dardo.</li>
            <li>Tienes 3 dardos. Si aciertas, el dardo vuelve a tu mano. Si fallas, lo pierdes.</li>
            <li>Limpia el cuarto para pasar al siguiente y recuperar un dardo.</li>
          </ul>
          <button type="button" className="game-primary" onClick={play}>
            Empezar
          </button>
        </div>
      )}

      {phase === 'over' && result && (
        <div className="game-card bracket" role="dialog" aria-label="Fin de la partida">
          <p className="eyebrow">Fin de la partida</p>
          <p className="game-final">{result.score.toLocaleString('es-CR')}</p>
          <p className="game-sub">
            {result.rooms === 0
              ? 'Te quedaste en el vestibulo.'
              : `Limpiaste ${result.rooms} ${result.rooms === 1 ? 'cuarto' : 'cuartos'}.`}
          </p>
          <button type="button" className="game-primary" onClick={play}>
            Jugar otra vez
          </button>
        </div>
      )}

      <button type="button" className="skip game-exit" onClick={onExit}>
        Volver al hall
      </button>
    </section>
  )
}

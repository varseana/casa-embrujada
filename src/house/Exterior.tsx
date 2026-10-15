import { useCallback, useEffect, useRef, useState } from 'react'
import FacadeArt from './FacadeArt'
import { DoorBack, DoorFront } from './DoorLeaf'
import { music } from './music'
import { KNOCK_TIMES, playCreak, playKnocks, preloadSamples, unlockAudio } from './sound'

// Exterior: la camara se acerca a la puerta, el visitante toca, la puerta
// rechina y se abre, y la camara entra por el vano.
//
// La "camara" es un transform sobre .stage (escala + desplazamiento con origen
// en el centro de la puerta). Se anima con Web Animations API: sin GSAP, cero KB.

type Phase = 'approach' | 'ready' | 'knocking' | 'opening' | 'entering'

// Geometria de la fachada, en fracciones del stage (ver FacadeArt).
const STAGE_RATIO = 1.6
const DOOR = { w: 176 / 1600, h: 334 / 1000, cy: 645 / 1000 }

const APPROACH_MS = 3400
const OPEN_MS = 2400
const PUSH_MS = 1700

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Mismo calculo que el CSS de .stage: cubre el viewport manteniendo 1.6:1.
function stageSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.max(vw, vh * STAGE_RATIO)
  return { vw, vh, w, h: w / STAGE_RATIO }
}

// Camara al final del acercamiento: la puerta ocupa ~56% del alto y queda
// apenas debajo del centro (se ven los escalones y la calabaza).
function closeShot() {
  const { vh, h } = stageSize()
  const doorPx = DOOR.h * h
  const s = Math.min(2.4, Math.max(1, (0.56 * vh) / doorPx))
  const ty = -(DOOR.cy - 0.5) * h * 0.55
  return { s, ty }
}

// Camara "adentro": el vano cubre todo el viewport.
function pushShot() {
  const { vw, vh, w, h } = stageSize()
  const s = Math.max(vw / (DOOR.w * w), vh / (DOOR.h * h)) * 1.45
  return { s, ty: -(DOOR.cy - 0.5) * h }
}

const cam = (s: number, ty: number, dx = 0, rot = 0) =>
  `translate(-50%, -50%) translate(${dx}px, ${ty}px) rotate(${rot}deg) scale(${s})`

type Props = {
  // true si ya entro en esta sesion: arranca de cerca, sin acercamiento.
  returning: boolean
  onEnter: () => void
}

export default function Exterior({ returning, onEnter }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const doorRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>(returning ? 'ready' : 'approach')
  const busy = useRef(false)

  useEffect(() => {
    preloadSamples()
  }, [])

  // Acercamiento inicial con un leve vaiven "camara en mano".
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const end = closeShot()
    if (returning || reducedMotion()) {
      stage.style.transform = cam(end.s, end.ty)
      setPhase('ready')
      return
    }
    const anim = stage.animate(
      [
        { transform: cam(1, 0, -14, -0.5) },
        { transform: cam(1 + (end.s - 1) * 0.45, end.ty * 0.4, 10, 0.35), offset: 0.45 },
        { transform: cam(end.s, end.ty, 0, 0) },
      ],
      { duration: APPROACH_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
    )
    anim.onfinish = () => {
      anim.commitStyles()
      anim.cancel()
      setPhase((p) => (p === 'approach' ? 'ready' : p))
    }
    return () => anim.cancel()
  }, [returning])

  // Mantener el encuadre si cambia el tamaño de la ventana mientras espera.
  useEffect(() => {
    if (phase !== 'ready') return
    const onResize = () => {
      const end = closeShot()
      if (stageRef.current) stageRef.current.style.transform = cam(end.s, end.ty)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [phase])

  const knockAndEnter = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    unlockAudio() // dentro del gesto: desbloquea tambien la musica del lobby
    music.prime()
    const stage = stageRef.current!
    const door = doorRef.current!
    const reduce = reducedMotion()

    // Si toca durante el acercamiento, saltar al encuadre final.
    stage.getAnimations().forEach((a) => a.finish())
    const close = closeShot()
    stage.style.transform = cam(close.s, close.ty)

    // 1. Toc, toc, toc: la hoja cede un poco hacia adentro en cada golpe.
    setPhase('knocking')
    await playKnocks()
    for (const t of KNOCK_TIMES) {
      setTimeout(() => {
        door.animate(
          [
            { transform: 'rotateY(0deg) translateZ(0)' },
            { transform: 'rotateY(1.2deg) translateZ(-3px)', offset: 0.25 },
            { transform: 'rotateY(0deg) translateZ(0)' },
          ],
          { duration: 220, easing: 'ease-out' },
        )
        sceneRef.current?.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(1.5px)' }, { transform: 'translateY(0)' }],
          { duration: 120 },
        )
      }, t * 1000)
    }
    await sleep(KNOCK_TIMES[KNOCK_TIMES.length - 1] * 1000 + 700)

    // 2. Silencio... y la puerta se abre sola hacia adentro, rechinando, a tirones.
    setPhase('opening')
    void playCreak()
    const open = door.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: 'rotateY(0deg)' },
            { transform: 'rotateY(14deg)', offset: 0.18 },
            { transform: 'rotateY(16deg)', offset: 0.3 }, // se traba
            { transform: 'rotateY(62deg)', offset: 0.62 },
            { transform: 'rotateY(98deg)', offset: 0.9 },
            { transform: 'rotateY(104deg)' },
          ],
      { duration: reduce ? 500 : OPEN_MS, easing: 'cubic-bezier(0.3, 0, 0.3, 1)', fill: 'forwards' },
    )
    // La camara arranca a entrar antes de que termine de abrir.
    await sleep(reduce ? 500 : OPEN_MS * 0.62)

    // 3. Entrar por el vano.
    setPhase('entering')
    if (!reduce) {
      const push = pushShot()
      // Durante el empujon se rasteriza una sola vez: un poco de blur al cruzar
      // el umbral se lee como movimiento y evita re-pintar el SVG a 10x por frame.
      stage.style.willChange = 'transform'
      await stage.animate([{ transform: cam(close.s, close.ty) }, { transform: cam(push.s, push.ty) }], {
        duration: PUSH_MS,
        easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)',
        fill: 'forwards',
      }).finished
    } else {
      await sleep(400)
    }
    await open.finished.catch(() => undefined)
    onEnter()
  }, [onEnter])

  // Saltar toda la secuencia (visitas repetidas). Tambien es un gesto: desbloquea el audio.
  const skip = useCallback(() => {
    if (busy.current) return
    busy.current = true
    unlockAudio()
    music.prime()
    onEnter()
  }, [onEnter])

  return (
    <section className={`exterior is-${phase}`} aria-label="Frente de la casa embrujada">
      <div className="scene" ref={sceneRef}>
        <div className="stage" ref={stageRef}>
          <FacadeArt />
          <div className="doorway">
            <div className="door" ref={doorRef}>
              <DoorFront />
              <DoorBack />
            </div>
            <button
              type="button"
              className="door-hit"
              onClick={knockAndEnter}
              disabled={phase !== 'approach' && phase !== 'ready'}
              aria-label="Tocar la puerta y entrar"
            />
          </div>
        </div>
      </div>

      <div className="fog" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="grain" aria-hidden="true" />

      <header className="exterior-title">
        <p className="eyebrow">Halloween del equipo</p>
        <h1>Casa Embrujada</h1>
      </header>

      <p className="door-hint" aria-hidden={phase !== 'ready'}>
        Tocá la puerta
      </p>

      <button type="button" className="skip" onClick={skip} disabled={phase !== 'approach' && phase !== 'ready'}>
        Entrar directo
      </button>

      <div className="threshold" aria-hidden="true" />
    </section>
  )
}

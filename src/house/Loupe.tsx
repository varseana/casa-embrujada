import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FocusInfo, HallScene } from './walkers'

export type LoupeTarget = {
  id: string
  name: string | null
  hd: string // imagen HD (1400 px)
  thumb: string // el sprite que ya camina: se ve al instante mientras baja la HD
  focus: FocusInfo // donde estaba al señalarla
}

type Props = {
  target: LoupeTarget
  leaving: boolean
  scene: HallScene | null
  onExited: () => void
}

const ZOOM = 1.8
const MARGIN = 8
// centro del lente a la altura de la cara (80% del alto): con 1.8x el lente
// abarca ~54% de la figura, de la cabeza a la cintura. Mas abajo se pierde la cara.
const FACE = 0.8

type Geo = {
  r: number
  cx: number
  cy: number
  img: { left: number; top: number; w: number; h: number }
  labelBelow: boolean
}

// Lupa como una real: aumenta lo que tiene debajo, alrededor del centro del
// lente. Se posa sobre la cara; si el borde la recorta, el
// lente se corre pero el aumento sigue siendo el de ese punto.
function geometry(f: FocusInfo): Geo {
  const w = window.innerWidth
  const h = window.innerHeight
  const r = Math.max(84, Math.min(160, f.fh * 0.5))
  const cx = Math.max(r + MARGIN, Math.min(w - r - MARGIN, f.x))
  const cy = Math.max(r + MARGIN, Math.min(h - r - MARGIN, f.y - f.fh * FACE))
  const left = f.x - f.fw / 2
  const top = f.y - f.fh
  return {
    r,
    cx,
    cy,
    img: { left: r + (left - cx) * ZOOM, top: r + (top - cy) * ZOOM, w: f.fw * ZOOM, h: f.fh * ZOOM },
    labelBelow: cy - r < 64,
  }
}

function place(root: HTMLElement, imgs: (HTMLElement | null)[], g: Geo, face: 1 | -1) {
  root.style.width = root.style.height = `${g.r * 2}px`
  root.style.transform = `translate(${g.cx - g.r}px, ${g.cy - g.r}px)`
  root.style.setProperty('--r', `${g.r}px`)
  root.classList.toggle('is-label-below', g.labelBelow)
  for (const el of imgs) {
    if (!el) continue
    el.style.left = `${g.img.left}px`
    el.style.top = `${g.img.top}px`
    el.style.width = `${g.img.w}px`
    el.style.height = `${g.img.h}px`
    el.style.transform = face < 0 ? 'scaleX(-1)' : ''
  }
}

// Entra desde el borde de pantalla mas cercano a la persona y el mango apunta
// de vuelta hacia ese borde. Al soltar, sale por donde vino.
export default function Loupe({ target, leaving, scene, onExited }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLImageElement>(null)
  const hdRef = useRef<HTMLImageElement>(null)
  const [hdReady, setHdReady] = useState(false)
  // lado y recorrido de entrada: se fijan al aparecer y no cambian
  const [entry] = useState(() => {
    const g = geometry(target.focus)
    const w = window.innerWidth
    const side: 'left' | 'right' = g.cx < w / 2 ? 'left' : 'right'
    const from = side === 'right' ? w - g.cx + g.r * 2.6 : -(g.cx + g.r * 2.6)
    return { side, from }
  })

  useLayoutEffect(() => {
    if (rootRef.current) {
      place(rootRef.current, [thumbRef.current, hdRef.current], geometry(target.focus), target.focus.face)
    }
  }, [target])

  // mientras sea la lupa activa, sigue a la persona (frena sobre la marcha)
  useEffect(() => {
    if (!scene || leaving) return
    scene.onFocusFrame = (f) => {
      if (f.id !== target.id || !rootRef.current) return
      place(rootRef.current, [thumbRef.current, hdRef.current], geometry(f), f.face)
    }
    return () => {
      if (scene.onFocusFrame) scene.onFocusFrame = null
    }
  }, [scene, leaving, target.id])

  return (
    <div
      ref={rootRef}
      className={`loupe is-${entry.side}${leaving ? ' is-leaving' : ''}`}
      style={{ '--from': `${entry.from}px` } as React.CSSProperties}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        // loupe-out normal, loupe-fade con movimiento reducido
        if (leaving && e.target === e.currentTarget.firstChild) onExited()
      }}
    >
      <div className="loupe-body">
        <div className="loupe-handle">
          <span className="loupe-ferrule" />
        </div>
        <div className="loupe-lens">
          <img ref={thumbRef} className="loupe-img" src={target.thumb} alt="" draggable={false} />
          <img
            ref={hdRef}
            className={`loupe-img is-hd${hdReady ? ' is-ready' : ''}`}
            src={target.hd}
            alt=""
            draggable={false}
            onLoad={() => setHdReady(true)}
          />
          <span className="loupe-glare" />
        </div>
        <p className="loupe-name bracket">{target.name ?? 'Habitante sin nombre'}</p>
      </div>
    </div>
  )
}

// Motor de caminantes del hall, portado del desfile de faroles (engine.ts).
// Un unico canvas 2D; cada personaje es el PNG recortado de un colaborador.
//
// Movimiento: steering behaviors (Reynolds / Nature of Code), igual que en
// faroles: posicion + velocidad + aceleracion, "wander" para deambular y
// "containment" para girar antes del borde. Se suma "separation" para que no
// se encimen, porque aca los sprites son mucho mas grandes que un farolero.
//
// Animacion "paper puppet": el PNG es de una sola pieza, asi que no hay piernas
// que girar. Pivote en los pies + vaiven + rebote + aplastado al pisar + sombra
// de contacto, y al cambiar de rumbo el recorte gira como una lamina de papel.

import { HALL } from './HallArt'

export type WalkerInput = {
  id: string
  url: string // miniatura (sprite)
}

// Banda del piso donde apoyan los pies, en fraccion del alto del hall.
const BAND_TOP_F = 0.735
const BAND_BOTTOM_F = 0.975
// Alto del personaje en pantalla segun profundidad (fraccion del alto del hall).
const FIG_BACK_F = 0.24
const FIG_FRONT_F = 0.36
// Con mas personajes que esto el piso se satura: los demas esperan turno y
// van entrando por los costados cuando alguien sale.
const MAX_ON_FLOOR = 22

type Walker = {
  id: string
  img: HTMLImageElement
  px: number
  py: number // posicion de los pies
  vx: number
  vy: number
  wanderTheta: number
  maxSpeed: number
  speedMul: number
  maxForce: number
  face: 1 | -1
  flip: number // -1..1, sigue a face: el giro de la lamina
  cycle: number
  leaving: boolean // va saliendo de escena para dejar entrar a otro
  ttl: number // frames que le quedan en escena (solo si hay cola)
}

function limit(x: number, y: number, max: number): [number, number] {
  const m = Math.hypot(x, y)
  if (m > max && m > 0) return [(x / m) * max, (y / m) * max]
  return [x, y]
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class HallScene {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private walkers: Walker[] = []
  private queue: WalkerInput[] = [] // esperando turno para entrar
  private imgCache = new Map<string, HTMLImageElement>()
  private raf = 0
  private last = 0
  private running = false
  private w = 1600
  private h = 900
  private dpr = 1
  // rectangulo del hall en pantalla (mismo calculo que .hall-stage en CSS)
  private hallTop = 0
  private hallH = 1000
  private calm = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
    this.calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.resize()
  }

  private get bandTop() {
    return this.hallTop + this.hallH * BAND_TOP_F
  }
  private get bandBottom() {
    return Math.min(this.h - 6, this.hallTop + this.hallH * BAND_BOTTOM_F)
  }

  resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.floor(this.w * this.dpr)
    this.canvas.height = Math.floor(this.h * this.dpr)
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.h + 'px'
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // .hall-stage: cubre el viewport a 1.6:1 anclado abajo
    const stageW = Math.max(this.w, this.h * (HALL.w / HALL.h))
    this.hallH = stageW * (HALL.h / HALL.w)
    this.hallTop = this.h - this.hallH
    for (const wk of this.walkers) {
      wk.py = Math.max(this.bandTop, Math.min(this.bandBottom, wk.py))
      if (!wk.leaving) {
        const [l, r] = this.xBounds(wk.py)
        wk.px = Math.max(l, Math.min(r, wk.px))
      }
    }
  }

  private image(it: WalkerInput): HTMLImageElement {
    let img = this.imgCache.get(it.id)
    if (!img || img.src !== it.url) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.src = it.url
      this.imgCache.set(it.id, img)
    }
    return img
  }

  // entering: entra caminando desde un costado (fuera de pantalla)
  private createWalker(it: WalkerInput, entering: boolean): Walker {
    const py = rand(this.bandTop, this.bandBottom)
    const [l, r] = this.xBounds(py)
    const fromLeft = Math.random() < 0.5
    const px = entering ? (fromLeft ? -80 : this.w + 80) : rand(l, r)
    const dir = entering ? (fromLeft ? 1 : -1) : Math.random() < 0.5 ? -1 : 1
    return {
      id: it.id,
      img: this.image(it),
      px,
      py,
      vx: dir * 0.4,
      vy: rand(-0.03, 0.03),
      wanderTheta: rand(-0.2, 0.2),
      maxSpeed: rand(0.38, 0.62),
      speedMul: rand(0.5, 1),
      maxForce: rand(0.008, 0.016),
      face: dir as 1 | -1,
      flip: dir,
      cycle: Math.random() * Math.PI * 2,
      leaving: false,
      ttl: this.lifetime(),
    }
  }

  private lifetime() {
    return rand(25, 50) * 60 // 25..50 s a 60 fps
  }

  // Reconcilia sin resetear a quien ya camina: conserva por id, agrega y quita.
  setCharacters(items: WalkerInput[]) {
    const byId = new Map(items.map((it) => [it.id, it]))
    this.walkers = this.walkers.filter((wk) => {
      const it = byId.get(wk.id)
      if (it) wk.img = this.image(it)
      return Boolean(it)
    })
    const onFloor = new Set(this.walkers.map((wk) => wk.id))
    const pending = items.filter((it) => !onFloor.has(it.id))
    // orden aleatorio: cada visita arranca con otra gente en el piso
    for (let i = pending.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[pending[i], pending[j]] = [pending[j], pending[i]]
    }
    while (this.walkers.length < MAX_ON_FLOOR && pending.length) {
      this.walkers.push(this.createWalker(pending.shift()!, false))
    }
    this.queue = pending
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private frame = (now: number) => {
    if (!this.running) return
    const f = Math.min(Math.max((now - this.last) / 1000, 0.001) * 60, 2)
    this.last = now
    this.update(f)
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  // --- Steering ---------------------------------------------------------
  private cruise(wk: Walker): number {
    return wk.maxSpeed * wk.speedMul * (this.calm ? 0.5 : 1)
  }

  private seek(wk: Walker, tx: number, ty: number): [number, number] {
    const maxS = this.cruise(wk)
    let dx = tx - wk.px
    let dy = ty - wk.py
    const m = Math.hypot(dx, dy)
    if (m > 0) {
      dx = (dx / m) * maxS
      dy = (dy / m) * maxS
    }
    return limit(dx - wk.vx, dy - wk.vy, wk.maxForce)
  }

  private wander(wk: Walker): [number, number] {
    const speed = Math.hypot(wk.vx, wk.vy) || 0.001
    const ahead = 60
    const r = 12
    const fx = wk.px + (wk.vx / speed) * ahead
    const fy = wk.py + (wk.vy / speed) * ahead
    wk.wanderTheta += (Math.random() - 0.5) * 0.25
    wk.wanderTheta *= 0.92
    const theta = wk.wanderTheta + Math.atan2(wk.vy, wk.vx)
    return this.seek(wk, fx + Math.cos(theta) * r, fy + Math.sin(theta) * r * 0.35)
  }

  private figH(py: number): number {
    const depth = (py - this.bandTop) / (this.bandBottom - this.bandTop || 1)
    return Math.min(this.h * 0.55, this.hallH * (FIG_BACK_F + depth * (FIG_FRONT_F - FIG_BACK_F)))
  }

  // Limites horizontales del piso: un poco mas angosto al fondo.
  private xBounds(py: number): [number, number] {
    const depth = (py - this.bandTop) / (this.bandBottom - this.bandTop || 1)
    const inset = this.w * (0.1 - depth * 0.05) + this.figH(py) * 0.2
    return [inset, this.w - inset]
  }

  private containment(wk: Walker): [number, number] {
    const off = 60
    const maxS = this.cruise(wk)
    const [left, right] = this.xBounds(wk.py)
    let dx = 0
    let dy = 0
    let active = false
    if (wk.px < left + off) {
      dx = maxS
      active = true
    } else if (wk.px > right - off) {
      dx = -maxS
      active = true
    }
    if (wk.py < this.bandTop + 10) {
      dy = maxS
      active = true
    } else if (wk.py > this.bandBottom - 6) {
      dy = -maxS
      active = true
    }
    if (!active) return [0, 0]
    if (dx === 0) dx = wk.vx
    if (dy === 0) dy = wk.vy
    const m = Math.hypot(dx, dy)
    if (m > 0) {
      dx = (dx / m) * maxS
      dy = (dy / m) * maxS
    }
    return limit(dx - wk.vx, dy - wk.vy, wk.maxForce * 2.5)
  }

  // Separacion: se apartan de quien tienen muy cerca en la misma profundidad.
  private separation(wk: Walker): [number, number] {
    const reach = this.figH(wk.py) * 0.35
    let sx = 0
    let sy = 0
    let n = 0
    for (const o of this.walkers) {
      if (o === wk) continue
      const dx = wk.px - o.px
      const dy = (wk.py - o.py) * 3 // la profundidad pesa mas: 3 px de piso ~ 1 px de ancho
      const d = Math.hypot(dx, dy)
      if (d > 0 && d < reach) {
        sx += dx / d / d
        sy += dy / d / d
        n++
      }
    }
    if (!n) return [0, 0]
    const maxS = this.cruise(wk)
    const m = Math.hypot(sx, sy) || 1
    return limit((sx / m) * maxS - wk.vx, (sy / m) * maxS - wk.vy, wk.maxForce * 1.5)
  }

  private update(f: number) {
    const crowded = this.queue.length > 0
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const wk = this.walkers[i]

      wk.speedMul += (Math.random() - 0.5) * 0.03 * f
      wk.speedMul = Math.max(0.4, Math.min(1, wk.speedMul))

      if (crowded && !wk.leaving) {
        wk.ttl -= f
        if (wk.ttl <= 0) wk.leaving = true
      }

      let ax: number
      let ay: number
      if (wk.leaving) {
        // sale por el costado mas cercano
        const exitX = wk.px < this.w / 2 ? -200 : this.w + 200
        ;[ax, ay] = this.seek(wk, exitX, wk.py)
      } else {
        const [wx, wy] = this.wander(wk)
        const [cx, cy] = this.containment(wk)
        const [sx, sy] = this.separation(wk)
        ax = wx + cx * 1.6 + sx
        ay = wy + cy * 1.6 + sy
      }

      wk.vx += ax * f
      wk.vy += ay * f
      ;[wk.vx, wk.vy] = limit(wk.vx, wk.vy, this.cruise(wk))
      wk.px += wk.vx * f
      wk.py += wk.vy * f
      wk.py = Math.max(this.bandTop, Math.min(this.bandBottom, wk.py))

      // al entrar desde afuera no se lo frena hasta que pisa el hall
      const [left, right] = this.xBounds(wk.py)
      const inside = wk.px >= left && wk.px <= right
      if (!wk.leaving && inside) wk.px = Math.max(left, Math.min(right, wk.px))

      if (Math.abs(wk.vx) > 0.15 * wk.maxSpeed) wk.face = wk.vx >= 0 ? 1 : -1
      // giro de lamina: flip va de -1 a 1 pasando por 0 (el papel de canto)
      wk.flip += (wk.face - wk.flip) * Math.min(1, 0.09 * f)

      wk.cycle += Math.hypot(wk.vx, wk.vy) * f * 0.16

      // salio de escena: entra el siguiente de la cola por un costado
      if (wk.leaving && (wk.px < -150 || wk.px > this.w + 150)) {
        const gone = this.walkers.splice(i, 1)[0]
        const next = this.queue.shift()
        if (next) {
          this.walkers.push(this.createWalker(next, true))
          this.queue.push({ id: gone.id, url: gone.img.src })
        } else {
          this.walkers.push(this.createWalker({ id: gone.id, url: gone.img.src }, true))
        }
      }
    }
    // de atras (arriba) hacia adelante (abajo)
    this.walkers.sort((a, b) => a.py - b.py)
  }

  // --- Render -----------------------------------------------------------
  private draw() {
    const { ctx } = this
    ctx.clearRect(0, 0, this.w, this.h)
    for (const wk of this.walkers) this.drawWalker(wk)
  }

  private drawWalker(wk: Walker) {
    const { ctx } = this
    const { img } = wk
    if (!img.complete || img.naturalWidth === 0) return

    const fh = this.figH(wk.py)
    const fw = fh * (img.naturalWidth / img.naturalHeight)
    const moving = Math.min(1, Math.hypot(wk.vx, wk.vy) / (wk.maxSpeed || 1))
    const step = Math.sin(wk.cycle) // -1..1: un paso por medio ciclo
    const lift = this.calm ? 0 : Math.abs(step) * moving // 0 = pie en el piso
    const sway = this.calm ? 0 : step * 0.045 * moving
    const bob = lift * fh * 0.022
    // aplastado breve al apoyar: maximo cuando lift ~ 0
    const squash = this.calm ? 0 : (1 - lift) * 0.03 * moving

    // sombra de contacto: se achica cuando el cuerpo sube
    const shadowW = fw * 0.42 * (1 - lift * 0.15)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.ellipse(wk.px, wk.py, shadowW, fh * 0.03, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(wk.px, wk.py - bob)
    ctx.rotate(sway)
    // flip cerca de 0 = la lamina de canto; nunca 0 exacto para no desaparecer
    const sx = Math.sign(wk.flip || 1) * Math.max(0.06, Math.abs(wk.flip))
    ctx.scale(sx * (1 + squash), 1 - squash)
    ctx.drawImage(img, -fw / 2, -fh, fw, fh)
    ctx.restore()
  }
}

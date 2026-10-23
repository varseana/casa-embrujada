// Motor del minijuego "Revienta los globos", en primera persona.
//
// Un unico canvas 2D. Reglas:
//   - 3 dardos = 3 vidas: acertar no gasta el dardo, fallar si.
//   - Al limpiar un cuarto la camara camina por la puerta del fondo al
//     siguiente, con mas globos, mas chicos y mas rapidos. Limpiar devuelve
//     un dardo (maximo 3).
//   - Cada globo lleva adentro a una persona del equipo, al azar; al
//     reventarlo aparece un instante con su nombre.
//
// Todo el tiempo de juego sale de `this.time` (avanza con el dt recortado),
// asi una pestaña en segundo plano no adelanta transiciones ni dardos.

import { playGameOver, playPop, playThrow, playThud } from '../house/sound'
import { paintRoom, roomBox, ROOMS, type Box, type Light } from './rooms'
import {
  byId,
  DRAFT_EVERY,
  drawCards,
  maxScore,
  pointCap,
  statsFor,
  type PowerUp,
  type Stats,
} from './powerups'

export type Face = { id: string; url: string; name: string | null }

export type Hud = {
  score: number
  darts: number
  round: number // 0-based: cuantos cuartos van
  roomName: string
  streak: number
  maxDarts: number
  picks: string[] // mejoras tomadas, en orden (se repiten si se apilan)
}

export type GameResult = { score: number; rooms: number }

const WALK_MS = 1900
const COLORS = ['#c8641e', '#b8432b', '#d9ccb0', '#5d6b3a', '#8a2a22', '#e8a13a']

type Balloon = {
  x: number
  y: number
  z: number // 0 cerca .. 1 lejos
  vx: number
  vy: number
  r: number // radio base (antes de profundidad e inflado)
  color: string
  face: Face | null
  wob: number
  born: number
}

type Dart = { sx: number; sy: number; tx: number; ty: number; start: number; dur: number }
type Stuck = { x: number; y: number; ang: number; s: number }
type Shred = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  life: number
  color: string
  size: number
}
type Reveal = { face: Face; x: number; y: number; size: number; t0: number }
type Float = { x: number; y: number; text: string; t0: number; big: boolean }
type Link = { x1: number; y1: number; x2: number; y2: number; t0: number }

type State = 'idle' | 'playing' | 'clearing' | 'drafting' | 'walking' | 'over'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class BalloonScene {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0
  private running = false
  private time = 0 // ms de juego
  private w = 1600
  private h = 900
  private dpr = 1
  private calm = false

  private box: Box
  private backdrop = document.createElement('canvas')
  private lights: Light[] = []

  private faces: Face[] = []
  private faceBag: Face[] = [] // se vacia antes de repetir caras
  private imgs = new Map<string, HTMLImageElement>()

  private state: State = 'idle'
  private round = 0
  private score = 0
  private darts = 3
  private streak = 0
  private picks: string[] = []
  private stats: Stats = statsFor([])
  private drafts = 0 // elecciones hechas en la partida
  private revives = 0
  private roomShield = 0
  private roomGuard = 0
  private frozenUntil = 0
  private slowUntil = 0
  private balloons: Balloon[] = []
  private volley: Dart[] | null = null // los dardos del lanzamiento en vuelo
  private stuck: Stuck[] = []
  private shreds: Shred[] = []
  private reveals: Reveal[] = []
  private floats: Float[] = []
  private links: Link[] = []
  private aim: { x: number; y: number } | null = null
  private walkStart = 0
  private walkSwitched = false
  private timer: { at: number; run: () => void } | null = null

  onHud: ((hud: Hud) => void) | null = null
  onOver: ((result: GameResult) => void) | null = null
  onDraft: ((cards: PowerUp[]) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
    this.calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.box = roomBox(this.w, this.h)
    this.resize()
  }

  private get unit() {
    return Math.min(this.w, this.h)
  }

  private get room() {
    return ROOMS[this.round % ROOMS.length]
  }

  resize = () => {
    const pw = this.w
    const ph = this.h
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.floor(this.w * this.dpr)
    this.canvas.height = Math.floor(this.h * this.dpr)
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.h + 'px'
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // globos y dardos clavados acompañan el cambio de tamaño
    const kx = this.w / pw
    const ky = this.h / ph
    for (const b of this.balloons) {
      b.x *= kx
      b.y *= ky
    }
    for (const s of this.stuck) {
      s.x *= kx
      s.y *= ky
    }
    this.paintBackdrop()
  }

  private paintBackdrop() {
    this.box = roomBox(this.w, this.h)
    this.backdrop.width = Math.floor(this.w * this.dpr)
    this.backdrop.height = Math.floor(this.h * this.dpr)
    const bctx = this.backdrop.getContext('2d')
    if (!bctx) return
    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.lights = paintRoom(bctx, this.room, this.box)
  }

  setFaces(faces: Face[]) {
    this.faces = faces
    this.faceBag = []
    for (const f of faces) {
      if (this.imgs.has(f.id)) continue
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.src = f.url
      this.imgs.set(f.id, img)
    }
  }

  private nextFace(): Face | null {
    if (!this.faces.length) return null
    if (!this.faceBag.length) {
      this.faceBag = [...this.faces]
      for (let i = this.faceBag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        ;[this.faceBag[i], this.faceBag[j]] = [this.faceBag[j], this.faceBag[i]]
      }
    }
    return this.faceBag.pop() ?? null
  }

  // --- Ciclo ------------------------------------------------------------
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
    const dt = clamp(now - this.last, 0, 50)
    this.last = now
    this.time += dt
    this.update(dt)
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  newGame() {
    this.round = 0
    this.score = 0
    this.streak = 0
    this.picks = []
    this.stats = statsFor([])
    this.darts = this.stats.maxDarts
    this.drafts = 0
    this.revives = 0
    this.slowUntil = 0
    this.volley = null
    this.stuck = []
    this.shreds = []
    this.reveals = []
    this.floats = []
    this.links = []
    this.timer = null
    this.paintBackdrop()
    this.spawnRound()
    this.state = 'playing'
    this.emitHud()
  }

  private emitHud() {
    this.onHud?.({
      score: this.score,
      darts: this.darts,
      round: this.round,
      roomName: this.room.name,
      streak: this.streak,
      maxDarts: this.stats.maxDarts,
      picks: [...this.picks],
    })
  }

  // Dificultad del cuarto n: mas globos, mas chicos, mas rapidos.
  private spawnRound() {
    const n = this.round
    const unit = Math.min(this.w, this.h)
    // las mejoras solo pueden quitar globos: el techo de max_score cuenta min(5+2n,16)
    const count = Math.max(3, Math.min(5 + n * 2, 16) - this.stats.fewer)
    const r = unit * 0.078 * Math.max(0.5, 1 - n * 0.08) * this.stats.balloonSize
    const speed = (0.035 + n * 0.016) * (unit / 800) * this.stats.balloonSpeed // px por ms
    this.roomShield = this.stats.shield
    this.roomGuard = this.stats.streakGuard
    this.frozenUntil = this.stats.freezeMs ? this.time + this.stats.freezeMs + 420 : 0
    this.balloons = Array.from({ length: count }, (_, i) => {
      const a = Math.random() * Math.PI * 2
      const sp = speed * rand(0.6, 1.2)
      return {
        x: rand(this.w * 0.15, this.w * 0.85),
        y: rand(this.h * 0.18, this.h * 0.62),
        z: Math.random(),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6,
        r,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        face: this.nextFace(),
        wob: Math.random() * Math.PI * 2,
        born: this.time + i * 90, // se inflan en cascada
      }
    })
  }

  // --- Entrada ----------------------------------------------------------
  setAim = (x: number, y: number) => {
    this.aim = { x, y }
  }

  clearAim = () => {
    this.aim = null
  }

  // Mira con temblor (Multi Dardo, Doble dardo): lo que se ve es donde cae.
  private jittered(x: number, y: number): [number, number] {
    const j = this.stats.jitter * this.unit
    if (!j || this.calm) return [x, y]
    const t = this.time
    return [
      x + j * (Math.sin(t * 0.031) + Math.sin(t * 0.017 + 1.3)) * 0.5,
      y + j * (Math.sin(t * 0.027 + 0.7) + Math.sin(t * 0.013 + 2.1)) * 0.5,
    ]
  }

  // Puntos de impacto del lanzamiento: abanico perpendicular a la linea de tiro.
  private spread(x: number, y: number): [number, number][] {
    const n = this.stats.shots
    if (n <= 1) return [[x, y]]
    const ang = Math.atan2(y - this.h * 0.98, x - this.w * 0.64)
    const gap = this.unit * 0.04
    return Array.from({ length: n }, (_, i) => {
      const o = (i - (n - 1) / 2) * gap
      return [x - Math.sin(ang) * o, y + Math.cos(ang) * o]
    })
  }

  throwAt = (x: number, y: number) => {
    if (this.state !== 'playing' || this.volley || this.darts <= 0) return
    const [ax, ay] = this.jittered(x, y)
    const sx = this.w * 0.64
    const sy = this.h * 0.98
    const dist = Math.hypot(ax - sx, ay - sy)
    const dur = clamp(220 + dist * 0.28, 260, 520) * this.stats.flight
    this.volley = this.spread(ax, ay).map(([tx, ty]) => ({ sx, sy, tx, ty, start: this.time, dur }))
    playThrow()
  }

  // Mejora elegida en las cartas: se aplica y la camara sigue al proximo cuarto.
  choose = (id: string) => {
    const p = byId(id)
    if (this.state !== 'drafting' || !p) return
    this.picks.push(id)
    this.stats = statsFor(this.picks)
    this.darts = Math.min(this.stats.maxDarts, this.darts + (p.grant ?? 0))
    this.drafts += 1
    this.walk()
    this.emitHud()
  }

  // --- Logica -----------------------------------------------------------
  private displayR(b: Balloon): number {
    const inflate = clamp((this.time - b.born) / 420, 0, 1)
    return b.r * (1 - b.z * 0.42) * (inflate < 1 ? 1 - Math.pow(1 - inflate, 3) : 1)
  }

  private update(dt: number) {
    if (this.timer && this.time >= this.timer.at) {
      const run = this.timer.run
      this.timer = null
      run()
    }

    // globos: deriva + balanceo, rebotan dentro del volumen del cuarto
    const minX = this.w * 0.06
    const maxX = this.w * 0.94
    const minY = this.h * 0.1
    const maxY = this.h * 0.68
    // Calma previa congela, Reloj de arena frena
    const mdt = this.time < this.frozenUntil ? 0 : this.time < this.slowUntil ? dt * 0.35 : dt
    for (const b of this.balloons) {
      if (this.time < b.born) continue
      const R = this.displayR(b)
      b.x += b.vx * mdt
      b.y += b.vy * mdt + Math.sin(this.time * 0.002 + b.wob) * 0.012 * mdt
      if (b.x < minX + R) {
        b.x = minX + R
        b.vx = Math.abs(b.vx)
      } else if (b.x > maxX - R) {
        b.x = maxX - R
        b.vx = -Math.abs(b.vx)
      }
      if (b.y < minY + R) {
        b.y = minY + R
        b.vy = Math.abs(b.vy)
      } else if (b.y > maxY - R) {
        b.y = maxY - R
        b.vy = -Math.abs(b.vy)
      }
    }

    if (this.volley && this.time - this.volley[0].start >= this.volley[0].dur) this.resolveVolley()

    for (let i = this.shreds.length - 1; i >= 0; i--) {
      const s = this.shreds[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vy += 0.0012 * dt
      s.vx *= 0.995
      s.rot += s.vr * dt
      s.life -= dt
      if (s.life <= 0) this.shreds.splice(i, 1)
    }
    this.reveals = this.reveals.filter((r) => this.time - r.t0 < 1300)
    this.floats = this.floats.filter((f) => this.time - f.t0 < (f.big ? 1600 : 900))
    this.links = this.links.filter((l) => this.time - l.t0 < 380)

    if (this.state === 'walking') this.updateWalk()
  }

  private live(): Balloon[] {
    return this.balloons.filter((b) => this.time >= b.born)
  }

  // Globos que revienta un dardo en (x, y): el mas cercano (menor z) que lo
  // contenga; con Dardo perforante, todos; con Iman, el mas proximo si roza.
  private hitsAt(x: number, y: number): Balloon[] {
    // distancia al globo en radios de su elipse: <= 1 es adentro
    const reachOf = (b: Balloon) => {
      const R = this.displayR(b) * this.stats.hitbox
      return Math.hypot((x - b.x) / (R * 0.86), (y - b.y) / R) * R - R // px fuera del borde
    }
    const inside = this.live().filter((b) => reachOf(b) <= 0)
    if (inside.length) return this.stats.pierce ? inside : [inside.reduce((a, b) => (b.z < a.z ? b : a))]
    const reach = this.stats.magnet * this.unit
    if (!reach) return []
    let best: Balloon | null = null
    let bestGap = reach
    for (const b of this.live()) {
      const gap = reachOf(b)
      if (gap <= bestGap) {
        best = b
        bestGap = gap
      }
    }
    return best ? [best] : []
  }

  private resolveVolley() {
    const volley = this.volley!
    this.volley = null
    const hits = new Set<Balloon>()
    for (const d of volley) for (const b of this.hitsAt(d.tx, d.ty)) hits.add(b)
    if (hits.size) {
      for (const b of hits) this.pop(b)
      return
    }
    this.miss(volley)
  }

  // Fallo: los dardos quedan clavados y se pierde uno (Escudo de cera lo salva).
  private miss(volley: Dart[]) {
    if (this.roomGuard > 0) this.roomGuard -= 1
    else this.streak = 0
    playThud()
    const d = volley[volley.length >> 1]
    if (this.roomShield > 0) {
      this.roomShield -= 1
      this.floats.push({ x: d.tx, y: d.ty - 24, text: 'Escudo', t0: this.time, big: false })
      this.emitHud()
      return
    }
    this.darts -= 1
    for (const v of volley) {
      this.stuck.push({
        x: v.tx,
        y: v.ty,
        ang: Math.atan2(v.ty - v.sy, v.tx - v.sx),
        s: this.dartScale(v.ty),
      })
    }
    if (this.darts <= 0 && this.revives < this.stats.revive) {
      this.revives += 1
      this.darts = 1
      this.floats.push({
        x: this.w / 2,
        y: this.h * 0.36,
        text: 'Segunda vela: +1 dardo',
        t0: this.time,
        big: true,
      })
    }
    this.emitHud()
    if (this.darts <= 0) {
      this.state = 'over'
      this.timer = {
        at: this.time + 900,
        run: () => {
          playGameOver()
          this.onOver?.({ score: this.score, rooms: this.round })
        },
      }
    }
  }

  // Todo puntaje entra por aca: nunca pasa el techo de embrujada.max_score.
  private addScore(pts: number) {
    this.score = Math.min(this.score + pts, maxScore(this.round))
  }

  // primary = lo reventaste con el dardo; los de Onda y Cadena valen `share`
  // y no suben la racha ni encadenan de nuevo.
  private pop(b: Balloon, share = 1, primary = true) {
    if (!this.balloons.includes(b)) return
    const R = this.displayR(b)
    this.balloons = this.balloons.filter((x) => x !== b)
    if (primary) this.streak += 1
    // mas puntos por globo chico (lejos o de cuarto avanzado) y por racha
    const size = clamp((this.unit * 0.078) / R, 1, 3)
    const mult = Math.min(2, 1 + Math.max(0, this.streak - 1) * this.stats.streakStep)
    const power = this.stats.scoreMul * (this.darts === 1 ? this.stats.lastBreath : 1) * share
    const pts = Math.min(
      pointCap(this.round),
      Math.round(100 * (1 + this.round * 0.25) * size * mult * power),
    )
    this.addScore(pts)
    this.floats.push({ x: b.x, y: b.y - R, text: `+${pts}`, t0: this.time, big: false })

    const n = 12 + ((Math.random() * 6) | 0)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2)
      const sp = rand(0.15, 0.45)
      this.shreds.push({
        x: b.x + Math.cos(a) * R * 0.6,
        y: b.y + Math.sin(a) * R * 0.6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.1,
        rot: Math.random() * Math.PI,
        vr: rand(-0.02, 0.02),
        life: rand(500, 900),
        color: b.color,
        size: R * rand(0.12, 0.22),
      })
    }
    if (b.face) this.reveals.push({ face: b.face, x: b.x, y: b.y, size: R * 1.8, t0: this.time })
    playPop()

    if (primary) {
      if (this.stats.slowMs) this.slowUntil = this.time + this.stats.slowMs
      const { splash, chain, harvest } = this.stats
      if (splash) {
        for (const o of this.live()) {
          if (Math.hypot(o.x - b.x, o.y - b.y) <= R * splash + this.displayR(o)) this.pop(o, 0.5, false)
        }
      }
      if (chain) {
        const near = this.live()
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))
          .slice(0, chain)
        for (const o of near) {
          this.links.push({ x1: b.x, y1: b.y, x2: o.x, y2: o.y, t0: this.time })
          this.pop(o, 0.5, false)
        }
      }
      if (harvest && this.streak % harvest === 0 && this.darts < this.stats.maxDarts) {
        this.darts += 1
        this.floats.push({ x: b.x, y: b.y - R - 28, text: '+1 dardo', t0: this.time, big: false })
      }
    }

    if (this.balloons.length === 0 && this.state === 'playing') this.clearRoom()
    this.emitHud()
  }

  private clearRoom() {
    const bonus = Math.round(250 * (this.round + 1) * this.stats.clearMul)
    this.addScore(bonus)
    const before = this.darts
    this.darts = Math.min(this.stats.maxDarts, this.darts + this.stats.refill)
    const refill = this.darts > before
    this.floats.push({
      x: this.w / 2,
      y: this.h * 0.36,
      text: `Cuarto limpio +${bonus}${refill ? '  ·  +1 dardo' : ''}`,
      t0: this.time,
      big: true,
    })
    this.state = 'clearing'
    this.timer = {
      at: this.time + 1100,
      run: () => {
        // cada DRAFT_EVERY cuartos: cartas de mejora antes de caminar
        const cards = (this.round + 1) % DRAFT_EVERY === 0 ? drawCards(this.picks, this.drafts) : []
        if (cards.length && this.onDraft) {
          this.state = 'drafting'
          this.onDraft(cards)
        } else this.walk()
      },
    }
  }

  private walk() {
    this.state = 'walking'
    this.walkStart = this.time
    this.walkSwitched = false
  }

  private walkMs() {
    return this.calm ? WALK_MS * 0.6 : WALK_MS
  }

  private updateWalk() {
    const t = (this.time - this.walkStart) / this.walkMs()
    if (!this.walkSwitched && t >= 0.72) {
      this.walkSwitched = true
      this.round += 1
      this.stuck = []
      this.paintBackdrop()
      this.emitHud()
    }
    if (t >= 1) {
      this.spawnRound()
      this.state = 'playing'
    }
  }

  // Camara durante la caminata: se acerca a la puerta, cruza a oscuras y
  // llega al cuarto nuevo frenando, con un leve cabeceo de pasos.
  private camera(): { s: number; ox: number; oy: number; bob: number; dark: number } {
    const door = this.box.door
    const dcx = door.x + door.w / 2
    const dcy = door.y + door.h * 0.55
    if (this.state !== 'walking') return { s: 1, ox: dcx, oy: dcy, bob: 0, dark: 0 }
    const t = clamp((this.time - this.walkStart) / this.walkMs(), 0, 1)
    const bob = this.calm ? 0 : Math.sin(t * Math.PI * 6) * this.h * 0.007
    if (t < 0.72) {
      const k = easeInOut(t / 0.72)
      const sMax = Math.min(this.w / door.w, this.h / door.h) * 1.1
      return { s: lerp(1, sMax, k * k), ox: dcx, oy: dcy, bob, dark: clamp((k - 0.55) / 0.45, 0, 1) }
    }
    const k = easeInOut((t - 0.72) / 0.28)
    return { s: lerp(0.86, 1, k), ox: this.w / 2, oy: this.h / 2, bob: bob * (1 - k), dark: 1 - k }
  }

  private dartScale(y: number) {
    // mas lejos (mas arriba en la pantalla) = mas chico
    return lerp(0.32, 0.5, clamp(y / this.h, 0, 1)) * (this.h / 900)
  }

  // --- Render -----------------------------------------------------------
  private draw() {
    const { ctx, w, h } = this
    const cam = this.camera()

    ctx.save()
    ctx.translate(cam.ox, cam.oy + cam.bob)
    ctx.scale(cam.s, cam.s)
    ctx.translate(-cam.ox, -cam.oy)
    ctx.drawImage(this.backdrop, 0, 0, w, h)
    this.drawLights()
    for (const s of this.stuck) this.drawDart(s.x, s.y, s.ang, s.s, true)
    // de atras hacia adelante
    const order = [...this.balloons].sort((a, b) => b.z - a.z)
    for (const b of order) if (this.time >= b.born) this.drawBalloon(b)
    this.drawLinks()
    this.drawShreds()
    this.drawReveals()
    ctx.restore()

    if (this.stats.dark > 0) this.drawDark()

    if (cam.dark > 0) {
      ctx.fillStyle = `rgba(0,0,0,${cam.dark})`
      ctx.fillRect(0, 0, w, h)
    }

    this.drawFlyingDart()
    this.drawFloats()
    if (this.state === 'playing') {
      if (!this.volley && this.darts > 0) this.drawHeldDart()
      this.drawReticle()
    }
  }

  private drawLights() {
    const { ctx } = this
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const l of this.lights) {
      const flick =
        0.15 +
        Math.sin(this.time * 0.007 + l.phase) * 0.025 +
        Math.sin(this.time * 0.023 + l.phase * 2) * 0.02
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
      g.addColorStop(0, `rgba(232,161,58,${flick})`)
      g.addColorStop(1, 'rgba(232,161,58,0)')
      ctx.fillStyle = g
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
    }
    ctx.restore()
  }

  private drawBalloon(b: Balloon) {
    const { ctx } = this
    const R = this.displayR(b)
    if (R <= 0.5) return
    const rx = R * 0.86
    const ry = R
    const sway = Math.sin(this.time * 0.003 + b.wob) * R * 0.25
    const dim = 1 - b.z * 0.35 // lejos = mas en penumbra

    // hilo
    ctx.strokeStyle = `rgba(233,226,208,${0.35 * dim})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(b.x, b.y + ry)
    ctx.bezierCurveTo(
      b.x + sway,
      b.y + ry + R * 0.8,
      b.x - sway,
      b.y + ry + R * 1.5,
      b.x + sway * 0.5,
      b.y + ry + R * 2.2,
    )
    ctx.stroke()

    ctx.save()
    ctx.globalAlpha = dim
    ctx.beginPath()
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2)
    ctx.save()
    ctx.clip()
    // cuerpo del globo: tinte tenue para que se lea aun sin cara
    ctx.fillStyle = b.color
    ctx.globalAlpha = dim * 0.28
    ctx.fillRect(b.x - rx, b.y - ry, rx * 2, ry * 2)
    ctx.globalAlpha = dim
    // la persona adentro, vista a traves del latex
    const img = b.face ? this.imgs.get(b.face.id) : undefined
    if (img && img.complete && img.naturalWidth > 0) {
      const ih = ry * 1.75
      const iw = ih * (img.naturalWidth / img.naturalHeight)
      ctx.drawImage(img, b.x - iw / 2, b.y - ih * 0.45, iw, ih)
    }
    ctx.fillStyle = b.color
    ctx.globalAlpha = dim * 0.4
    ctx.fillRect(b.x - rx, b.y - ry, rx * 2, ry * 2)
    // brillo del latex
    const sh = ctx.createRadialGradient(
      b.x - rx * 0.38,
      b.y - ry * 0.45,
      0,
      b.x - rx * 0.38,
      b.y - ry * 0.45,
      R * 0.7,
    )
    sh.addColorStop(0, 'rgba(255,248,230,0.55)')
    sh.addColorStop(1, 'rgba(255,248,230,0)')
    ctx.globalAlpha = dim
    ctx.fillStyle = sh
    ctx.fillRect(b.x - rx, b.y - ry, rx * 2, ry * 2)
    ctx.restore()
    // contorno + nudo
    ctx.strokeStyle = b.color
    ctx.lineWidth = Math.max(1, R * 0.04)
    ctx.stroke()
    ctx.fillStyle = b.color
    ctx.beginPath()
    ctx.moveTo(b.x, b.y + ry - 1)
    ctx.lineTo(b.x - R * 0.09, b.y + ry + R * 0.13)
    ctx.lineTo(b.x + R * 0.09, b.y + ry + R * 0.13)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // Cadena de almas: hilo de brasa entre los globos que revientan juntos.
  private drawLinks() {
    const { ctx } = this
    ctx.save()
    ctx.lineWidth = 2
    for (const l of this.links) {
      ctx.strokeStyle = `rgba(232,161,58,${clamp(1 - (this.time - l.t0) / 380, 0, 1)})`
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y1)
      ctx.lineTo(l.x2, l.y2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Luna llena: el cuarto a oscuras, solo se ve bien alrededor de la mira.
  private drawDark() {
    const { ctx, w, h } = this
    const cx = this.aim?.x ?? w / 2
    const cy = this.aim?.y ?? h * 0.4
    const g = ctx.createRadialGradient(cx, cy, this.unit * 0.12, cx, cy, this.unit * 0.55)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${0.82 * this.stats.dark})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  private drawShreds() {
    const { ctx } = this
    for (const s of this.shreds) {
      ctx.save()
      ctx.globalAlpha = clamp(s.life / 400, 0, 1)
      ctx.translate(s.x, s.y)
      ctx.rotate(s.rot)
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.moveTo(-s.size, -s.size * 0.3)
      ctx.quadraticCurveTo(0, -s.size * 0.8, s.size, -s.size * 0.2)
      ctx.lineTo(s.size * 0.6, s.size * 0.4)
      ctx.lineTo(-s.size * 0.7, s.size * 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  // La persona liberada: crece un poco, flota y se desvanece con su nombre.
  private drawReveals() {
    const { ctx } = this
    for (const r of this.reveals) {
      const t = (this.time - r.t0) / 1300
      const img = this.imgs.get(r.face.id)
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      const grow = 1 + (1 - Math.pow(1 - Math.min(1, t * 3), 3)) * 0.35
      const ih = r.size * grow
      const y = r.y - t * r.size * 0.3
      ctx.save()
      ctx.globalAlpha = clamp(alpha, 0, 1)
      if (img && img.complete && img.naturalWidth > 0) {
        const iw = ih * (img.naturalWidth / img.naturalHeight)
        ctx.drawImage(img, r.x - iw / 2, y - ih / 2, iw, ih)
      }
      if (r.face.name) {
        const px = clamp(r.size * 0.2, 13, 22)
        ctx.font = `600 ${px}px 'Hanken Grotesk Variable', system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.strokeText(r.face.name, r.x, y + ih / 2 + 6)
        ctx.fillStyle = '#e9e2d0'
        ctx.fillText(r.face.name, r.x, y + ih / 2 + 6)
      }
      ctx.restore()
    }
  }

  private drawFloats() {
    const { ctx } = this
    for (const f of this.floats) {
      const dur = f.big ? 1600 : 900
      const t = (this.time - f.t0) / dur
      ctx.save()
      ctx.globalAlpha = clamp(t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25, 0, 1)
      const px = f.big ? clamp(this.w * 0.03, 22, 38) : clamp(this.w * 0.018, 15, 22)
      ctx.font = f.big
        ? `500 ${px}px 'Fraunces Variable', Georgia, serif`
        : `700 ${px}px 'Hanken Grotesk Variable', system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      const y = f.y - t * (f.big ? 20 : 40)
      ctx.strokeText(f.text, f.x, y)
      ctx.fillStyle = '#e8a13a'
      ctx.fillText(f.text, f.x, y)
      ctx.restore()
    }
  }

  // Dardo apuntando en direccion `ang`, con la punta en (x, y).
  private drawDart(x: number, y: number, ang: number, s: number, stuck = false) {
    const { ctx } = this
    const L = 90 * s
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    // clavado: solo asoma la mitad trasera
    const tip = stuck ? -L * 0.25 : 0
    ctx.strokeStyle = '#d9ccb0'
    ctx.lineWidth = Math.max(1.5, 5 * s)
    ctx.beginPath()
    ctx.moveTo(tip, 0)
    ctx.lineTo(-L, 0)
    ctx.stroke()
    if (!stuck) {
      ctx.fillStyle = '#9a9384'
      ctx.beginPath()
      ctx.moveTo(L * 0.18, 0)
      ctx.lineTo(0, -2.5 * s)
      ctx.lineTo(0, 2.5 * s)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#b8432b'
    ctx.beginPath()
    ctx.moveTo(-L * 0.7, 0)
    ctx.lineTo(-L * 1.05, -L * 0.18)
    ctx.lineTo(-L * 1.05, L * 0.18)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawFlyingDart() {
    for (const d of this.volley ?? []) this.drawVolleyDart(d)
  }

  private drawVolleyDart(d: Dart) {
    const t = clamp((this.time - d.start) / d.dur, 0, 1)
    const dist = Math.hypot(d.tx - d.sx, d.ty - d.sy)
    const arc = dist * 0.16
    const pos = (k: number) =>
      [lerp(d.sx, d.tx, k), lerp(d.sy, d.ty, k) - Math.sin(Math.PI * k) * arc] as const
    const [x, y] = pos(t)
    const [px, py] = pos(Math.max(0, t - 0.04))
    const ang = Math.atan2(y - py, x - px)
    const s = lerp(1.5 * (this.h / 900), this.dartScale(d.ty), Math.pow(t, 0.7))
    this.drawDart(x, y, ang, s)
  }

  // Dardo en la mano, abajo a la derecha, apuntando al cursor.
  private drawHeldDart() {
    const x = this.w * 0.64
    const y = this.h * 0.98
    const target = this.aim ?? { x: this.w / 2, y: this.h * 0.4 }
    const ang = Math.atan2(target.y - y, target.x - x)
    this.drawDart(x + Math.cos(ang) * 40, y + Math.sin(ang) * 40, ang, 1.6 * (this.h / 900))
  }

  private drawReticle() {
    if (!this.aim) return
    const { ctx } = this
    const [x, y] = this.jittered(this.aim.x, this.aim.y)
    const r = 14
    ctx.save()
    ctx.strokeStyle = '#e8a13a'
    ctx.lineWidth = 1.5
    // aro con cuatro cortes
    for (let i = 0; i < 4; i++) {
      const a0 = (i * Math.PI) / 2 + 0.25
      ctx.beginPath()
      ctx.arc(x, y, r, a0, a0 + Math.PI / 2 - 0.5)
      ctx.stroke()
    }
    ctx.fillStyle = '#e8a13a'
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
    // dardos extra: donde cae cada uno del abanico
    const pts = this.spread(x, y)
    if (pts.length > 1) {
      for (const [px, py] of pts) if (px !== x || py !== y) ctx.fillRect(px - 2, py - 2, 4, 4)
    }
    ctx.restore()
  }
}

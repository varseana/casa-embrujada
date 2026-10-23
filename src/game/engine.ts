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
import {
  playChain,
  playHarvest,
  playRevive,
  playShield,
  playSlowMo,
  playSplash,
  playVolley,
} from './fx-sound'
import { paintRoom, roomBox, ROOMS, type Box, type Light } from './rooms'
import {
  byId,
  DRAFT_EVERY,
  drawCards,
  levelOf,
  maxScore,
  pointCap,
  statsFor,
  RARITY_LABEL,
  type PowerUp,
  type Rarity,
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
type Float = { x: number; y: number; text: string; t0: number; big: boolean; hot?: boolean }
type Link = { x1: number; y1: number; x2: number; y2: number; t0: number }

// Efectos de las mejoras: solo se pintan, no tocan el juego.
type FxKind = 'shield' | 'revive' | 'harvest' | 'splash' | 'magnet' | 'acquire'
type Fx = {
  kind: FxKind
  x: number
  y: number
  x2: number
  y2: number
  r: number
  ang: number
  t0: number
  dur: number
  text: string
  rarity: Rarity
}
const FX_MAX = 32
const RARITY_INK: Record<Rarity, string> = {
  comun: '#e9e2d0',
  poco: '#e9e2d0',
  rara: '#e8a13a',
  epica: '#b8432b',
}

type State = 'idle' | 'playing' | 'clearing' | 'drafting' | 'walking' | 'over'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const rand = (a: number, b: number) => a + Math.random() * (b - a)
// ruido fijo en [-1, 1]: los efectos no gastan Math.random (la simulacion usa semilla)
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

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
  private maxedShown = false
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
  private fx: Fx[] = []
  private slowStart = 0
  private vig: { w: number; h: number; sepia: HTMLCanvasElement; ember: HTMLCanvasElement } | null = null

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
    this.maxedShown = false
    this.slowUntil = 0
    this.volley = null
    this.stuck = []
    this.shreds = []
    this.reveals = []
    this.floats = []
    this.links = []
    this.fx = []
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
    // la espera cuenta desde que termina de inflarse el ultimo globo de la cascada
    this.frozenUntil = this.stats.freezeMs ? this.time + (count - 1) * 90 + 420 + this.stats.freezeMs : 0
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
    if (this.stats.shots > 1) playVolley(this.stats.shots)
    else playThrow()
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
    // el nombre de la mejora en grande mientras se camina
    this.addFx('acquire', Math.min(1700, this.walkMs()), {
      x: this.w / 2,
      y: this.h * 0.42,
      text: levelOf(this.picks, id) > 1 ? `${p.name} · nivel ${levelOf(this.picks, id)}` : p.name,
      rarity: p.rarity,
    })
    this.emitHud()
  }

  private addFx(kind: FxKind, dur: number, o: Partial<Fx> = {}) {
    if (this.fx.length >= FX_MAX) this.fx.shift()
    this.fx.push({
      kind,
      x: 0,
      y: 0,
      x2: 0,
      y2: 0,
      r: 0,
      ang: 0,
      text: '',
      rarity: 'comun',
      ...o,
      t0: this.time,
      dur,
    })
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
    for (let i = this.fx.length - 1; i >= 0; i--)
      if (this.time - this.fx[i].t0 >= this.fx[i].dur) this.fx.splice(i, 1)

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
    for (const d of volley)
      for (const b of this.hitsAt(d.tx, d.ty)) {
        hits.add(b)
        if (this.stats.magnet) this.noteMagnet(d, b)
      }
    if (hits.size) {
      for (const b of hits) this.pop(b)
      return
    }
    this.miss(volley)
  }

  // Iman: si el punto quedo fuera del globo, el dardo se curva hasta el (solo se pinta).
  private noteMagnet(d: Dart, b: Balloon) {
    const R = this.displayR(b) * this.stats.hitbox
    if (Math.hypot((d.tx - b.x) / (R * 0.86), (d.ty - b.y) / R) <= 1) return
    this.addFx('magnet', 340, {
      x: d.tx,
      y: d.ty,
      x2: b.x,
      y2: b.y,
      r: this.displayR(b),
      ang: Math.atan2(d.ty - d.sy, d.tx - d.sx),
    })
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
      this.addFx('shield', 700, {
        x: d.tx,
        y: d.ty,
        ang: Math.atan2(d.ty - d.sy, d.tx - d.sx),
        r: this.dartScale(d.ty),
      })
      playShield()
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
      this.addFx('revive', 1300, { x: this.w / 2, y: this.h * 0.36 - this.unit * 0.1 })
      playRevive()
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
    const hot = this.stats.scoreMul * (this.darts === 1 ? this.stats.lastBreath : 1) > 1
    this.floats.push({ x: b.x, y: b.y - R, text: `+${pts}`, t0: this.time, big: false, hot })

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
      if (this.stats.slowMs) {
        if (this.time >= this.slowUntil) {
          this.slowStart = this.time
          playSlowMo()
        }
        this.slowUntil = this.time + this.stats.slowMs
      }
      const { splash, chain, harvest } = this.stats
      if (splash) {
        this.addFx('splash', 460, { x: b.x, y: b.y, r: R, x2: R * splash })
        playSplash()
        for (const o of this.live()) {
          if (Math.hypot(o.x - b.x, o.y - b.y) <= R * splash + this.displayR(o)) this.pop(o, 0.5, false)
        }
      }
      if (chain) {
        const near = this.live()
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))
          .slice(0, chain)
        if (near.length) playChain()
        for (const o of near) {
          this.links.push({ x1: b.x, y1: b.y, x2: o.x, y2: o.y, t0: this.time })
          this.pop(o, 0.5, false)
        }
      }
      if (harvest && this.streak % harvest === 0 && this.darts < this.stats.maxDarts) {
        this.darts += 1
        this.floats.push({ x: b.x, y: b.y - R - 28, text: '+1 dardo', t0: this.time, big: false })
        this.addFx('harvest', 720, { x: b.x, y: b.y, r: this.darts - 1 })
        playHarvest()
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
          return
        }
        if ((this.round + 1) % DRAFT_EVERY === 0 && this.onDraft && !this.maxedShown) {
          // todo al maximo: se avisa una vez y la partida sigue sin cartas
          this.maxedShown = true
          this.floats.push({
            x: this.w / 2,
            y: this.h * 0.46,
            text: 'Tus mejoras ya están al máximo',
            t0: this.time,
            big: true,
          })
        }
        this.walk()
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
    if (this.time < this.frozenUntil) this.drawFrost()
    this.drawShreds()
    this.drawReveals()
    this.drawLinks()
    if (this.fx.length) this.drawWorldFx()
    ctx.restore()

    if (this.stats.dark > 0) this.drawDark()
    if (this.time < this.slowUntil) this.drawSlow()

    if (cam.dark > 0) {
      ctx.fillStyle = `rgba(0,0,0,${cam.dark})`
      ctx.fillRect(0, 0, w, h)
    }

    this.drawFlyingDart()
    if (this.fx.length) this.drawScreenFx()
    this.drawFloats()
    if (this.state === 'playing') {
      if (!this.volley && this.darts > 0) this.drawHeldDart()
      this.drawReticle()
    }
    if (this.fx.length) this.drawAcquire()
  }

  // Vinetas pintadas una vez a 1/4 de resolucion y estiradas: barato tambien sin GPU.
  private vignette() {
    const { w, h } = this
    if (this.vig && this.vig.w === w && this.vig.h === h) return this.vig
    const paint = (inner: string, outer: string) => {
      const c = document.createElement('canvas')
      const cw = Math.max(1, Math.ceil(w / 4))
      const ch = Math.max(1, Math.ceil(h / 4))
      c.width = cw
      c.height = ch
      const x = c.getContext('2d')
      if (x) {
        const g = x.createRadialGradient(
          cw / 2,
          ch / 2,
          this.unit * 0.07,
          cw / 2,
          ch / 2,
          Math.hypot(cw, ch) / 2,
        )
        g.addColorStop(0, inner)
        g.addColorStop(1, outer)
        x.fillStyle = g
        x.fillRect(0, 0, cw, ch)
      }
      return c
    }
    // sepia: tinte tibio en el centro y bordes tostados
    this.vig = {
      w,
      h,
      sepia: paint('rgba(150,96,40,0.14)', 'rgba(70,40,16,0.72)'),
      ember: paint('rgba(184,67,43,0)', 'rgba(184,67,43,0.85)'),
    }
    return this.vig
  }

  // Reloj de arena: tono sepia tibio y ondas lentas mientras dura la camara lenta.
  private drawSlow() {
    const { ctx, w, h } = this
    const into = this.time - this.slowStart
    const left = this.slowUntil - this.time
    const k = clamp(Math.min(into / 110, left / 180), 0, 1)
    ctx.save()
    ctx.globalAlpha = k
    ctx.drawImage(this.vignette().sepia, 0, 0, w, h)
    if (!this.calm) {
      // dos anillos que se abren despacio desde el centro del cuarto
      ctx.strokeStyle = '#e9e2d0'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 2; i++) {
        const ph = (into / 900 + i / 2) % 1
        ctx.globalAlpha = k * 0.2 * (1 - ph)
        ctx.beginPath()
        ctx.ellipse(
          w / 2,
          h * 0.42,
          this.unit * (0.08 + ph * 0.62),
          this.unit * (0.05 + ph * 0.4),
          0,
          0,
          Math.PI * 2,
        )
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // Calma previa: aro de escarcha punteado y un arco que se vacia con el tiempo.
  private drawFrost() {
    const { ctx } = this
    const total = this.stats.freezeMs + 420
    const frac = clamp((this.frozenUntil - this.time) / total, 0, 1)
    const fade = clamp((this.frozenUntil - this.time) / 250, 0, 1)
    ctx.save()
    ctx.strokeStyle = '#e9e2d0'
    for (const b of this.balloons) {
      if (this.time < b.born) continue
      const R = this.displayR(b)
      if (R <= 2) continue
      const rx = R * 0.86 + 7
      const ry = R + 7
      ctx.globalAlpha = 0.45 * fade
      ctx.lineWidth = 1.5
      ctx.setLineDash([1.5, 5])
      ctx.beginPath()
      ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      // lo que queda de calma: arco solido que se vacia desde arriba
      ctx.globalAlpha = 0.85 * fade
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(b.x, b.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.stroke()
      // escarcha: tres puntas cortas arriba
      ctx.beginPath()
      for (let i = -1; i <= 1; i++) {
        const a = -Math.PI / 2 + i * 0.5
        ctx.moveTo(b.x + Math.cos(a) * rx, b.y + Math.sin(a) * ry)
        ctx.lineTo(b.x + Math.cos(a) * (rx + 6), b.y + Math.sin(a) * (ry + 6))
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  // Efectos en el cuarto (bajo la camara): onda, escudo, iman.
  private drawWorldFx() {
    const { ctx } = this
    ctx.save()
    for (const f of this.fx) {
      const t = clamp((this.time - f.t0) / f.dur, 0, 1)
      if (f.kind === 'splash') {
        // aro que se abre del globo hasta el radio de la onda
        const r = this.calm ? f.x2 : lerp(f.r, f.x2, easeOut(t))
        ctx.globalAlpha = (1 - t) * (this.calm ? 0.5 : 0.85)
        ctx.strokeStyle = '#e8a13a'
        ctx.lineWidth = Math.max(1.5, f.r * 0.08 * (1 - t))
        ctx.beginPath()
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha *= 0.4
        ctx.strokeStyle = '#e9e2d0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(f.x, f.y, r * 0.82, 0, Math.PI * 2)
        ctx.stroke()
      } else if (f.kind === 'shield') {
        this.drawShieldFx(f, t)
      } else if (f.kind === 'magnet') {
        this.drawMagnetFx(f, t)
      }
    }
    ctx.restore()
  }

  // Escudo de cera: sello de cera que se agrieta donde iba el dardo, y el dardo cae rebotado.
  private drawShieldFx(f: Fx, t: number) {
    const { ctx } = this
    const R = this.unit * (0.034 + (this.calm ? 0.01 : easeOut(Math.min(1, t * 3)) * 0.012))
    const a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
    if (!this.calm && t < 0.14) {
      ctx.globalAlpha = 0.35 * (1 - t / 0.14)
      ctx.fillStyle = '#e9e2d0'
      ctx.beginPath()
      ctx.arc(f.x, f.y, R * 1.25, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 0.28 * a
    ctx.fillStyle = '#e8a13a'
    ctx.beginPath()
    ctx.arc(f.x, f.y, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.9 * a
    ctx.strokeStyle = '#e9e2d0'
    ctx.lineWidth = 3
    ctx.stroke()
    // grietas desde el centro del impacto
    ctx.strokeStyle = '#e8a13a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + hash(i, f.t0) * 0.4
      const m = R * (0.45 + hash(f.t0, i) * 0.12)
      const bend = ang + hash(i + 7, f.t0) * 0.5
      ctx.moveTo(f.x + Math.cos(ang) * R * 0.12, f.y + Math.sin(ang) * R * 0.12)
      ctx.lineTo(f.x + Math.cos(ang) * m, f.y + Math.sin(ang) * m)
      ctx.lineTo(f.x + Math.cos(bend) * R * 1.02, f.y + Math.sin(bend) * R * 1.02)
    }
    ctx.stroke()
    // el dardo rebota y cae girando
    const fall = this.calm ? 0.2 : 0.2 + t
    ctx.globalAlpha = clamp(1.2 - t * 1.4, 0, 1)
    this.drawDart(
      f.x - Math.cos(f.ang) * (R * 1.3 + fall * 30),
      f.y - Math.sin(f.ang) * R * 1.3 + fall * fall * this.h * 0.16,
      f.ang + Math.PI * 0.75 + fall * 2.4,
      f.r * 1.5,
    )
  }

  // Iman: el final del vuelo se curva hasta el globo.
  private drawMagnetFx(f: Fx, t: number) {
    const { ctx } = this
    // desde un poco antes del punto de caida hasta el borde del globo
    const bx = f.x - Math.cos(f.ang) * this.unit * 0.08
    const by = f.y - Math.sin(f.ang) * this.unit * 0.08
    const ea = Math.atan2(f.y - f.y2, f.x - f.x2)
    const ex = f.x2 + Math.cos(ea) * f.r * 0.6
    const ey = f.y2 + Math.sin(ea) * f.r * 0.6
    ctx.strokeStyle = '#e8a13a'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(f.x, f.y, ex, ey)
    ctx.globalAlpha = 0.3 * (1 - t)
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.globalAlpha = 0.9 * (1 - t)
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
    // el dardo recorre la curva en el primer tercio
    const k = this.calm ? 1 : easeOut(clamp(t * 2.5, 0, 1))
    const q = (u: number, a: number, c: number, b: number) =>
      (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b
    const x = q(k, bx, f.x, ex)
    const y = q(k, by, f.y, ey)
    const k0 = Math.max(0, k - 0.05)
    const ang = Math.atan2(y - q(k0, by, f.y, ey), x - q(k0, bx, f.x, ex))
    ctx.globalAlpha = 1 - t
    this.drawDart(x, y, k > 0.05 ? ang : f.ang, this.dartScale(f.y))
  }

  // Efectos de pantalla: Segunda vela y Cosecha.
  private drawScreenFx() {
    for (const f of this.fx) {
      const t = clamp((this.time - f.t0) / f.dur, 0, 1)
      if (f.kind === 'revive') this.drawReviveFx(f, t)
      else if (f.kind === 'harvest') this.drawHarvestFx(f, t)
    }
  }

  // Segunda vela: brasas desde los bordes y una llama que se aviva al centro.
  private drawReviveFx(f: Fx, t: number) {
    const { ctx, w, h } = this
    ctx.save()
    const edge = this.calm ? 0.5 * (1 - t) : t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.5)
    ctx.globalAlpha = edge
    ctx.drawImage(this.vignette().ember, 0, 0, w, h)
    if (!this.calm) {
      // chispas que suben desde abajo
      ctx.fillStyle = '#e8a13a'
      for (let i = 0; i < 14; i++) {
        const x = (0.5 + hash(i, 3) * 0.5) * w
        const y = h * (1.02 - t * (0.35 + 0.25 * (hash(i, 9) + 1)))
        ctx.globalAlpha = (1 - t) * 0.8
        ctx.fillRect(x + Math.sin(t * 9 + i) * 8, y, 3, 3)
      }
    }
    // llama: gota de vela con nucleo hueso
    const grow = this.calm ? 1 : easeOut(Math.min(1, t * 4))
    const flick = this.calm ? 1 : 1 + Math.sin(this.time * 0.05) * 0.06 + Math.sin(this.time * 0.031) * 0.04
    const H = this.unit * 0.09 * grow * flick
    const fa = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
    ctx.globalAlpha = fa * 0.5
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, H * 2.2)
    g.addColorStop(0, 'rgba(232,161,58,0.7)')
    g.addColorStop(1, 'rgba(232,161,58,0)')
    ctx.fillStyle = g
    ctx.fillRect(f.x - H * 2.2, f.y - H * 2.2, H * 4.4, H * 4.4)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = fa
    const flame = (s: number, color: string) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(f.x, f.y - H * s)
      ctx.bezierCurveTo(
        f.x + H * 0.45 * s,
        f.y - H * 0.25 * s,
        f.x + H * 0.4 * s,
        f.y + H * 0.4 * s,
        f.x,
        f.y + H * 0.42 * s,
      )
      ctx.bezierCurveTo(
        f.x - H * 0.4 * s,
        f.y + H * 0.4 * s,
        f.x - H * 0.45 * s,
        f.y - H * 0.25 * s,
        f.x,
        f.y - H * s,
      )
      ctx.fill()
    }
    flame(1, '#e8a13a')
    flame(0.55, '#e9e2d0')
    ctx.restore()
  }

  // Cosecha: un dardo de luz vuela del globo al contador de dardos (abajo a la izquierda).
  private drawHarvestFx(f: Fx, t: number) {
    const { ctx, w, h } = this
    // misma geometria que .hud-darts en game.css
    const left = clamp(w * 0.04, 16, 48)
    const bottom = clamp(h * 0.04, 16, 40)
    const n = this.stats.maxDarts
    const top = h - bottom - (n * 14 + (n - 1) * 10)
    const tx = left + 28
    const ty = top + clamp(f.r, 0, n - 1) * 24 + 7
    ctx.save()
    if (this.calm) {
      ctx.globalAlpha = 1 - t
      ctx.strokeStyle = '#e8a13a'
      ctx.lineWidth = 2
      ctx.strokeRect(tx - 34, ty - 11, 68, 22)
      ctx.restore()
      return
    }
    const cx = lerp(f.x, tx, 0.35)
    const cy = Math.min(f.y, ty) - h * 0.12
    const at = (u: number): [number, number] => [
      (1 - u) * (1 - u) * f.x + 2 * (1 - u) * u * cx + u * u * tx,
      (1 - u) * (1 - u) * f.y + 2 * (1 - u) * u * cy + u * u * ty,
    ]
    const k = Math.min(1, easeOut(t / 0.8))
    if (t < 0.85) {
      // estela: tramos cada vez mas tenues
      ctx.strokeStyle = '#e8a13a'
      ctx.lineCap = 'round'
      let [px, py] = at(Math.max(0, k - 0.3))
      for (let i = 1; i <= 6; i++) {
        const [x, y] = at(Math.max(0, k - 0.3 + (0.3 * i) / 6))
        ctx.globalAlpha = (i / 6) * 0.9
        ctx.lineWidth = 1 + i * 0.8
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
        px = x
        py = y
      }
      ctx.globalAlpha = 0.45
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = '#e8a13a'
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = '#e9e2d0'
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    // llega: el lugar del dardo se enciende
    if (t > 0.7) {
      const u = (t - 0.7) / 0.3
      ctx.globalAlpha = 1 - u
      ctx.strokeStyle = '#e8a13a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(tx, ty, 34 + u * 14, 10 + u * 8, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Mejora elegida: el nombre en grande mientras se camina, teñido por rareza.
  private drawAcquire() {
    const { ctx, w } = this
    for (const f of this.fx) {
      if (f.kind !== 'acquire') continue
      const t = clamp((this.time - f.t0) / f.dur, 0, 1)
      const a = t < 0.12 ? t / 0.12 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
      const ink = RARITY_INK[f.rarity]
      const sc = this.calm ? 1 : lerp(0.92, 1, easeOut(Math.min(1, t * 4)))
      ctx.save()
      ctx.globalAlpha = a
      // velo para que se lea sobre el cuarto y sobre la oscuridad del cruce
      const vh = this.unit * 0.16
      const veil = ctx.createLinearGradient(0, f.y - vh, 0, f.y + vh)
      veil.addColorStop(0, 'rgba(0,0,0,0)')
      veil.addColorStop(0.5, 'rgba(0,0,0,0.55)')
      veil.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = veil
      ctx.fillRect(0, f.y - vh, w, vh * 2)
      if (f.rarity === 'epica' && !this.calm) {
        // estallido de anillos
        ctx.strokeStyle = '#b8432b'
        for (let i = 0; i < 2; i++) {
          const u = clamp(t * 2.2 - i * 0.25, 0, 1)
          if (u <= 0 || u >= 1) continue
          ctx.globalAlpha = a * (1 - u)
          ctx.lineWidth = 3 * (1 - u) + 1
          ctx.beginPath()
          ctx.arc(f.x, f.y, this.unit * (0.06 + u * 0.32), 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.globalAlpha = a
      }
      ctx.translate(f.x, f.y)
      ctx.scale(sc, sc)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      const lp = clamp(w * 0.011, 11, 14)
      ctx.font = `700 ${lp}px 'Hanken Grotesk Variable', system-ui, sans-serif`
      ctx.fillStyle = ink
      ctx.fillText(`MEJORA  ·  ${RARITY_LABEL[f.rarity].toUpperCase()}`, 0, -this.unit * 0.075)
      const px = clamp(w * 0.05, 30, 64)
      ctx.font = `500 ${px}px 'Fraunces Variable', Georgia, serif`
      ctx.lineWidth = 6
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(f.text, 0, 0)
      ctx.fillStyle = ink
      ctx.fillText(f.text, 0, 0)
      // filete bajo el nombre
      ctx.globalAlpha = a * 0.6
      ctx.fillRect(-px * 1.2, this.unit * 0.06, px * 2.4, 1.5)
      ctx.restore()
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

  // Cadena de almas: rayo espectral quebrado entre los globos que revientan juntos;
  // el quiebre cambia cada 45 ms (fijo con reduced-motion).
  private drawLinks() {
    if (!this.links.length) return
    const { ctx } = this
    const tick = this.calm ? 0 : Math.floor(this.time / 45)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const l of this.links) {
      const fade = clamp(1 - (this.time - l.t0) / 380, 0, 1)
      const dx = l.x2 - l.x1
      const dy = l.y2 - l.y1
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const amp = Math.min(len * 0.09, 22)
      const seed = l.x1 * 0.37 + l.y2 * 0.11 + l.t0
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y1)
      const N = 8
      let mx = l.x1
      let my = l.y1
      for (let i = 1; i < N; i++) {
        const k = i / N
        const o = hash(seed + i, tick) * amp
        const x = l.x1 + dx * k + nx * o
        const y = l.y1 + dy * k + ny * o
        ctx.lineTo(x, y)
        if (i === 4) {
          mx = x
          my = y
        }
      }
      ctx.lineTo(l.x2, l.y2)
      // rama corta desde el medio
      const ba = Math.atan2(dy, dx) + hash(seed, tick + 1) * 0.9
      ctx.moveTo(mx, my)
      ctx.lineTo(
        mx + Math.cos(ba) * amp * 1.6 + nx * amp * 0.6,
        my + Math.sin(ba) * amp * 1.6 + ny * amp * 0.6,
      )
      const flick = this.calm ? 1 : 0.7 + 0.3 * hash(seed, tick + 2)
      ctx.globalAlpha = fade * flick * 0.45
      ctx.strokeStyle = '#e8a13a'
      ctx.lineWidth = 12
      ctx.stroke()
      ctx.globalAlpha = fade * flick
      ctx.lineWidth = 3.5
      ctx.stroke()
      ctx.strokeStyle = '#e9e2d0'
      ctx.lineWidth = 1.4
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
      const px = (f.big ? clamp(this.w * 0.03, 22, 38) : clamp(this.w * 0.018, 15, 22)) * (f.hot ? 1.15 : 1)
      ctx.font = f.big
        ? `500 ${px}px 'Fraunces Variable', Georgia, serif`
        : `700 ${px}px 'Hanken Grotesk Variable', system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      const y = f.y - t * (f.big ? 20 : 40)
      if (f.hot) {
        // puntos con multiplicador: halo de brasa
        ctx.lineWidth = 9
        ctx.strokeStyle = 'rgba(184,67,43,0.7)'
        ctx.strokeText(f.text, f.x, y)
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      }
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
    if (this.stats.pierce) {
      // Dardo perforante: imagenes fantasma detras
      const ctx = this.ctx
      ctx.save()
      for (let i = 3; i >= 1; i--) {
        const k = t - i * 0.06
        if (k <= 0) continue
        const [gx, gy] = pos(k)
        const [hx, hy] = pos(Math.max(0, k - 0.04))
        ctx.globalAlpha = 0.42 - i * 0.11
        this.drawDart(
          gx,
          gy,
          Math.atan2(gy - hy, gx - hx),
          lerp(1.5 * (this.h / 900), this.dartScale(d.ty), Math.pow(k, 0.7)),
        )
      }
      ctx.restore()
    }
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
    // Reloj de arena: arco que se vacia alrededor de la mira
    if (this.time < this.slowUntil && this.stats.slowMs) {
      const frac = clamp((this.slowUntil - this.time) / this.stats.slowMs, 0, 1)
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // dardos extra: donde cae cada uno del abanico
    const pts = this.spread(x, y)
    if (pts.length > 1) {
      for (const [px, py] of pts) if (px !== x || py !== y) ctx.fillRect(px - 2, py - 2, 4, 4)
    }
    ctx.restore()
  }
}

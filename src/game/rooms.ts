// Cuartos del minijuego, vistos en primera persona.
//
// Cada cuarto es una caja en perspectiva de un punto: la pared del fondo es un
// rectangulo centrado y techo, piso y paredes laterales salen de sus esquinas
// hacia las esquinas de la pantalla. El fondo es estatico: se pinta una vez por
// tamaño en un canvas offscreen y en cada frame solo se copia. Las luces van
// aparte porque titilan.

export type RoomKind = 'vestibulo' | 'biblioteca' | 'comedor' | 'invernadero' | 'sotano' | 'atico'

export type Room = {
  kind: RoomKind
  name: string
  wall: string // pared del fondo
  side: string // paredes laterales (mas oscuras)
  ceiling: string
  floor: string
  line: string // juntas y vetas
}

// Orden de recorrido. Despues del atico se vuelve a empezar, mas dificil.
export const ROOMS: Room[] = [
  { kind: 'vestibulo', name: 'Vestibulo', wall: '#17100a', side: '#100b07', ceiling: '#080504', floor: '#1a1009', line: '#0a0604' },
  { kind: 'biblioteca', name: 'Biblioteca', wall: '#140f0a', side: '#0e0a06', ceiling: '#070503', floor: '#181009', line: '#090503' },
  { kind: 'comedor', name: 'Comedor', wall: '#1a0d0a', side: '#120806', ceiling: '#080403', floor: '#160d08', line: '#0a0503' },
  { kind: 'invernadero', name: 'Invernadero', wall: '#0d110c', side: '#090c08', ceiling: '#050604', floor: '#12110b', line: '#060704' },
  { kind: 'sotano', name: 'Sotano', wall: '#131210', side: '#0d0c0a', ceiling: '#060605', floor: '#100f0d', line: '#070706' },
  { kind: 'atico', name: 'Atico', wall: '#16110b', side: '#0f0b07', ceiling: '#0a0705', floor: '#170f08', line: '#080503' },
]

export type Box = {
  w: number
  h: number
  bx: number // pared del fondo
  by: number
  bw: number
  bh: number
  door: { x: number; y: number; w: number; h: number }
}

// Luz que titila; coordenadas en pantalla.
export type Light = { x: number; y: number; r: number; phase: number }

export function roomBox(w: number, h: number): Box {
  const bw = w * 0.44
  const bh = h * 0.5
  const bx = (w - bw) / 2
  const by = h * 0.2
  const dw = Math.min(bw * 0.2, bh * 0.36)
  const dh = bh * 0.62
  return { w, h, bx, by, bw, bh, door: { x: w / 2 - dw / 2, y: by + bh - dh, w: dw, h: dh } }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Punto sobre una pared lateral. u: 0 borde de pantalla .. 1 pared del fondo;
// v: 0 techo .. 1 piso. side -1 izquierda, 1 derecha.
function sidePt(b: Box, side: -1 | 1, u: number, v: number): [number, number] {
  const fx = side < 0 ? 0 : b.w
  const bxEdge = side < 0 ? b.bx : b.bx + b.bw
  const x = lerp(fx, bxEdge, u)
  const top = lerp(0, b.by, u)
  const bot = lerp(b.h, b.by + b.bh, u)
  return [x, lerp(top, bot, v)]
}

function quad(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  ctx.fill()
}

function sideQuad(ctx: CanvasRenderingContext2D, b: Box, side: -1 | 1, u0: number, u1: number, v0: number, v1: number, fill: string) {
  quad(ctx, [sidePt(b, side, u0, v0), sidePt(b, side, u1, v0), sidePt(b, side, u1, v1), sidePt(b, side, u0, v1)], fill)
}

// Pinta el cuarto completo (sin luces) y devuelve sus fuentes de luz.
export function paintRoom(ctx: CanvasRenderingContext2D, room: Room, b: Box): Light[] {
  const { w, h, bx, by, bw, bh } = b
  const lights: Light[] = []

  // caja: techo, piso, laterales, fondo
  quad(ctx, [[0, 0], [w, 0], [bx + bw, by], [bx, by]], room.ceiling)
  quad(ctx, [[0, h], [w, h], [bx + bw, by + bh], [bx, by + bh]], room.floor)
  quad(ctx, [[0, 0], [bx, by], [bx, by + bh], [0, h]], room.side)
  quad(ctx, [[w, 0], [bx + bw, by], [bx + bw, by + bh], [w, h]], room.side)
  ctx.fillStyle = room.wall
  ctx.fillRect(bx, by, bw, bh)

  // tablas del piso hacia el punto de fuga
  ctx.strokeStyle = room.line
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    ctx.moveTo(lerp(-w * 0.3, w * 1.3, t), h)
    ctx.lineTo(lerp(bx, bx + bw, t), by + bh)
  }
  ctx.stroke()

  switch (room.kind) {
    case 'vestibulo':
      paintVestibulo(ctx, room, b, lights)
      break
    case 'biblioteca':
      paintBiblioteca(ctx, b, lights)
      break
    case 'comedor':
      paintComedor(ctx, b, lights)
      break
    case 'invernadero':
      paintInvernadero(ctx, b, lights)
      break
    case 'sotano':
      paintSotano(ctx, room, b, lights)
      break
    case 'atico':
      paintAtico(ctx, room, b, lights)
      break
  }

  paintDoor(ctx, b)

  // aristas de la caja: dan la lectura de volumen sin sombras
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 2
  ctx.strokeRect(bx, by, bw, bh)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(bx, by)
  ctx.moveTo(w, 0)
  ctx.lineTo(bx + bw, by)
  ctx.moveTo(0, h)
  ctx.lineTo(bx, by + bh)
  ctx.moveTo(w, h)
  ctx.lineTo(bx + bw, by + bh)
  ctx.stroke()

  // viñeta
  const vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  return lights
}

// Puerta al siguiente cuarto: arco oscuro con un hilo de luz ambar al fondo.
function paintDoor(ctx: CanvasRenderingContext2D, b: Box) {
  const { x, y, w, h } = b.door
  const frame = w * 0.14
  ctx.fillStyle = '#1d140b'
  ctx.beginPath()
  ctx.moveTo(x - frame, y + h)
  ctx.lineTo(x - frame, y + w / 2)
  ctx.arc(x + w / 2, y + w / 2, w / 2 + frame, Math.PI, 0)
  ctx.lineTo(x + w + frame, y + h)
  ctx.closePath()
  ctx.fill()
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#030201')
  g.addColorStop(1, '#2a1708')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + w / 2)
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
}

function sconce(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, lights: Light[]) {
  ctx.fillStyle = '#0c0806'
  ctx.fillRect(x - 2 * s, y, 4 * s, 14 * s)
  ctx.beginPath()
  ctx.moveTo(x - 11 * s, y + 14 * s)
  ctx.lineTo(x + 11 * s, y + 14 * s)
  ctx.lineTo(x + 6 * s, y + 20 * s)
  ctx.lineTo(x - 6 * s, y + 20 * s)
  ctx.fill()
  ctx.fillStyle = '#d9ccb0'
  ctx.fillRect(x - 3.5 * s, y - 12 * s, 7 * s, 13 * s)
  ctx.fillStyle = '#ffcf7a'
  ctx.beginPath()
  ctx.ellipse(x, y - 17 * s, 2.2 * s, 5 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  lights.push({ x, y: y - 14 * s, r: 120 * s, phase: Math.random() * 10 })
}

function paintVestibulo(ctx: CanvasRenderingContext2D, room: Room, b: Box, lights: Light[]) {
  // papel tapiz a franjas en el fondo y en los laterales
  ctx.fillStyle = 'rgba(255,240,210,0.025)'
  for (let x = b.bx + 10; x < b.bx + b.bw; x += 22) ctx.fillRect(x, b.by, 4, b.bh)
  for (const side of [-1, 1] as const) {
    for (let u = 0.04; u < 1; u += 0.07) sideQuad(ctx, b, side, u, u + 0.012, 0, 0.82, 'rgba(255,240,210,0.02)')
    sideQuad(ctx, b, side, 0, 1, 0.82, 1, room.line) // zocalo
  }
  ctx.fillStyle = room.line
  ctx.fillRect(b.bx, b.by + b.bh * 0.82, b.bw, b.bh * 0.18)
  const s = b.bh / 260
  sconce(ctx, b.bx + b.bw * 0.27, b.by + b.bh * 0.42, s, lights)
  sconce(ctx, b.bx + b.bw * 0.73, b.by + b.bh * 0.42, s, lights)
}

const SPINES = ['#3a1a10', '#2a2410', '#1c2416', '#3a2a14', '#2a1010', '#24201a']

function paintBiblioteca(ctx: CanvasRenderingContext2D, b: Box, lights: Light[]) {
  // estantes con lomos en las dos paredes laterales y en el fondo
  for (const side of [-1, 1] as const) {
    sideQuad(ctx, b, side, 0.02, 0.98, 0.08, 0.86, '#0a0704')
    for (let row = 0; row < 5; row++) {
      const v0 = 0.1 + row * 0.15
      const v1 = v0 + 0.13
      let u = 0.03
      let k = row * 3 + (side > 0 ? 1 : 0)
      while (u < 0.96) {
        const du = 0.012 + ((k * 7) % 5) * 0.004
        const short = (k * 11) % 4 === 0 ? 0.03 : 0
        sideQuad(ctx, b, side, u, Math.min(0.96, u + du), v0 + short, v1, SPINES[k % SPINES.length])
        u += du + 0.002
        k++
      }
      sideQuad(ctx, b, side, 0.02, 0.98, v1, v1 + 0.015, '#1d140b') // tabla
    }
  }
  const rowH = b.bh * 0.15
  for (let row = 0; row < 5; row++) {
    const y0 = b.by + b.bh * 0.08 + row * rowH
    let x = b.bx + 6
    let k = row * 5
    while (x < b.bx + b.bw - 6) {
      const bwk = 5 + ((k * 7) % 5) * 2
      // dejar el hueco de la puerta libre
      if (x + bwk > b.door.x - 12 && x < b.door.x + b.door.w + 12 && y0 + rowH > b.door.y - 10) {
        x += bwk + 1
        k++
        continue
      }
      ctx.fillStyle = SPINES[k % SPINES.length]
      ctx.fillRect(x, y0 + ((k * 3) % 4 === 0 ? rowH * 0.22 : rowH * 0.08), bwk, rowH * 0.86)
      x += bwk + 1
      k++
    }
    ctx.fillStyle = '#1d140b'
    ctx.fillRect(b.bx, y0 + rowH * 0.94, b.bw, 3)
  }
  // candelabro de pie al costado
  const s = b.bh / 260
  sconce(ctx, b.bx + b.bw * 0.08, b.by + b.bh * 0.2, s, lights)
}

function paintComedor(ctx: CanvasRenderingContext2D, b: Box, lights: Light[]) {
  const { w, h, bx, by, bw, bh } = b
  // mesa larga que entra hacia el fondo
  const yTop = by + bh * 1.02
  const yBot = h * 0.93
  quad(ctx, [[bx + bw * 0.32, yTop], [bx + bw * 0.68, yTop], [w * 0.74, yBot], [w * 0.26, yBot]], '#24120a')
  quad(ctx, [[w * 0.26, yBot], [w * 0.74, yBot], [w * 0.74, yBot + h * 0.03], [w * 0.26, yBot + h * 0.03]], '#140a06')
  // mantel roto
  quad(ctx, [[bx + bw * 0.42, yTop], [bx + bw * 0.58, yTop], [w * 0.6, yBot], [w * 0.4, yBot]], '#3a1f14')
  // candelabros sobre la mesa
  for (const t of [0.35, 0.7]) {
    const y = lerp(yTop, yBot, t)
    const s = lerp(0.6, 1.6, t) * (h / 900)
    sconce(ctx, w / 2, y - 22 * s, s, lights)
  }
  // araña colgando del techo
  const cx = w / 2
  const cy = by * 0.9
  ctx.strokeStyle = '#0c0806'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, cy + 8, bw * 0.16, 8, 0, 0, Math.PI)
  ctx.stroke()
  const s = bh / 300
  for (let i = -2; i <= 2; i++) {
    const x = cx + i * bw * 0.07
    const y = cy + 8 + Math.cos((i / 2.4) * (Math.PI / 2)) * 6
    ctx.fillStyle = '#d9ccb0'
    ctx.fillRect(x - 2.5 * s, y - 10 * s, 5 * s, 10 * s)
    ctx.fillStyle = '#ffcf7a'
    ctx.beginPath()
    ctx.ellipse(x, y - 14 * s, 1.8 * s, 4 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  lights.push({ x: cx, y: cy, r: bw * 0.5, phase: 3 })
}

function paintInvernadero(ctx: CanvasRenderingContext2D, b: Box, lights: Light[]) {
  const { bx, by, bw, bh, h } = b
  // ventanal del fondo con luna y ramas
  const gx = bx + bw * 0.06
  const gy = by + bh * 0.06
  const gw = bw * 0.88
  const gh = bh * 0.86
  ctx.fillStyle = '#10161a'
  ctx.fillRect(gx, gy, gw, gh)
  const mx = gx + gw * 0.72
  const my = gy + gh * 0.28
  const mr = gh * 0.12
  ctx.fillStyle = '#d9d4c0'
  ctx.beginPath()
  ctx.arc(mx, my, mr, 0, Math.PI * 2)
  ctx.fill()
  lights.push({ x: mx, y: my, r: mr * 6, phase: 0 })
  ctx.strokeStyle = '#050605'
  ctx.lineCap = 'round'
  const branch = (x: number, y: number, a: number, len: number, wd: number, depth: number) => {
    if (depth === 0 || len < 4) return
    const ex = x + Math.cos(a) * len
    const ey = y + Math.sin(a) * len
    ctx.lineWidth = wd
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    branch(ex, ey, a - 0.45, len * 0.7, wd * 0.65, depth - 1)
    branch(ex, ey, a + 0.38, len * 0.66, wd * 0.65, depth - 1)
  }
  branch(gx + gw * 0.2, gy + gh, -Math.PI / 2 + 0.15, gh * 0.32, 6, 6)
  ctx.lineCap = 'butt'
  // parteluces de hierro
  ctx.fillStyle = '#060806'
  for (let i = 1; i < 6; i++) ctx.fillRect(gx + (gw * i) / 6 - 2, gy, 4, gh)
  for (let i = 1; i < 4; i++) ctx.fillRect(gx, gy + (gh * i) / 4 - 2, gw, 4)
  ctx.strokeStyle = '#060806'
  ctx.lineWidth = 6
  ctx.strokeRect(gx, gy, gw, gh)
  // vidrios en los laterales (paneles)
  for (const side of [-1, 1] as const) {
    for (let u = 0.08; u < 0.95; u += 0.18) sideQuad(ctx, b, side, u, u + 0.14, 0.1, 0.7, '#0d1215')
  }
  // macetas con plantas secas
  for (const [x, s] of [[b.w * 0.12, 1.4], [b.w * 0.86, 1.2], [bx + bw * 0.1, 0.6]] as const) {
    const y = x < bx || x > bx + bw ? h * 0.9 : by + bh + 10
    const k = s * (h / 900)
    quad(ctx, [[x - 26 * k, y - 40 * k], [x + 26 * k, y - 40 * k], [x + 18 * k, y], [x - 18 * k, y]], '#3a1f12')
    ctx.strokeStyle = '#1c1a10'
    ctx.lineWidth = 3 * k
    ctx.beginPath()
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * 5 * k, y - 40 * k)
      ctx.quadraticCurveTo(x + i * 16 * k, y - 90 * k, x + i * 22 * k + 10 * k, y - 70 * k)
    }
    ctx.stroke()
  }
}

function paintSotano(ctx: CanvasRenderingContext2D, room: Room, b: Box, lights: Light[]) {
  const { bx, by, bw, bh, w } = b
  // ladrillo en la pared del fondo
  ctx.strokeStyle = room.line
  ctx.lineWidth = 2
  const bhR = bh / 16
  for (let r = 0; r < 16; r++) {
    const y = by + r * bhR
    ctx.beginPath()
    ctx.moveTo(bx, y)
    ctx.lineTo(bx + bw, y)
    const off = r % 2 ? bhR * 1.4 : 0
    for (let x = bx + off; x < bx + bw; x += bhR * 2.8) {
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + bhR)
    }
    ctx.stroke()
  }
  // ladrillo en los laterales: hiladas en perspectiva
  for (const side of [-1, 1] as const) {
    ctx.beginPath()
    for (let r = 0; r <= 16; r++) {
      const [x0, y0] = sidePt(b, side, 0, r / 16)
      const [x1, y1] = sidePt(b, side, 1, r / 16)
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    }
    ctx.stroke()
  }
  // caños por el techo
  ctx.strokeStyle = '#1a1916'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(w * 0.15, 0)
  ctx.lineTo(bx + bw * 0.2, by)
  ctx.moveTo(w * 0.8, 0)
  ctx.lineTo(bx + bw * 0.75, by)
  ctx.stroke()
  // foco pelado colgando
  const cx = w / 2
  const cy = by * 1.05
  ctx.strokeStyle = '#0a0a09'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, cy)
  ctx.stroke()
  ctx.fillStyle = '#ffe2a0'
  ctx.beginPath()
  ctx.arc(cx, cy + 8, 8, 0, Math.PI * 2)
  ctx.fill()
  lights.push({ x: cx, y: cy + 8, r: bw * 0.6, phase: 7 })
  // cajas apiladas
  quad(ctx, [[w * 0.06, b.h * 0.78], [w * 0.2, b.h * 0.78], [w * 0.2, b.h * 0.98], [w * 0.06, b.h * 0.98]], '#1c140c')
  quad(ctx, [[w * 0.09, b.h * 0.64], [w * 0.19, b.h * 0.64], [w * 0.19, b.h * 0.78], [w * 0.09, b.h * 0.78]], '#22180e')
}

function paintAtico(ctx: CanvasRenderingContext2D, room: Room, b: Box, lights: Light[]) {
  const { bx, by, bw, bh, w } = b
  // vigas del techo hacia el fondo
  ctx.strokeStyle = '#1d140b'
  ctx.lineWidth = 14
  ctx.beginPath()
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    ctx.moveTo(lerp(0, w, t), 0)
    ctx.lineTo(lerp(bx, bx + bw, t), by)
  }
  ctx.stroke()
  // vigas transversales
  ctx.strokeStyle = room.line
  ctx.lineWidth = 8
  for (const u of [0.35, 0.65, 0.88]) {
    const [x0, y0] = sidePt(b, -1, u, 0)
    const [x1] = sidePt(b, 1, u, 0)
    ctx.beginPath()
    ctx.moveTo(x0, y0 + 6)
    ctx.lineTo(x1, y0 + 6)
    ctx.stroke()
  }
  // ventana redonda con luna detras
  const cx = bx + bw * 0.78
  const cy = by + bh * 0.3
  const r = bh * 0.13
  ctx.fillStyle = '#121619'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#cfc9b4'
  ctx.beginPath()
  ctx.arc(cx + r * 0.25, cy - r * 0.2, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1d140b'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy + r)
  ctx.stroke()
  lights.push({ x: cx, y: cy, r: r * 7, phase: 0 })
  // baul y sabana sobre un mueble
  quad(ctx, [[w * 0.78, b.h * 0.8], [w * 0.95, b.h * 0.8], [w * 0.95, b.h * 0.97], [w * 0.78, b.h * 0.97]], '#24170c')
  ctx.fillStyle = '#2e2a22'
  ctx.beginPath()
  ctx.moveTo(w * 0.04, b.h * 0.98)
  ctx.quadraticCurveTo(w * 0.06, b.h * 0.62, w * 0.13, b.h * 0.6)
  ctx.quadraticCurveTo(w * 0.2, b.h * 0.62, w * 0.22, b.h * 0.98)
  ctx.fill()
  // telarañas en las esquinas del fondo
  ctx.strokeStyle = 'rgba(233,226,208,0.14)'
  ctx.lineWidth = 1
  for (const [x, flip] of [[bx, 1], [bx + bw, -1]] as const) {
    ctx.beginPath()
    for (let a = 0; a <= 90; a += 18) {
      const rad = (a * Math.PI) / 180
      ctx.moveTo(x, by)
      ctx.lineTo(x + flip * Math.cos(rad) * bh * 0.25, by + Math.sin(rad) * bh * 0.25)
    }
    for (const k of [0.4, 0.7, 1]) {
      ctx.moveTo(x + flip * bh * 0.25 * k, by)
      ctx.quadraticCurveTo(x + flip * bh * 0.12 * k, by + bh * 0.12 * k, x, by + bh * 0.25 * k)
    }
    ctx.stroke()
  }
}

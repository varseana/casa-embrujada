// Mejoras del minijuego: cada DRAFT_EVERY cuartos limpios se ofrecen 3 cartas
// y la persona elige 1. Cada carta modifica `Stats`; el motor lee solo Stats.
//
// Puntaje: ninguna mejora puede pasar el techo de embrujada.max_score(rooms)
// (supabase/embrujada-scores.sql). El motor recorta cada globo a pointCap(n) y
// el total a maxScore(rooms), asi que el insert nunca choca con el check.

export const DRAFT_EVERY = 3 // cuartos limpios entre cada eleccion
export const MAX_SLOTS = 6 // mejoras distintas; llenas, solo se sube de nivel

export type Rarity = 'comun' | 'poco' | 'rara' | 'epica'

export const RARITY_LABEL: Record<Rarity, string> = {
  comun: 'Común',
  poco: 'Poco común',
  rara: 'Rara',
  epica: 'Épica',
}

export type Stats = {
  shots: number // dardos por lanzamiento
  jitter: number // temblor de la mira, en fraccion de min(w, h)
  hitbox: number // multiplica el radio de impacto
  flight: number // multiplica la duracion del vuelo (< 1 = mas rapido)
  balloonSpeed: number
  balloonSize: number
  maxDarts: number
  refill: number // dardos que devuelve limpiar un cuarto
  scoreMul: number // multiplica los puntos de cada globo
  clearMul: number // multiplica el bono de limpieza
  streakStep: number // racha: +x por acierto seguido
  shield: number // fallos por cuarto que no gastan dardo
  streakGuard: number // fallos por cuarto que no cortan la racha
  pierce: boolean // revienta todos los globos bajo el punto
  splash: number // onda: radio en multiplos del globo reventado (0 = no)
  chain: number // cadena: saltos a los globos mas cercanos
  magnet: number // autoguiado, en fraccion de min(w, h)
  slowMs: number // camara lenta despues de cada acierto
  freezeMs: number // globos quietos al entrar al cuarto
  fewer: number // globos menos por cuarto
  lastBreath: number // multiplica los puntos con 1 solo dardo
  harvest: number // cada N aciertos seguidos devuelve 1 dardo (0 = no)
  revive: number // veces por partida que te salvas sin dardos
  dark: number // 0..1 penumbra del cuarto
}

export const BASE_STATS: Stats = {
  shots: 1,
  jitter: 0,
  hitbox: 1,
  flight: 1,
  balloonSpeed: 1,
  balloonSize: 1,
  maxDarts: 3,
  refill: 1,
  scoreMul: 1,
  clearMul: 1,
  streakStep: 0.1,
  shield: 0,
  streakGuard: 0,
  pierce: false,
  splash: 0,
  chain: 0,
  magnet: 0,
  slowMs: 0,
  freezeMs: 0,
  fewer: 0,
  lastBreath: 1,
  harvest: 0,
  revive: 0,
  dark: 0,
}

export type Upgrade = { text: string; cost?: string; apply: (s: Stats) => void }

export type PowerUp = {
  id: string
  name: string
  rarity: Rarity
  text: string // efecto, corto: entra en la carta
  cost?: string // desventaja
  max: number // nivel maximo (tomarla otra vez sube de nivel)
  up?: Upgrade // que hace cada nivel despues del primero
  excludes?: string[] // no se ofrece si ya tienes alguna de estas
  apply: (s: Stats) => void
  grant?: number // dardos que da al elegirla (nunca pasa el maximo)
}

export const POWERUPS: PowerUp[] = [
  // --- Comunes: empujoncitos sin desventaja ---------------------------------
  {
    id: 'pulso',
    name: 'Pulso firme',
    rarity: 'comun',
    max: 2,
    text: 'Zona de impacto 8% más grande.',
    apply: (s) => {
      s.hitbox *= 1.08
    },
  },
  {
    id: 'pluma',
    name: 'Pluma de cuervo',
    rarity: 'comun',
    max: 2,
    text: 'El dardo vuela 20% más rápido.',
    apply: (s) => {
      s.flight *= 0.8
    },
  },
  {
    id: 'telarana',
    name: 'Telaraña',
    rarity: 'comun',
    max: 2,
    text: 'Globos 12% más lentos.',
    apply: (s) => {
      s.balloonSpeed *= 0.88
    },
  },
  {
    id: 'vela',
    name: 'Ojo de vela',
    rarity: 'comun',
    max: 3,
    text: '+8% de puntos por globo.',
    apply: (s) => {
      s.scoreMul *= 1.08
    },
  },
  {
    id: 'racha',
    name: 'Racha tibia',
    rarity: 'comun',
    max: 2,
    text: 'La racha sube 15% por acierto en vez de 10%.',
    apply: (s) => {
      s.streakStep += 0.05
    },
  },
  {
    id: 'latex',
    name: 'Látex grueso',
    rarity: 'comun',
    max: 2,
    text: 'Globos 8% más grandes.',
    cost: 'Globo grande vale menos.',
    apply: (s) => {
      s.balloonSize *= 1.08
    },
  },
  {
    id: 'calma',
    name: 'Calma previa',
    rarity: 'comun',
    max: 1,
    text: 'Los globos esperan 1.5 s antes de moverse.',
    apply: (s) => {
      s.freezeMs += 1500
    },
  },
  {
    id: 'barquero',
    name: 'Moneda del barquero',
    rarity: 'comun',
    max: 2,
    text: '+25% de bono al limpiar un cuarto.',
    apply: (s) => {
      s.clearMul *= 1.25
    },
  },
  {
    id: 'aliento',
    name: 'Último aliento',
    rarity: 'comun',
    max: 1,
    text: 'Con 1 solo dardo, +30% de puntos.',
    apply: (s) => {
      s.lastBreath *= 1.3
    },
  },

  // --- Poco comunes: algo mas fuerte, a veces con costo ---------------------
  {
    id: 'escudo',
    name: 'Escudo de cera',
    rarity: 'poco',
    max: 1,
    text: 'El primer fallo de cada cuarto no gasta dardo.',
    cost: '-10% de puntos.',
    apply: (s) => {
      s.shield += 1
      s.scoreMul *= 0.9
    },
  },
  {
    id: 'hierro',
    name: 'Racha de hierro',
    rarity: 'poco',
    max: 1,
    text: 'El primer fallo de cada cuarto no corta la racha.',
    apply: (s) => {
      s.streakGuard += 1
    },
  },
  {
    id: 'iman',
    name: 'Imán',
    rarity: 'poco',
    max: 1,
    excludes: ['cuervo'],
    text: 'El dardo se desvía al globo más cercano.',
    cost: 'Vuela 10% más lento.',
    apply: (s) => {
      s.magnet = Math.max(s.magnet, 0.004)
      s.flight *= 1.1
    },
  },
  {
    id: 'carcaj',
    name: 'Carcaj',
    rarity: 'poco',
    max: 1,
    grant: 1,
    text: '+1 dardo máximo.',
    cost: '-8% de puntos.',
    apply: (s) => {
      s.maxDarts += 1
      s.scoreMul *= 0.92
    },
  },
  {
    id: 'cosecha',
    name: 'Cosecha',
    rarity: 'poco',
    max: 1,
    text: 'Cada 6 aciertos seguidos recuperas 1 dardo.',
    apply: (s) => {
      s.harvest = 6
    },
  },
  {
    id: 'reloj',
    name: 'Reloj de arena',
    rarity: 'poco',
    max: 1,
    text: 'Cámara lenta medio segundo tras cada acierto.',
    apply: (s) => {
      s.slowMs += 500
    },
  },
  {
    id: 'puerta',
    name: 'Puerta entreabierta',
    rarity: 'poco',
    max: 2,
    text: '1 globo menos por cuarto.',
    cost: 'Menos globos, menos puntos.',
    apply: (s) => {
      s.fewer += 1
    },
  },

  // --- Raras: cambian como se juega -----------------------------------------
  {
    id: 'perforante',
    name: 'Dardo perforante',
    rarity: 'rara',
    max: 1,
    text: 'Revienta todos los globos bajo el impacto, con zona 10% más grande.',
    cost: 'Vuela 15% más lento.',
    apply: (s) => {
      s.pierce = true
      s.hitbox *= 1.1
      s.flight *= 1.15
    },
  },
  {
    id: 'onda',
    name: 'Onda expansiva',
    rarity: 'rara',
    max: 1,
    text: 'Al reventar, revienta los globos pegados a medio puntaje.',
    cost: 'La racha sube la mitad.',
    apply: (s) => {
      s.splash = 2.5
      s.streakStep *= 0.5
    },
  },
  {
    id: 'doble',
    name: 'Doble dardo',
    rarity: 'rara',
    max: 1,
    excludes: ['multi'],
    text: 'Lanzas 2 dardos. Fallas solo si fallan los dos.',
    cost: 'La mira tiembla un poco.',
    apply: (s) => {
      s.shots = Math.max(s.shots, 2)
      s.jitter += 0.014
    },
  },
  {
    id: 'luna',
    name: 'Luna llena',
    rarity: 'rara',
    max: 1,
    text: 'Zona de impacto 15% más grande.',
    cost: 'El cuarto queda a oscuras.',
    apply: (s) => {
      s.hitbox *= 1.15
      s.dark = Math.max(s.dark, 0.8)
    },
  },
  {
    id: 'segunda',
    name: 'Segunda vela',
    rarity: 'rara',
    max: 1,
    text: 'Una vez por partida, al perder el último dardo lo recuperas.',
    apply: (s) => {
      s.revive += 1
    },
  },

  // --- Epicas: muy fuertes, con un costo que se siente ----------------------
  {
    id: 'multi',
    name: 'Multi Dardo',
    rarity: 'epica',
    max: 1,
    excludes: ['doble'],
    text: 'Lanzas 3 dardos en abanico.',
    cost: 'La mira vibra y pierde precisión.',
    apply: (s) => {
      s.shots = 3
      s.jitter += 0.018
    },
  },
  {
    id: 'cadena',
    name: 'Cadena de almas',
    rarity: 'epica',
    max: 1,
    text: 'Cada globo reventado salta al más cercano.',
    cost: 'Globos 15% más rápidos.',
    apply: (s) => {
      s.chain = 1
      s.balloonSpeed *= 1.15
    },
  },
  {
    id: 'pacto',
    name: 'Pacto oscuro',
    rarity: 'epica',
    max: 1,
    grant: 1,
    text: '+30% de puntos y +1 dardo máximo.',
    cost: 'Globos 15% más rápidos.',
    apply: (s) => {
      s.scoreMul *= 1.3
      s.maxDarts += 1
      s.balloonSpeed *= 1.15
    },
  },
]

// La exclusion es simetrica: basta con declararla de un lado.
for (const p of POWERUPS)
  for (const x of p.excludes ?? []) {
    const other = POWERUPS.find((q) => q.id === x)
    if (other && !other.excludes?.includes(p.id)) other.excludes = [...(other.excludes ?? []), p.id]
  }

// Niveles: tomar una mejora que ya tienes la sube de nivel. `up` es lo que
// suma cada nivel despues del primero; sin `up`, repite el efecto del nivel 1.
// Los topes de LIMITS y el techo de puntaje siguen mandando.
const LEVELS: Record<string, { max: number; up?: Upgrade }> = {
  pulso: { max: 3 },
  pluma: { max: 3 },
  telarana: { max: 3 },
  vela: { max: 3 },
  racha: { max: 2 },
  latex: { max: 3 },
  calma: {
    max: 3,
    up: {
      text: 'Los globos esperan 0.75 s más.',
      apply: (s) => {
        s.freezeMs += 750
      },
    },
  },
  barquero: { max: 3 },
  aliento: {
    max: 3,
    up: {
      text: 'Con 1 solo dardo, +15% de puntos más.',
      apply: (s) => {
        s.lastBreath *= 1.15
      },
    },
  },
  escudo: {
    max: 2,
    up: {
      text: 'Un fallo más gratis por cuarto.',
      cost: '-5% de puntos.',
      apply: (s) => {
        s.shield += 1
        s.scoreMul *= 0.95
      },
    },
  },
  hierro: {
    max: 2,
    up: {
      text: 'Un fallo más por cuarto sin cortar la racha.',
      apply: (s) => {
        s.streakGuard += 1
      },
    },
  },
  iman: {
    max: 3,
    up: {
      text: 'El imán alcanza más lejos.',
      apply: (s) => {
        s.magnet += 0.002
      },
    },
  },
  carcaj: {
    max: 2,
    up: {
      text: '+1 dardo máximo más.',
      cost: '-4% de puntos.',
      apply: (s) => {
        s.maxDarts += 1
        s.scoreMul *= 0.96
      },
    },
  },
  cosecha: {
    max: 3,
    up: {
      text: 'Recuperas el dardo con 1 acierto seguido menos.',
      apply: (s) => {
        s.harvest = Math.max(4, s.harvest - 1)
      },
    },
  },
  reloj: {
    max: 3,
    up: {
      text: 'La cámara lenta dura 0.25 s más.',
      apply: (s) => {
        s.slowMs += 250
      },
    },
  },
  puerta: { max: 2 },
  perforante: {
    max: 2,
    up: {
      text: 'Zona de impacto 5% más grande.',
      apply: (s) => {
        s.hitbox *= 1.05
      },
    },
  },
  onda: {
    max: 2,
    up: {
      text: 'La onda llega más lejos.',
      apply: (s) => {
        s.splash = 3.2
      },
    },
  },
  doble: {
    max: 2,
    up: {
      text: 'La mira tiembla menos.',
      apply: (s) => {
        s.jitter = Math.max(0, s.jitter - 0.007)
      },
    },
  },
  luna: {
    max: 2,
    up: {
      text: 'Zona de impacto 7% más grande.',
      apply: (s) => {
        s.hitbox *= 1.07
      },
    },
  },
  segunda: {
    max: 2,
    up: {
      text: 'Te salva una vez más por partida.',
      apply: (s) => {
        s.revive += 1
      },
    },
  },
  multi: {
    max: 2,
    up: {
      text: 'La mira vibra menos.',
      apply: (s) => {
        s.jitter = Math.max(0, s.jitter - 0.008)
      },
    },
  },
  cadena: {
    max: 2,
    up: {
      text: 'Salta a 2 globos en vez de 1.',
      cost: 'Globos 5% más rápidos.',
      apply: (s) => {
        s.chain = 2
        s.balloonSpeed *= 1.05
      },
    },
  },
  pacto: {
    max: 2,
    up: {
      text: '+15% de puntos más.',
      apply: (s) => {
        s.scoreMul *= 1.15
      },
    },
  },
}
for (const p of POWERUPS) {
  const l = LEVELS[p.id]
  if (l) {
    p.max = l.max
    p.up = l.up
  }
}

export const byId = (id: string) => POWERUPS.find((p) => p.id === id)

export const levelOf = (picks: string[], id: string) => picks.filter((x) => x === id).length

// Lo que dice la carta: el efecto del nivel 1, o el del siguiente nivel si ya la tienes.
export function cardFace(p: PowerUp, picks: string[]): { text: string; cost?: string; level: number } {
  const level = levelOf(picks, p.id) + 1
  if (level === 1 || !p.up) return { text: p.text, cost: p.cost, level }
  return { text: p.up.text, cost: p.up.cost, level }
}

// Topes del total: ninguna combinacion rompe el juego.
const LIMITS: { [K in keyof Stats]?: [number, number] } = {
  hitbox: [1, 1.45],
  flight: [0.6, 1.3],
  balloonSpeed: [0.7, 1.3],
  balloonSize: [0.8, 1.3],
  maxDarts: [3, 5],
  scoreMul: [0.8, 1.5],
  clearMul: [0.5, 1.6],
  streakStep: [0.05, 0.2],
  jitter: [0, 0.03],
  fewer: [0, 2],
}

export function statsFor(picks: string[]): Stats {
  const s = { ...BASE_STATS }
  const seen = new Set<string>()
  for (const id of picks) {
    const p = byId(id)
    if (!p) continue
    ;(seen.has(id) && p.up ? p.up.apply : p.apply)(s)
    seen.add(id)
  }
  for (const k in LIMITS) {
    const key = k as keyof typeof LIMITS
    const [lo, hi] = LIMITS[key]!
    ;(s[key] as number) = Math.min(hi, Math.max(lo, s[key] as number))
  }
  return s
}

// Peso por rareza; cada eleccion sube un poco las raras y epicas.
export function rarityWeights(draft: number): Record<Rarity, number> {
  return { comun: 58, poco: 28, rara: 11 + 3 * draft, epica: 3 + 2 * draft }
}

// Con las ranuras llenas solo se ofrecen niveles de lo que ya tienes.
export const slotsFull = (picks: string[]) => new Set(picks).size >= MAX_SLOTS

export function eligible(picks: string[]): PowerUp[] {
  const full = slotsFull(picks)
  return POWERUPS.filter((p) => {
    const lv = levelOf(picks, p.id)
    if (lv >= p.max) return false
    if (lv === 0 && (full || p.excludes?.some((x) => picks.includes(x)))) return false
    return true
  })
}

// 3 cartas distintas: primero rareza por peso (solo entre las que tienen algo
// disponible), luego una carta al azar de esa rareza.
export function drawCards(picks: string[], draft: number, rng: () => number = Math.random, n = 3): PowerUp[] {
  const pool = eligible(picks)
  const weights = rarityWeights(draft)
  const out: PowerUp[] = []
  while (out.length < n) {
    const left = pool.filter((p) => !out.includes(p))
    if (!left.length) break
    const rarities = (Object.keys(weights) as Rarity[]).filter((r) => left.some((p) => p.rarity === r))
    const total = rarities.reduce((a, r) => a + weights[r], 0)
    let roll = rng() * total
    let rarity = rarities[rarities.length - 1]
    for (const r of rarities) {
      roll -= weights[r]
      if (roll < 0) {
        rarity = r
        break
      }
    }
    const group = left.filter((p) => p.rarity === rarity)
    out.push(group[Math.min(group.length - 1, Math.floor(rng() * group.length))])
  }
  return out
}

// Techo de puntaje: MISMA formula que embrujada.max_score(rooms) en SQL.
export function pointCap(n: number): number {
  return Math.ceil(100 * (1 + 0.25 * n) * 3 * 2)
}

export function maxScore(rooms: number): number {
  let total = 0
  for (let n = 0; n <= rooms; n++) total += Math.min(5 + 2 * n, 16) * pointCap(n) + 250 * (n + 1)
  return total
}

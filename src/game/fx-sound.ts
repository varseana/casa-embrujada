// Sonidos de las mejoras y de las cartas. Sintetizados con el bus de
// src/house/sound.ts (fxBus). Todas son seguras de llamar sin audio: no hacen nada.
//
// Cada sonido es un synth `(c, t, dest) => duracion` que no sabe nada del bus:
// asi se puede renderizar offline (OfflineAudioContext) para medir niveles.
// Referencia de nivel: ninguno pasa el pico de playPop.
import { fxBus } from '../house/sound'
import type { Rarity } from './powerups'

type Synth = (c: BaseAudioContext, t: number, dest: AudioNode) => number

const RANK: Record<Rarity, number> = { comun: 0, poco: 1, rara: 2, epica: 3 }

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

// Un solo buffer de ruido por contexto; cada uso arranca en un offset al azar.
const NOISE_SEC = 1.5
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(c: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(c)
  if (!b) {
    const len = Math.floor(c.sampleRate * NOISE_SEC)
    b = c.createBuffer(1, len, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(c, b)
  }
  return b
}

// Envolvente percusiva: sube a `peak` en `attack` y cae a casi 0 en `dur`.
function env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
}

// Oscilador con envolvente; f1 opcional = glissando exponencial.
function tone(
  c: BaseAudioContext,
  dest: AudioNode,
  type: OscillatorType,
  f0: number,
  t: number,
  peak: number,
  attack: number,
  dur: number,
  f1?: number,
  detune = 0,
): void {
  const o = c.createOscillator()
  o.type = type
  o.detune.value = detune
  o.frequency.setValueAtTime(f0, t)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8)
  const g = c.createGain()
  env(g, t, peak, attack, dur)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// Ruido filtrado con barrido de frecuencia (soplidos, chasquidos, roces).
function hiss(
  c: BaseAudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q: number,
  peak: number,
  attack: number,
): void {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9)
  const g = c.createGain()
  env(g, t, peak, attack, dur)
  src.connect(f).connect(g).connect(dest)
  src.start(t, Math.random() * (NOISE_SEC - dur - 0.05))
  src.stop(t + dur + 0.02)
}

// Campana: parciales inarmonicos, los agudos se apagan antes.
function bell(c: BaseAudioContext, dest: AudioNode, f: number, t: number, peak: number, decay: number): void {
  for (const [mult, gain, d] of [
    [1, 1, 1],
    [2.76, 0.42, 0.6],
    [5.4, 0.2, 0.35],
  ] as const) {
    tone(c, dest, 'sine', f * mult, t, peak * gain, 0.003, decay * d)
  }
}

// Voz de organo: dos sierras desafinadas por un pasa-bajos, con swell.
function organ(
  c: BaseAudioContext,
  dest: AudioNode,
  f: number,
  t: number,
  dur: number,
  peak: number,
  attack: number,
): void {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1100
  lp.Q.value = 0.7
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + Math.max(attack, dur * 0.55))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(g).connect(dest)
  for (const detune of [-7, 7]) {
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    o.detune.value = detune
    o.connect(lp)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
}

// ---------------------------------------------------------------------------
// Synths
// ---------------------------------------------------------------------------

// Cartas repartidas: un roce de papel por carta, cada 90 ms. Si viene una
// epica, swell de organo grave y campanita al final.
function synthCardsIn(rarities: Rarity[]): Synth {
  return (c, t, dest) => {
    const n = Math.max(1, rarities.length)
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.09
      hiss(c, dest, at, 0.13, 'bandpass', 1700 + i * 180, 3600 + i * 250, 1.3, 0.16, 0.012)
      hiss(c, dest, at, 0.05, 'highpass', 5000, 5000, 0.7, 0.05, 0.002)
    }
    let end = t + (n - 1) * 0.09 + 0.15
    if (rarities.includes('epica')) {
      for (const f of [110, 164.81, 220]) organ(c, dest, f, t, 1.1, 0.03, 0.35)
      const at = t + n * 0.09
      bell(c, dest, 880, at, 0.07, 0.9)
      end = Math.max(end, t + 1.1, at + 0.9)
    }
    return end - t
  }
}

// Hover: golpecito de cera, mas agudo cuanto mas rara la carta.
function synthCardHover(rarity: Rarity): Synth {
  return (c, t, dest) => {
    const f = [1150, 1450, 1800, 2250][RANK[rarity]]
    tone(c, dest, 'triangle', f, t, 0.05, 0.002, 0.05, f * 0.72)
    return 0.05
  }
}

// Eleccion: recompensa que crece con la rareza.
function synthCardPick(rarity: Rarity): Synth {
  return (c, t, dest) => {
    switch (rarity) {
      case 'comun':
        // campanita de madera (tipo marimba): fundamental + 4o parcial corto
        tone(c, dest, 'sine', 523.25, t, 0.16, 0.004, 0.4)
        tone(c, dest, 'sine', 2093, t, 0.04, 0.002, 0.08)
        hiss(c, dest, t, 0.03, 'bandpass', 1200, 1200, 2, 0.08, 0.001)
        return 0.4
      case 'poco':
        // dos notas de campana (mi, si)
        bell(c, dest, 659.25, t, 0.15, 0.6)
        bell(c, dest, 987.77, t + 0.11, 0.13, 0.7)
        return 0.81
      case 'rara': {
        // arpegio dorado de vela (do mayor) con brillo de ruido
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((f, i) => {
          tone(c, dest, 'triangle', f, t + i * 0.06, 0.15, 0.004, 0.5)
          tone(c, dest, 'sine', f * 2, t + i * 0.06, 0.035, 0.003, 0.3)
        })
        hiss(c, dest, t + 0.12, 0.5, 'highpass', 6500, 9000, 0.7, 0.025, 0.08)
        return 0.18 + 0.5
      }
      case 'epica': {
        // acorde de organo en re menor + campana + cola de brillo
        for (const f of [146.83, 220, 293.66, 349.23]) organ(c, dest, f, t, 1.15, 0.04, 0.05)
        bell(c, dest, 587.33, t + 0.04, 0.12, 1.1)
        tone(c, dest, 'sine', 1760, t + 0.18, 0.03, 0.01, 0.6)
        tone(c, dest, 'sine', 2349.3, t + 0.3, 0.025, 0.01, 0.6)
        hiss(c, dest, t + 0.1, 1.05, 'highpass', 6000, 9500, 0.7, 0.03, 0.2)
        return 1.2
      }
    }
  }
}

// Escudo: clink de vidrio con cera, apagado por un pasa-bajos.
const synthShield: Synth = (c, t, dest) => {
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  lp.connect(dest)
  tone(c, lp, 'sine', 1650, t, 0.2, 0.002, 0.22)
  tone(c, lp, 'sine', 2870, t, 0.09, 0.002, 0.12)
  tone(c, dest, 'triangle', 320, t, 0.22, 0.003, 0.1, 150)
  return 0.22
}

// Revivir: fosforo que raspa y prende, luego swell calido.
const synthRevive: Synth = (c, t, dest) => {
  hiss(c, dest, t, 0.1, 'bandpass', 2600, 4200, 0.9, 0.2, 0.01)
  hiss(c, dest, t + 0.09, 0.16, 'bandpass', 1400, 700, 0.8, 0.16, 0.004)
  const at = t + 0.12
  for (const [f, p] of [
    [220, 0.07],
    [329.63, 0.05],
    [440, 0.035],
  ] as const) {
    tone(c, dest, 'triangle', f, at, p, 0.28, 0.8)
  }
  return 0.12 + 0.8
}

// Cosecha: pluck corto que sube (dardo que vuelve a la mano).
const synthHarvest: Synth = (c, t, dest) => {
  tone(c, dest, 'triangle', 440, t, 0.22, 0.003, 0.24, 880)
  tone(c, dest, 'sine', 1318.5, t + 0.05, 0.07, 0.003, 0.18)
  return 0.24
}

// Cadena: chispazo metalico espectral. Sierra con zumbido (LFO cuadrado)
// filtrada por un pasa-banda que baja.
const synthChain: Synth = (c, t, dest) => {
  const dur = 0.2
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(1400, t)
  o.frequency.exponentialRampToValueAtTime(380, t + dur)
  const lfo = c.createOscillator()
  lfo.type = 'square'
  lfo.frequency.value = 55
  const depth = c.createGain()
  depth.gain.value = 160
  lfo.connect(depth).connect(o.frequency)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 5
  bp.frequency.setValueAtTime(2600, t)
  bp.frequency.exponentialRampToValueAtTime(900, t + dur)
  const g = c.createGain()
  env(g, t, 0.5, 0.003, dur)
  o.connect(bp).connect(g).connect(dest)
  o.start(t)
  o.stop(t + dur + 0.02)
  lfo.start(t)
  lfo.stop(t + dur + 0.02)
  hiss(c, dest, t, 0.07, 'highpass', 4500, 4500, 0.7, 0.1, 0.001)
  return dur
}

// Onda: whomp grave de choque.
const synthSplash: Synth = (c, t, dest) => {
  tone(c, dest, 'sine', 150, t, 0.4, 0.006, 0.36, 42)
  hiss(c, dest, t, 0.32, 'lowpass', 900, 160, 0.9, 0.3, 0.01)
  return 0.36
}

// Camara lenta: soplido que cae de tono, como cinta que se frena.
const synthSlowMo: Synth = (c, t, dest) => {
  hiss(c, dest, t, 0.42, 'bandpass', 2400, 280, 3, 0.22, 0.06)
  tone(c, dest, 'sine', 620, t, 0.05, 0.05, 0.42, 140)
  return 0.42
}

// Rafaga: varios silbidos de dardo, un poco desafinados y desfasados.
function synthVolley(shots: number): Synth {
  return (c, t, dest) => {
    const n = Math.max(1, Math.min(4, Math.round(shots)))
    const peak = 0.26 / Math.sqrt(n)
    for (let i = 0; i < n; i++) {
      const k = 1 + (i - (n - 1) / 2) * 0.09
      hiss(c, dest, t + i * 0.028, 0.28, 'bandpass', 900 * k, 2600 * k, 2.5, peak, 0.05)
    }
    return (n - 1) * 0.028 + 0.28
  }
}

// Para el banco de pruebas offline (no lo usa el juego).
export const FX_SYNTHS = {
  cardsIn: synthCardsIn,
  cardHover: synthCardHover,
  cardPick: synthCardPick,
  shield: synthShield,
  revive: synthRevive,
  harvest: synthHarvest,
  chain: synthChain,
  splash: synthSplash,
  slowMo: synthSlowMo,
  volley: synthVolley,
}

// ---------------------------------------------------------------------------
// Reproduccion en vivo
// ---------------------------------------------------------------------------

// Cada llamada usa un gain propio hacia el bus (seco + reverb) y lo desconecta
// al terminar. Nunca lanza: sin audio desbloqueado no hace nada.
function run(synth: Synth): void {
  const bus = fxBus()
  if (!bus) return
  try {
    const { c } = bus
    const g = c.createGain()
    bus.out(g)
    const dur = synth(c, c.currentTime + 0.005, g)
    setTimeout(() => g.disconnect(), (dur + 0.3) * 1000)
  } catch {
    // audio roto o contexto cerrado: silencio
  }
}

let lastHover = 0

export function playCardsIn(rarities: Rarity[]): void {
  run(synthCardsIn(rarities))
}
export function playCardHover(rarity: Rarity): void {
  const now = performance.now()
  if (now - lastHover < 70) return
  lastHover = now
  run(synthCardHover(rarity))
}
export function playCardPick(rarity: Rarity): void {
  run(synthCardPick(rarity))
}
export function playShield(): void {
  run(synthShield)
}
export function playRevive(): void {
  run(synthRevive)
}
export function playHarvest(): void {
  run(synthHarvest)
}
export function playChain(): void {
  run(synthChain)
}
export function playSplash(): void {
  run(synthSplash)
}
export function playSlowMo(): void {
  run(synthSlowMo)
}
export function playVolley(shots: number): void {
  run(synthVolley(shots))
}

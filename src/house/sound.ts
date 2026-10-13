// Sonido de la casa (Web Audio, sin librerias).
//
// Los golpes y el rechinido se SINTETIZAN: no hay MP3 que licenciar ni peso
// extra en la carga. Si se quiere un sonido real, basta con dejar
// `public/audio/knock.mp3` y/o `public/audio/creak.mp3`: se precargan al abrir
// la pagina y reemplazan al sintetizado automaticamente.
//   - knock.mp3: tres golpes en ~1 s (la animacion asume ese ritmo).
//   - creak.mp3: ~2.5 s de puerta rechinando.
//
// El AudioContext se crea DENTRO del primer gesto (clic en la puerta o en
// "Entrar directo"): asi el navegador lo deja sonar y ese mismo contexto queda
// desbloqueado para la musica del lobby.

export const KNOCK_TIMES = [0, 0.34, 0.68] // segundos, ritmo "toc toc toc"
export const CREAK_DURATION = 2.6

let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverb: ConvolverNode | null = null

// ---------------------------------------------------------------------------
// Muestras opcionales (override de los sintetizados)
// ---------------------------------------------------------------------------
const SAMPLE_URLS = { knock: '/audio/knock.mp3', creak: '/audio/creak.mp3' } as const
type SampleName = keyof typeof SAMPLE_URLS

const rawSamples = new Map<SampleName, Promise<ArrayBuffer | null>>()
const decoded = new Map<SampleName, AudioBuffer | null>()

// Descarga los bytes sin crear AudioContext (crearlo antes de un gesto ensucia
// la consola). Si el archivo no existe, el rewrite SPA devuelve index.html:
// por eso se valida el content-type.
export function preloadSamples(): void {
  for (const name of Object.keys(SAMPLE_URLS) as SampleName[]) {
    if (rawSamples.has(name)) continue
    rawSamples.set(
      name,
      fetch(SAMPLE_URLS[name])
        .then((r) =>
          r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/') ? r.arrayBuffer() : null,
        )
        .catch(() => null),
    )
  }
}

async function sample(name: SampleName): Promise<AudioBuffer | null> {
  if (decoded.has(name)) return decoded.get(name)!
  const bytes = await rawSamples.get(name)
  let buf: AudioBuffer | null = null
  if (bytes && ctx) {
    try {
      buf = await ctx.decodeAudioData(bytes.slice(0))
    } catch {
      buf = null
    }
  }
  decoded.set(name, buf)
  return buf
}

// ---------------------------------------------------------------------------
// Contexto + bus maestro con una reverb de hall vacio
// ---------------------------------------------------------------------------

// Llamar SINCRONICAMENTE dentro del handler del gesto.
export function unlockAudio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)

    reverb = ctx.createConvolver()
    reverb.buffer = hallImpulse(ctx, 1.8)
    const wet = ctx.createGain()
    wet.gain.value = 0.32
    reverb.connect(wet).connect(master)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function audioContext(): AudioContext | null {
  return ctx
}

// Respuesta de impulso: ruido estereo con caida exponencial (madera y piedra).
function hallImpulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const ir = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
  }
  return ir
}

// Conecta una fuente al master (seco) y a la reverb (humedo).
function out(node: AudioNode): void {
  node.connect(master!)
  node.connect(reverb!)
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds)
  const b = c.createBuffer(1, len, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return b
}

// ---------------------------------------------------------------------------
// Golpes en madera
// ---------------------------------------------------------------------------

// Un golpe = "thump" grave (seno que cae de tono) + cuerpo de madera (ruido
// filtrado). Cada golpe varia un poco para que no suene a loop.
function synthKnock(c: AudioContext, t: number, strength: number): void {
  const thump = c.createOscillator()
  const tg = c.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(118 + Math.random() * 14, t)
  thump.frequency.exponentialRampToValueAtTime(48, t + 0.13)
  tg.gain.setValueAtTime(0.0001, t)
  tg.gain.exponentialRampToValueAtTime(0.95 * strength, t + 0.004)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  thump.connect(tg)
  out(tg)
  thump.start(t)
  thump.stop(t + 0.22)

  const body = c.createBufferSource()
  body.buffer = noiseBuffer(c, 0.1)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 240 + Math.random() * 60
  bp.Q.value = 1.6
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1900
  const bg = c.createGain()
  bg.gain.setValueAtTime(0.0001, t)
  bg.gain.exponentialRampToValueAtTime(1.1 * strength, t + 0.002)
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  body.connect(bp).connect(lp).connect(bg)
  out(bg)
  body.start(t)
}

// Programa "toc toc toc". Resuelve cuando el sonido arranca.
export async function playKnocks(): Promise<void> {
  const c = unlockAudio()
  const buf = await sample('knock')
  const t0 = c.currentTime + 0.02
  if (buf) {
    const src = c.createBufferSource()
    src.buffer = buf
    out(src)
    src.start(t0)
    return
  }
  KNOCK_TIMES.forEach((dt, i) => synthKnock(c, t0 + dt, i === 2 ? 1 : 0.85))
}

// ---------------------------------------------------------------------------
// Rechinido de bisagra
// ---------------------------------------------------------------------------

// Modelo "stick-slip": la bisagra se traba y se suelta en micro-pulsos. Un
// tren de impulsos de frecuencia irregular (15-70 Hz) excita resonancias de
// madera (bandpass con Q alto) y eso da el quejido con tono que se arrastra.
function creakBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const sr = c.sampleRate
  const len = Math.floor(sr * seconds)
  const b = c.createBuffer(1, len, sr)
  const d = b.getChannelData(0)
  const ph = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28]
  let phase = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const u = t / seconds
    // tono del quejido: deriva lenta, sube al final (la puerta acelera y frena)
    const wobble = Math.sin(t * 2.1 + ph[0]) * 0.5 + Math.sin(t * 5.3 + ph[1]) * 0.3
    const rate = 22 + 26 * (0.5 + 0.5 * wobble) + 18 * u * u
    // envolvente: entra fuerte, tiene "hipos" y se apaga
    const groan = 0.55 + 0.45 * Math.sin(t * 3.7 + ph[2])
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.5) * groan
    phase += rate / sr
    if (phase >= 1) {
      phase -= 1
      d[i] = env * (0.6 + Math.random() * 0.4)
    } else {
      d[i] = (Math.random() * 2 - 1) * 0.012 * env
    }
  }
  return b
}

export async function playCreak(): Promise<void> {
  const c = unlockAudio()
  const buf = await sample('creak')
  const t0 = c.currentTime + 0.02
  if (buf) {
    const src = c.createBufferSource()
    src.buffer = buf
    out(src)
    src.start(t0)
    return
  }
  const src = c.createBufferSource()
  src.buffer = creakBuffer(c, CREAK_DURATION)
  const sum = c.createGain()
  sum.gain.value = 5.5
  // resonancias de la madera
  for (const [f, q, g] of [
    [480, 14, 1],
    [1080, 10, 0.7],
    [2250, 7, 0.35],
  ] as const) {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = q
    const bg = c.createGain()
    bg.gain.value = g
    src.connect(bp).connect(bg).connect(sum)
  }
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 6
  sum.connect(comp)
  out(comp)
  src.start(t0)
}

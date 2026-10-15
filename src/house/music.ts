// Musica de la casa: UNA sola pista sonando para toda la visita. Vive fuera de
// React para que el cambio hall <-> minijuego no la corte ni la reinicie.
//
// Playlist: embrujada.tracks en Supabase, en el orden que se define en /admin
// (los MP3 tienen copyright y el repo es publico: nunca van al repo).
// preload() la pide apenas abre la pagina, en un chunk aparte para no frenar
// la puerta.
//
// Autoplay: el navegador solo deja sonar audio despues de un gesto. El clic en
// la puerta llama a prime(), que arranca el elemento en silencio dentro del
// gesto y lo deja desbloqueado; start() en el hall ya puede sonar.

import type { Track } from '../lib/tracks'

export type MusicState = {
  tracks: Track[]
  index: number
  playing: boolean
  progress: number // 0..1
}

const VOLUME = 0.5 // debajo de los efectos: el pop y el game over mandan
const FADE_IN_MS = 1600
const FADE_OUT_MS = 450

let el: HTMLAudioElement | null = null
let state: MusicState = { tracks: [], index: 0, playing: false, progress: 0 }
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

let wanted = false // alguien pidio que suene (start/resume/toggle)
let userPaused = false // la persona la pauso: nada la vuelve a encender sola
let autoPaused = false // la paro el game over: resume() la devuelve
let fadeRaf = 0

function set(patch: Partial<MusicState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

function audio(): HTMLAudioElement | null {
  if (!state.tracks.length) return null
  if (el) return el
  el = new Audio(state.tracks[state.index].url)
  el.preload = 'auto'
  el.volume = 0
  el.addEventListener('play', () => set({ playing: true }))
  el.addEventListener('pause', () => set({ playing: false }))
  el.addEventListener('ended', () => go(1))
  el.addEventListener('timeupdate', () => {
    if (el?.duration) set({ progress: el.currentTime / el.duration })
  })
  return el
}

// iOS ignora volume (siempre 1): ahi el fade no existe y el corte es seco.
function fadeTo(target: number, ms: number, done?: () => void) {
  const a = el
  if (!a) return
  cancelAnimationFrame(fadeRaf)
  const from = a.volume
  const t0 = performance.now()
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms)
    a.volume = from + (target - from) * k
    if (k < 1) fadeRaf = requestAnimationFrame(tick)
    else done?.()
  }
  fadeRaf = requestAnimationFrame(tick)
}

async function playWithFade() {
  const a = audio()
  if (!a) return
  wanted = true
  a.muted = false
  try {
    await a.play()
    fadeTo(VOLUME, FADE_IN_MS)
  } catch {
    // sin gesto previo el navegador lo bloquea: queda en pausa, el boton lo enciende
  }
}

function go(delta: number) {
  const a = audio()
  if (!a) return
  const { tracks } = state
  const index = (state.index + delta + tracks.length) % tracks.length
  set({ index, progress: 0 })
  a.src = tracks[index].url
  if (wanted && !userPaused && !autoPaused) {
    a.volume = VOLUME
    void a.play().catch(() => {})
  }
}

export const music = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  snapshot: () => state,

  // Pide la playlist una vez. Si el hall ya pidio musica, arranca al llegar.
  preload() {
    loading ??= import('../lib/tracks')
      .then((m) => m.listTracks())
      .then((tracks) => {
        set({ tracks, index: 0 })
        if (wanted && !userPaused && !autoPaused) void playWithFade()
      })
      .catch(() => {}) // sin musica la casa sigue funcionando
  },

  // Llamar SINCRONICAMENTE dentro del gesto de entrada (puerta o "entrar directo").
  prime() {
    const a = audio()
    if (!a || !a.paused) return
    a.muted = true
    a.play()
      .then(() => {
        if (!wanted) {
          a.pause()
          a.currentTime = 0
        }
        a.muted = false
      })
      .catch(() => {
        a.muted = false
      })
  },

  // Hall: arranca o retoma, salvo que la persona la haya pausado.
  start() {
    wanted = true
    autoPaused = false
    if (!userPaused && el?.paused !== false) void playWithFade()
  },

  // Game over: baja y se detiene para que se escuche el sonido de perder.
  hush() {
    const a = el
    if (!a || a.paused) return
    autoPaused = true
    fadeTo(0, FADE_OUT_MS, () => {
      if (autoPaused) a.pause()
    })
  },

  // Nueva partida: vuelve si la paro el game over.
  resume() {
    if (!autoPaused) return
    autoPaused = false
    if (!userPaused) void playWithFade()
  },

  toggle() {
    const a = audio()
    if (!a) return
    if (a.paused) {
      userPaused = false
      autoPaused = false
      void playWithFade()
    } else {
      userPaused = true
      cancelAnimationFrame(fadeRaf)
      a.pause()
    }
  },

  next: () => go(1),
  prev() {
    // como en cualquier reproductor: si ya avanzo, vuelve al inicio de la pista
    if (el && el.currentTime > 3) {
      el.currentTime = 0
      return
    }
    go(-1)
  },

  seek(fraction: number) {
    if (el?.duration) el.currentTime = fraction * el.duration
  },
}

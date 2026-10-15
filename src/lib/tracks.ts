import { isSupabaseConfigured, supabase } from './supabase'

// Una pista del tocadiscos. Los MP3 viven en el bucket (el repo es publico y
// la musica tiene copyright): se administran desde /admin.
export type Track = {
  id: string
  title: string
  artist: string | null
  url: string
  storage_path: string
  duration_s: number | null
  position: number
}

type Row = Omit<Track, 'url'>

export const MUSIC_BUCKET = 'embrujada-musica'
export const MAX_TRACK_BYTES = 20 * 1024 * 1024 // igual que el bucket

const clean = (s: string, max: number) => s.trim().replace(/\s+/g, ' ').slice(0, max)

export function normalizeTitle(raw: string): string | null {
  return clean(raw, 120) || null
}
export function normalizeArtist(raw: string): string | null {
  return clean(raw, 80) || null
}

// "02 - Black Hole Sun - Soundgarden.mp3" -> titulo + artista. El numero
// inicial es opcional y se descarta; sin " - " no hay artista.
export function parseTrackName(filename: string): { title: string; artist: string | null } {
  const base = filename
    .replace(/\.mp3$/i, '')
    .replace(/_+/g, ' ')
    .replace(/^\d+\s*[-.]\s*/, '')
  const [title, ...rest] = base.split(' - ')
  return {
    title: normalizeTitle(title) ?? 'Sin titulo',
    artist: rest.length ? normalizeArtist(rest.join(' - ')) : null,
  }
}

export function isMp3(file: File): boolean {
  return file.type === 'audio/mpeg' || file.type === 'audio/mp3' || /\.mp3$/i.test(file.name)
}

// Duracion leyendo solo los metadatos del archivo local (no se sube nada).
export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : null)
    a.onerror = () => done(null)
    a.src = url
  })
}

// ---------------------------------------------------------------------------
// Fallback local (IndexedDB) para dev sin nube. Base aparte de la de
// personajes para no tener que versionar la suya.
// ---------------------------------------------------------------------------
const DB_NAME = 'embrujada-demo-music'
const STORE = 'tracks'
type LocalRow = Row & { blob: Blob }
const urlCache = new Map<string, string>()

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function localTx(mode: IDBTransactionMode, run: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openLocalDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function localAll(): Promise<LocalRow[]> {
  const db = await openLocalDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as LocalRow[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

function localUrl(r: LocalRow): string {
  let u = urlCache.get(r.id)
  if (!u) {
    u = URL.createObjectURL(r.blob)
    urlCache.set(r.id, u)
  }
  return u
}

async function localPatch(id: string, patch: Partial<Row>): Promise<void> {
  await localTx('readwrite', (store) => {
    const get = store.get(id)
    get.onsuccess = () => {
      if (get.result) store.put({ ...get.result, ...patch })
    }
  })
}

const byOrder = (a: Row, b: Row) => a.position - b.position

// ---------------------------------------------------------------------------
// API publica (misma firma con Supabase o IndexedDB)
// ---------------------------------------------------------------------------
export async function listTracks(): Promise<Track[]> {
  if (!isSupabaseConfigured) {
    return (await localAll()).sort(byOrder).map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      storage_path: r.storage_path,
      duration_s: r.duration_s,
      position: r.position,
      url: localUrl(r),
    }))
  }
  const { data, error } = await supabase()
    .from('tracks')
    .select('id, title, artist, storage_path, duration_s, position')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const bucket = supabase().storage.from(MUSIC_BUCKET)
  return (data as Row[]).map((r) => ({ ...r, url: bucket.getPublicUrl(r.storage_path).data.publicUrl }))
}

type NewTrack = { title: string; artist: string | null; position: number }

export async function uploadTrack(file: File, meta: NewTrack): Promise<void> {
  if (!isMp3(file)) throw new Error(`${file.name}: solo MP3.`)
  if (file.size > MAX_TRACK_BYTES) throw new Error(`${file.name}: pesa mas de 20 MB.`)
  const duration_s = await readDuration(file)

  if (!isSupabaseConfigured) {
    const id = crypto.randomUUID()
    const row: LocalRow = { id, storage_path: id, duration_s, blob: file, ...meta }
    return localTx('readwrite', (s) => s.put(row))
  }

  const sb = supabase()
  const path = `${crypto.randomUUID()}.mp3`
  const up = await sb.storage
    .from(MUSIC_BUCKET)
    .upload(path, file, { contentType: 'audio/mpeg', cacheControl: '31536000' })
  if (up.error) throw new Error(`${file.name}: ${up.error.message}`)
  const { error } = await sb.from('tracks').insert({ ...meta, storage_path: path, duration_s })
  if (error) {
    await sb.storage.from(MUSIC_BUCKET).remove([path]) // no dejar huerfanos
    throw new Error(`${file.name}: ${error.message}`)
  }
}

export async function updateTrack(t: Track, patch: Partial<Pick<Track, 'title' | 'artist'>>): Promise<void> {
  if (!isSupabaseConfigured) return localPatch(t.id, patch)
  const { error } = await supabase().from('tracks').update(patch).eq('id', t.id)
  if (error) throw new Error(error.message)
}

// Reescribe las posiciones segun el orden recibido (solo las que cambian).
export async function saveOrder(ordered: Track[]): Promise<void> {
  const changed = ordered.map((t, i) => ({ t, i })).filter(({ t, i }) => t.position !== i)
  if (!isSupabaseConfigured) {
    for (const { t, i } of changed) await localPatch(t.id, { position: i })
    return
  }
  const sb = supabase()
  const results = await Promise.all(
    changed.map(({ t, i }) => sb.from('tracks').update({ position: i }).eq('id', t.id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
}

export async function deleteTrack(t: Track): Promise<void> {
  if (!isSupabaseConfigured) {
    await localTx('readwrite', (s) => s.delete(t.id))
    const u = urlCache.get(t.id)
    if (u) URL.revokeObjectURL(u)
    urlCache.delete(t.id)
    return
  }
  const sb = supabase()
  const { error } = await sb.from('tracks').delete().eq('id', t.id)
  if (error) throw new Error(error.message)
  await sb.storage.from(MUSIC_BUCKET).remove([t.storage_path]) // best-effort
}

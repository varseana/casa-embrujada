import { isSupabaseConfigured, supabase, BUCKET } from './supabase'
import { makeVariants, extensionFor } from './image'

// Un personaje = un colaborador disfrazado (PNG recortado) que camina por el lobby.
export type Character = {
  id: string
  name: string | null
  public_url: string // HD (para el hover grande)
  thumb_url: string // miniatura (sprite que camina)
  storage_path: string
  thumb_path: string | null
  created_at?: string
}

// Fila cruda de embrujada.characters
type Row = {
  id: string
  name: string | null
  storage_path: string
  thumb_path: string | null
  created_at: string | null
}

// Nombre limpio: recorta y colapsa espacios. null si queda vacio.
export function normalizeName(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, 60) : null
}

// URL publica y ESTABLE del bucket: no expira, evita parpadeo entre refrescos.
function publicUrl(path: string): string {
  return supabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// ---------------------------------------------------------------------------
// Fallback local (IndexedDB) para dev sin nube. Guarda dos blobs comprimidos.
// ---------------------------------------------------------------------------
const DB_NAME = 'embrujada-demo'
const STORE = 'characters'

type LocalRow = { id: string; name: string | null; hd: Blob; thumb: Blob; created_at: string }

// Object URLs cacheadas por id: estables entre refrescos en modo demo.
const urlCache = new Map<string, { hd: string; thumb: string }>()

function cachedUrls(id: string, hd: Blob, thumb: Blob) {
  let e = urlCache.get(id)
  if (!e) {
    e = { hd: URL.createObjectURL(hd), thumb: URL.createObjectURL(thumb) }
    urlCache.set(id, e)
  }
  return e
}

function invalidateUrls(id: string): void {
  const e = urlCache.get(id)
  if (e) {
    URL.revokeObjectURL(e.hd)
    URL.revokeObjectURL(e.thumb)
    urlCache.delete(id)
  }
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Corre una operacion en una transaccion y resuelve al completarse.
async function localTx(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openLocalDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function localList(): Promise<Character[]> {
  const db = await openLocalDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = ((req.result as LocalRow[]) || []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      )
      resolve(
        rows.map((r) => {
          const urls = cachedUrls(r.id, r.hd, r.thumb)
          return {
            id: r.id,
            name: r.name,
            public_url: urls.hd,
            thumb_url: urls.thumb,
            storage_path: r.id,
            thumb_path: null,
            created_at: r.created_at,
          }
        }),
      )
    }
    req.onerror = () => reject(req.error)
  })
}

async function localPatch(id: string, patch: Partial<LocalRow>): Promise<void> {
  await localTx('readwrite', (store) => {
    const get = store.get(id)
    get.onsuccess = () => {
      if (get.result) store.put({ ...get.result, ...patch })
    }
  })
  if (patch.hd || patch.thumb) invalidateUrls(id)
}

// ---------------------------------------------------------------------------
// Helpers Supabase Storage
// ---------------------------------------------------------------------------
async function uploadVariants(file: File): Promise<{ hdPath: string; thumbPath: string }> {
  const { thumb, hd } = await makeVariants(file)
  const uuid = crypto.randomUUID()
  const hdPath = `${uuid}.${extensionFor(hd)}`
  const thumbPath = `${uuid}_t.${extensionFor(thumb)}`
  const sb = supabase()
  const up = async (path: string, body: Blob) => {
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, body, { contentType: body.type, cacheControl: '31536000' })
    if (error) throw new Error(error.message)
  }
  await up(hdPath, hd)
  await up(thumbPath, thumb)
  return { hdPath, thumbPath }
}

async function removeObjects(paths: (string | null | undefined)[]): Promise<void> {
  const clean = paths.filter(Boolean) as string[]
  if (clean.length) await supabase().storage.from(BUCKET).remove(clean)
}

// ---------------------------------------------------------------------------
// API publica (misma firma con Supabase o IndexedDB)
// ---------------------------------------------------------------------------
export async function listCharacters(): Promise<Character[]> {
  if (!isSupabaseConfigured) return localList()

  const { data, error } = await supabase()
    .from('characters')
    .select('id, name, storage_path, thumb_path, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  return (data as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    storage_path: row.storage_path,
    thumb_path: row.thumb_path,
    public_url: publicUrl(row.storage_path),
    thumb_url: publicUrl(row.thumb_path ?? row.storage_path),
    created_at: row.created_at ?? undefined,
  }))
}

export async function uploadCharacter(file: File, name: string | null): Promise<void> {
  const clean = name ? normalizeName(name) : null
  if (!isSupabaseConfigured) {
    const { thumb, hd } = await makeVariants(file)
    const row: LocalRow = {
      id: crypto.randomUUID(),
      name: clean,
      hd,
      thumb,
      created_at: new Date().toISOString(),
    }
    return localTx('readwrite', (store) => store.put(row))
  }

  const { hdPath, thumbPath } = await uploadVariants(file)
  const { error } = await supabase()
    .from('characters')
    .insert({ name: clean, storage_path: hdPath, thumb_path: thumbPath })
  if (error) {
    await removeObjects([hdPath, thumbPath]) // no dejar huerfanos en el bucket
    throw new Error(error.message)
  }
}

export async function deleteCharacter(c: Character): Promise<void> {
  if (!isSupabaseConfigured) {
    await localTx('readwrite', (store) => store.delete(c.id))
    return invalidateUrls(c.id)
  }

  const { error } = await supabase().from('characters').delete().eq('id', c.id)
  if (error) throw new Error(error.message)
  await removeObjects([c.storage_path, c.thumb_path]) // best-effort en el bucket
}

export async function renameCharacter(c: Character, name: string | null): Promise<void> {
  const clean = name ? normalizeName(name) : null
  if (!isSupabaseConfigured) return localPatch(c.id, { name: clean })

  const { error } = await supabase().from('characters').update({ name: clean }).eq('id', c.id)
  if (error) throw new Error(error.message)
}

// Reemplaza el PNG (thumb + hd) manteniendo el mismo personaje. Borra los anteriores.
export async function replaceCharacterImage(c: Character, file: File): Promise<void> {
  if (!isSupabaseConfigured) {
    const { thumb, hd } = await makeVariants(file)
    return localPatch(c.id, { hd, thumb })
  }

  const oldPaths = [c.storage_path, c.thumb_path]
  const { hdPath, thumbPath } = await uploadVariants(file)
  const { error } = await supabase()
    .from('characters')
    .update({ storage_path: hdPath, thumb_path: thumbPath })
    .eq('id', c.id)
  if (error) {
    await removeObjects([hdPath, thumbPath])
    throw new Error(error.message)
  }
  await removeObjects(oldPaths)
}

import { createClient } from '@supabase/supabase-js'

// Casa Embrujada vive en el MISMO proyecto Supabase que "Juntos por Akira" y
// "Desfile de Faroles", aislada en su propio schema `embrujada` (tablas, RLS y
// policies separadas). Las tres apps conviven sin chocar.
//
// La publishable key es PUBLICA por diseño (va en el bundle del cliente); la
// seguridad la dan RLS + la tabla embrujada.admins. Las env vars VITE_SUPABASE_*
// tienen prioridad si se definen, para apuntar a otro proyecto sin tocar codigo.
const DEFAULT_URL = 'https://turbsofuturtlbdsabfu.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_8Aw2RH64oUjhpq6R_gLRSw_HdCzbwfZ'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

// VITE_DEMO=1 fuerza el modo demo local (IndexedDB) aunque haya Supabase.
const forceDemo = import.meta.env.VITE_DEMO === '1'

export const isSupabaseConfigured = Boolean(url && anonKey) && !forceDemo

// Bucket exclusivo de la casa (solo webp/png, max 8 MB, ver supabase/embrujada.sql).
export const BUCKET = 'embrujada-personajes'

// Cliente apuntado al schema `embrujada`: `.from('characters')` resuelve a
// `embrujada.characters`, nunca toca tablas de Akira ni de faroles.
function makeClient() {
  return createClient(url!, anonKey!, { db: { schema: 'embrujada' } })
}

let _client: ReturnType<typeof makeClient> | null = null

export function supabase(): ReturnType<typeof makeClient> {
  if (!_client) {
    if (!isSupabaseConfigured) throw new Error('Supabase no configurado')
    _client = makeClient()
  }
  return _client
}

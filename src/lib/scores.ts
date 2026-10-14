import { isSupabaseConfigured, supabase } from './supabase'

// Puntajes del minijuego. En Supabase: tabla embrujada.scores + vista
// embrujada.best_scores (mejor partida por alias, ver supabase/embrujada-scores.sql).
// Sin nube (modo demo): localStorage con la misma forma.

export type ScoreRow = { alias: string; score: number; rooms: number }

const ALIAS_KEY = 'embrujada-alias'
const LOCAL_KEY = 'embrujada-scores'

// Mismo formato que el check de la tabla: login de Amazon en minusculas.
const ALIAS_RE = /^[a-z][a-z0-9]{1,19}$/

// Limpia lo que la persona escribe: recorta, pasa a minusculas y quita un
// "@amazon.com" (o cualquier dominio) si lo pego entero.
export function normalizeAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/@.*$/, '')
}

export function isValidAlias(alias: string): boolean {
  return ALIAS_RE.test(alias)
}

export function rememberedAlias(): string {
  try {
    return localStorage.getItem(ALIAS_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberAlias(alias: string) {
  try {
    localStorage.setItem(ALIAS_KEY, alias)
  } catch {
    // modo privado sin storage: no pasa nada, solo no se recuerda
  }
}

function localAll(): ScoreRow[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as ScoreRow[]
  } catch {
    return []
  }
}

// Mejor partida por alias, de mayor a menor.
function localBest(): ScoreRow[] {
  const best = new Map<string, ScoreRow>()
  for (const r of localAll()) {
    const cur = best.get(r.alias)
    if (!cur || r.score > cur.score) best.set(r.alias, r)
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}

// Guarda la partida y devuelve el puesto del alias en el leaderboard (1-based),
// contando su mejor puntaje, no necesariamente esta partida.
export async function submitScore(rawAlias: string, score: number, rooms: number): Promise<number> {
  const alias = normalizeAlias(rawAlias)
  if (!isValidAlias(alias)) throw new Error('Alias invalido')
  rememberAlias(alias)

  if (!isSupabaseConfigured) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...localAll(), { alias, score, rooms }]))
    const board = localBest()
    return board.findIndex((r) => r.alias === alias) + 1
  }

  const sb = supabase()
  const { error } = await sb.from('scores').insert({ alias, score, rooms })
  if (error) throw new Error(error.message)

  const { data: mine, error: e1 } = await sb.from('best_scores').select('score').eq('alias', alias).single()
  if (e1) throw new Error(e1.message)
  const { count, error: e2 } = await sb
    .from('best_scores')
    .select('alias', { count: 'exact', head: true })
    .gt('score', (mine as { score: number }).score)
  if (e2) throw new Error(e2.message)
  return (count ?? 0) + 1
}

export async function topScores(limit = 3): Promise<ScoreRow[]> {
  if (!isSupabaseConfigured) return localBest().slice(0, limit)

  const { data, error } = await supabase()
    .from('best_scores')
    .select('alias, score, rooms')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true }) // empate: gana quien llego primero
    .limit(limit)
  if (error) throw new Error(error.message)
  return data as ScoreRow[]
}

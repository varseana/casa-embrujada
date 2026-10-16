import { useEffect, useState, useCallback } from 'react'
import {
  listCharacters,
  uploadCharacter,
  deleteCharacter,
  renameCharacter,
  replaceCharacterImage,
  normalizeName,
  type Character,
} from '../lib/characters'
import { isSupabaseConfigured } from '../lib/supabase'
import { signInAdmin, signOutAdmin, isHouseAdmin } from '../lib/auth'
import AdminMusic from './AdminMusic'

// En modo demo (sin backend) se entra con esta clave simple. Con Supabase el
// login es un usuario real + la tabla embrujada.admins (nada incrustado en el bundle).
const DEMO_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string) || 'embrujada2026'
const AUTH_KEY = 'embrujada-admin-ok'
const ACCEPT = 'image/png,image/webp'

type Tab = 'personajes' | 'musica'

// "maria-jose_perez.png" -> "Maria Jose Perez". Asi una tanda de 100 PNG sale
// con nombre sin tipear nada; despues se corrige inline si hace falta.
function nameFromFile(file: File): string | null {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
  const titled = base.replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase())
  return normalizeName(titled)
}

export default function Admin() {
  const [authed, setAuthed] = useState(
    isSupabaseConfigured ? false : sessionStorage.getItem(AUTH_KEY) === '1',
  )
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [items, setItems] = useState<Character[]>([])
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('personajes')
  const [trackCount, setTrackCount] = useState(0)

  const fail = (msg: string) => setErrors((prev) => [...prev, msg])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listCharacters())
    } catch (e) {
      setErrors([String(e)])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    document.title = "Admin · VIBE's Haunted House"
  }, [])

  useEffect(() => {
    if (authed) refresh()
  }, [authed, refresh])

  // Restaurar sesion de Supabase si ya habia login (y sigue siendo admin).
  useEffect(() => {
    if (!isSupabaseConfigured) return
    isHouseAdmin()
      .then(setAuthed)
      .catch(() => setAuthed(false))
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    if (!isSupabaseConfigured) {
      if (pass === DEMO_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, '1')
        setAuthed(true)
      } else {
        fail('Contraseña incorrecta')
      }
      return
    }
    const res = await signInAdmin(email, pass)
    if (res.ok) setAuthed(true)
    else fail(res.error)
  }

  const logout = async () => {
    if (isSupabaseConfigured) await signOutAdmin()
    else sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
    setEmail('')
    setPass('')
  }

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setProgress({ done: 0, total: list.length })
    setErrors([])
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadCharacter(list[i], nameFromFile(list[i]))
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e))
      }
      setProgress({ done: i + 1, total: list.length })
    }
    setProgress(null)
    refresh()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    onFiles(e.dataTransfer.files)
  }

  const remove = async (c: Character) => {
    if (!confirm(`¿Sacar a ${c.name ?? 'este personaje'} de la casa?`)) return
    try {
      await deleteCharacter(c)
      setItems((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      fail(String(e))
    }
  }

  const startEdit = (c: Character) => {
    setEditingId(c.id)
    setDraftName(c.name ?? '')
  }

  // Guarda al salir del input (blur) o con Enter; Escape cancela. Update optimista:
  // se refleja al instante, solo escribe si cambio y revierte con refresh() si falla.
  const commitName = (c: Character, raw: string) => {
    const name = normalizeName(raw)
    setEditingId(null)
    if ((c.name ?? null) === name) return
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, name } : x)))
    renameCharacter(c, name).catch((e) => {
      fail(String(e))
      refresh()
    })
  }

  const replace = async (c: Character, files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusyId(c.id)
    try {
      await replaceCharacterImage(c, file)
      await refresh()
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!authed) {
    return (
      <main className="admin-login">
        <form onSubmit={login}>
          <h1>Llaves de la casa</h1>
          <p>
            {isSupabaseConfigured
              ? 'Ingresá con tu usuario para administrar a los personajes.'
              : 'Modo demo local: ingresá la contraseña de prueba.'}
          </p>
          {isSupabaseConfigured && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              autoComplete="username"
              autoFocus
            />
          )}
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
            autoComplete="current-password"
            autoFocus={!isSupabaseConfigured}
          />
          <button type="submit">Entrar</button>
          {errors.map((m, i) => (
            <p className="err" key={i}>
              {m}
            </p>
          ))}
        </form>
      </main>
    )
  }

  return (
    <main className="admin">
      <header className="admin-head">
        <div>
          <h1 className="admin-kicker">Llaves de la casa</h1>
          <div className="admin-tabs" role="tablist" aria-label="Secciones">
            {(['personajes', 'musica'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`admin-tab${tab === t ? ' is-active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'personajes' ? 'Personajes' : 'Música'}
              </button>
            ))}
          </div>
          <span className="count">
            {tab === 'personajes'
              ? `${items.length} ${items.length === 1 ? 'habitante' : 'habitantes'}`
              : `${trackCount} ${trackCount === 1 ? 'pista' : 'pistas'}`}
          </span>
        </div>
        <div className="head-actions">
          {!isSupabaseConfigured && <span className="demo-tag">modo demo local</span>}
          <a className="link" href="/" target="_blank" rel="noreferrer">
            Ver la casa
          </a>
          <button className="link" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      {tab === 'musica' && <AdminMusic onCount={setTrackCount} />}

      {tab === 'personajes' && (
        <>
          <label
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept={ACCEPT} multiple onChange={(e) => onFiles(e.target.files)} hidden />
            <strong>Soltá los PNG recortados acá</strong>
            <p>
              Un PNG por persona, con fondo transparente y cuerpo completo. El nombre sale del archivo
              (maria-perez.png queda "Maria Perez") y se edita después. Los márgenes vacíos se recortan solos
              para que los pies toquen el piso.
            </p>
          </label>

          {progress && (
            <div className="progress" role="status">
              Subiendo {progress.done} / {progress.total}
            </div>
          )}
          {errors.length > 0 && (
            <ul className="banner err" role="alert">
              {errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          {loading && items.length === 0 && <div className="progress">Cargando…</div>}

          <div className="grid">
            {items.map((c) => (
              <div className="cell" key={c.id}>
                <img src={c.thumb_url} alt={c.name ?? 'Personaje sin nombre'} loading="lazy" />

                {busyId === c.id && <div className="cell-busy">Cambiando…</div>}

                <div className="cell-actions">
                  <label className="cell-btn" title="Cambiar PNG">
                    <ReplaceIcon />
                    <input type="file" accept={ACCEPT} hidden onChange={(e) => replace(c, e.target.files)} />
                  </label>
                  <button className="cell-btn danger" title="Borrar" onClick={() => remove(c)}>
                    <TrashIcon />
                  </button>
                </div>

                {editingId === c.id ? (
                  <div className="cell-edit">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Nombre"
                      aria-label="Nombre"
                      autoFocus
                      onBlur={() => commitName(c, draftName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitName(c, draftName)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingId(null)
                        }
                      }}
                    />
                    <span className="cell-hint">Enter guarda | Esc cancela</span>
                  </div>
                ) : (
                  <button className="cell-name" onClick={() => startEdit(c)} title="Editar nombre">
                    {c.name ?? 'sin nombre'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

function ReplaceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 6a6 6 0 0 1 5.2 3M18 4v3h-3M12 18a6 6 0 0 1-5.2-3M6 20v-3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
      />
    </svg>
  )
}

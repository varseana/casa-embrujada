import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteTrack,
  listTracks,
  normalizeArtist,
  normalizeTitle,
  parseTrackName,
  saveOrder,
  updateTrack,
  uploadTrack,
  type Track,
} from '../lib/tracks'

const ACCEPT = 'audio/mpeg,.mp3'

type Props = {
  onCount: (n: number) => void
}

type Field = 'title' | 'artist'

const mmss = (s: number | null) =>
  s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Panel de musica del tocadiscos: subir MP3, editar titulo y artista en linea,
// ordenar, escuchar y quitar. El orden de esta lista es el del hall.
export default function AdminMusic({ onCount }: Props) {
  const [items, setItems] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null)
  const [draft, setDraft] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)

  const fail = (msg: string) => setErrors((prev) => [...prev, msg])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listTracks())
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    onCount(items.length)
  }, [items.length, onCount])

  // la vista previa no sigue sonando al cambiar de pestaña o salir
  useEffect(() => () => previewRef.current?.pause(), [])

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setErrors([])
    let position = items.length ? Math.max(...items.map((t) => t.position)) + 1 : 0
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      setProgress({ done: i, total: list.length, name: f.name })
      try {
        await uploadTrack(f, { ...parseTrackName(f.name), position })
        position++
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e))
      }
    }
    setProgress(null)
    void refresh()
  }

  const togglePreview = (t: Track) => {
    const a = (previewRef.current ??= new Audio())
    if (previewId === t.id && !a.paused) {
      a.pause()
      setPreviewId(null)
      return
    }
    a.src = t.url
    a.onended = () => setPreviewId(null)
    a.play()
      .then(() => setPreviewId(t.id))
      .catch(() => fail(`No se pudo reproducir "${t.title}".`))
  }

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    const next = [...items]
    ;[next[index], next[to]] = [next[to], next[index]]
    const before = items
    // optimista: se ve al instante; las posiciones quedan 0..n-1
    setItems(next.map((t, i) => ({ ...t, position: i })))
    saveOrder(next).catch((e) => {
      fail(e instanceof Error ? e.message : String(e))
      setItems(before)
      void refresh()
    })
  }

  const remove = async (t: Track) => {
    if (!confirm(`¿Quitar "${t.title}" del tocadiscos?`)) return
    if (previewId === t.id) {
      previewRef.current?.pause()
      setPreviewId(null)
    }
    try {
      await deleteTrack(t)
      setItems((prev) => prev.filter((x) => x.id !== t.id))
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  const startEdit = (t: Track, field: Field) => {
    setEditing({ id: t.id, field })
    setDraft((field === 'title' ? t.title : t.artist) ?? '')
  }

  // Guarda al salir (blur) o con Enter; Escape cancela. Optimista con revert.
  const commit = (t: Track, field: Field, raw: string) => {
    setEditing(null)
    const value = field === 'title' ? normalizeTitle(raw) : normalizeArtist(raw)
    if (field === 'title' && !value) return // el titulo no puede quedar vacio
    if ((field === 'title' ? t.title : t.artist) === value) return
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, [field]: value } : x)))
    updateTrack(t, { [field]: value }).catch((e) => {
      fail(e instanceof Error ? e.message : String(e))
      void refresh()
    })
  }

  const cell = (t: Track, field: Field) => {
    const value = field === 'title' ? t.title : t.artist
    if (editing?.id === t.id && editing.field === field) {
      return (
        <input
          className="track-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={field === 'title' ? 'Titulo' : 'Artista'}
          aria-label={field === 'title' ? 'Titulo' : 'Artista'}
          autoFocus
          onBlur={() => commit(t, field, draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(t, field, draft)
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(null)
            }
          }}
        />
      )
    }
    return (
      <button
        type="button"
        className={`track-field is-${field}${value ? '' : ' is-empty'}`}
        onClick={() => startEdit(t, field)}
        title={field === 'title' ? 'Editar titulo' : 'Editar artista'}
      >
        {value ?? 'sin artista'}
      </button>
    )
  }

  return (
    <>
      <label
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void onFiles(e.dataTransfer.files)
        }}
      >
        <input type="file" accept={ACCEPT} multiple onChange={(e) => void onFiles(e.target.files)} hidden />
        <strong>Soltá los MP3 acá</strong>
        <p>
          Hasta 20 MB cada uno. El título y el artista salen del archivo ("Black Hole Sun - Soundgarden.mp3")
          y se editan después. Las pistas suenan en el hall en el orden de esta lista. Los MP3 quedan en
          Supabase, nunca en el repo.
        </p>
      </label>

      {progress && (
        <div className="progress" role="status">
          Subiendo {progress.done + 1} / {progress.total}: {progress.name}
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
      {!loading && items.length === 0 && !progress && (
        <p className="progress">
          El tocadiscos está vacío. Mientras no haya pistas, el reproductor no aparece.
        </p>
      )}

      {items.length > 0 && (
        <ol className="tracklist">
          {items.map((t, i) => (
            <li className={`track-row${previewId === t.id ? ' is-previewing' : ''}`} key={t.id}>
              <span className="track-num">{String(i + 1).padStart(2, '0')}</span>
              <button
                type="button"
                className="cell-btn"
                onClick={() => togglePreview(t)}
                aria-label={previewId === t.id ? `Detener ${t.title}` : `Escuchar ${t.title}`}
                title={previewId === t.id ? 'Detener' : 'Escuchar'}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path
                    d={previewId === t.id ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'}
                    fill="currentColor"
                  />
                </svg>
              </button>
              <div className="track-text">
                {cell(t, 'title')}
                {cell(t, 'artist')}
              </div>
              <span className="track-time">{mmss(t.duration_s)}</span>
              <div className="track-actions">
                <button
                  type="button"
                  className="cell-btn"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${t.title}`}
                  title="Subir"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <path
                      d="M6 15l6-6 6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="square"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cell-btn"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`Bajar ${t.title}`}
                  title="Bajar"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <path
                      d="M6 9l6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="square"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cell-btn danger"
                  onClick={() => void remove(t)}
                  aria-label={`Quitar ${t.title}`}
                  title="Quitar"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                    <path
                      d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="square"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { playCardHover, playCardPick, playCardsIn } from './fx-sound'
import { PowerIcon } from './icons'
import { RARITY_LABEL, type PowerUp, type Rarity } from './powerups'
import { DraftSeal, EmblemPlate } from './seals'

const PICK_DELAY = 300 // ms entre el destello de la carta elegida y onPick
const HOVER_GAP = 80 // ms minimos entre sonidos de hover
const TILT = 6 // grados maximos de inclinacion hacia el puntero

// Cartas de mejora: se elige 1 de 3 con clic, toque o las teclas 1-3.
// Retrato con marco biselado; la rareza sube el material del marco y el foil
// tornasol (rara y epica) sigue al puntero con --mx/--my.
export default function Draft({
  cards,
  picks,
  onPick,
}: {
  cards: PowerUp[]
  picks: string[]
  onPick: (id: string) => void
}) {
  // un instante sin responder: el ultimo clic de la partida no elige una carta sin querer
  const [armed, setArmed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const pickedRef = useRef(false)
  const lastHover = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 450)
    return () => clearTimeout(t)
  }, [])

  // sonido de reparto una vez al montar (las cartas no cambian mientras se elige)
  const rarities = cards.map((c) => c.rarity).join()
  useEffect(() => {
    playCardsIn(rarities.split(',') as Rarity[])
  }, [rarities])

  const pick = useCallback(
    (c: PowerUp) => {
      if (!armed || pickedRef.current) return
      pickedRef.current = true
      setPicked(c.id)
      playCardPick(c.rarity)
    },
    [armed],
  )

  useEffect(() => {
    if (!picked) return
    const t = setTimeout(() => onPick(picked), PICK_DELAY)
    return () => clearTimeout(t)
  }, [picked, onPick])

  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      const card = cards[Number(e.key) - 1]
      if (card) pick(card)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, cards, pick])

  const hover = (r: Rarity) => {
    const now = performance.now()
    if (now - lastHover.current < HOVER_GAP) return
    lastHover.current = now
    playCardHover(r)
  }

  // inclinacion + posicion del foil: solo variables CSS, sin re-render
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
    el.style.setProperty('--ry', `${((x - 0.5) * 2 * TILT).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - y) * 2 * TILT).toFixed(2)}deg`)
    el.style.setProperty('--glare', '1')
  }
  const onLeave = (e: PointerEvent<HTMLButtonElement>) => {
    const s = e.currentTarget.style
    for (const k of ['--mx', '--my', '--rx', '--ry', '--glare']) s.removeProperty(k)
  }

  return (
    <div className={`draft${picked ? ' is-picking' : ''}`} role="dialog" aria-label="Elige una mejora">
      <p className="eyebrow">Elige una mejora</p>
      <div className="draft-cards">
        {cards.map((c, i) => {
          const owned = picks.filter((id) => id === c.id).length
          const state = picked === c.id ? ' is-picked' : picked ? ' is-dismissed' : ''
          return (
            <button
              key={c.id}
              type="button"
              className={`draft-card is-${c.rarity}${state}`}
              style={{ '--i': i } as CSSProperties}
              onClick={() => pick(c)}
              onPointerEnter={() => hover(c.rarity)}
              onFocus={() => hover(c.rarity)}
              onPointerMove={onMove}
              onPointerLeave={onLeave}
              autoFocus={i === 0}
            >
              <span className="card-tilt">
                <span className="card-flip">
                  <span className="card-back" aria-hidden="true">
                    <span className="card-back-mark" />
                  </span>
                  <span className="card-front">
                    <span className="card-frame" aria-hidden="true" />
                    <span className="card-foil" aria-hidden="true" />
                    <span className="card-inner">
                      <span className="draft-top">
                        <span className="draft-key" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="draft-rarity">{RARITY_LABEL[c.rarity]}</span>
                      </span>
                      <span className="draft-emblem" aria-hidden="true">
                        <EmblemPlate />
                        <span className="draft-icon-slot">
                          <PowerIcon id={c.id} className="draft-icon" />
                        </span>
                      </span>
                      <span className="draft-name">
                        {c.name}
                        {owned > 0 && <span className="draft-owned"> x{owned + 1}</span>}
                      </span>
                      <span className="draft-text">{c.text}</span>
                      {c.cost && <span className="draft-cost">{c.cost}</span>}
                      <span className="card-sheen" aria-hidden="true" />
                    </span>
                    <DraftSeal rarity={c.rarity} />
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

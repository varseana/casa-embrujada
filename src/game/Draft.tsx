import { useEffect, useState } from 'react'
import { RARITY_LABEL, type PowerUp } from './powerups'
import { DraftSeal } from './seals'

// Cartas de mejora: se elige 1 de 3 con clic, toque o las teclas 1-3.
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
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 450)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      const card = cards[Number(e.key) - 1]
      if (card) onPick(card.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, cards, onPick])

  return (
    <div className="draft" role="dialog" aria-label="Elige una mejora">
      <p className="eyebrow">Elige una mejora</p>
      <div className="draft-cards">
        {cards.map((c, i) => {
          const owned = picks.filter((id) => id === c.id).length
          return (
            <button
              key={c.id}
              type="button"
              className={`draft-card bracket is-${c.rarity}`}
              onClick={() => armed && onPick(c.id)}
              autoFocus={i === 0}
            >
              <span className="draft-top">
                <span className="draft-rarity">{RARITY_LABEL[c.rarity]}</span>
                <span className="draft-key" aria-hidden="true">
                  {i + 1}
                </span>
              </span>
              <DraftSeal rarity={c.rarity} />
              <span className="draft-name">
                {c.name}
                {owned > 0 && <span className="draft-owned"> x{owned + 1}</span>}
              </span>
              <span className="draft-text">{c.text}</span>
              {c.cost && <span className="draft-cost">{c.cost}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { listCharacters, type Character } from '../lib/characters'

// Placeholder del bloque 2: confirma que la transicion llega y que los
// personajes cargan. En el bloque 3 aca va el hall con el motor de caminantes.
export default function Lobby() {
  const [items, setItems] = useState<Character[] | null>(null)

  useEffect(() => {
    listCharacters()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  return (
    <section className="lobby" aria-label="Hall de la casa">
      <div className="lobby-note">
        <p className="eyebrow">Hall principal</p>
        <p>
          {items === null
            ? 'Encendiendo las velas…'
            : `${items.length} ${items.length === 1 ? 'habitante espera' : 'habitantes esperan'} adentro.`}
        </p>
      </div>
    </section>
  )
}

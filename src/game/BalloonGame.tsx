type Props = {
  onExit: () => void
}

// Placeholder del bloque 3: confirma el flujo hall -> juego -> hall.
// En el bloque 5 aca va el juego de globos en primera persona.
export default function BalloonGame({ onExit }: Props) {
  return (
    <section className="game" aria-label="Minijuego">
      <div className="lobby-head">
        <p className="eyebrow">Minijuego</p>
        <h1>Revienta los globos</h1>
        <p className="lobby-count">Los globos todavia se estan inflando.</p>
      </div>
      <button type="button" className="skip game-exit" onClick={onExit}>
        Volver al hall
      </button>
    </section>
  )
}

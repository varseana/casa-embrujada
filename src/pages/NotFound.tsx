import { useEffect } from 'react'

export default function NotFound() {
  useEffect(() => {
    document.title = "Pasillo equivocado · VIBE's Haunted House"
  }, [])
  return (
    <main className="placeholder">
      <h1>Este pasillo no lleva a ningún lado</h1>
      <p>Algo se perdió entre las paredes. Mejor volvé a la puerta principal.</p>
      <a className="link" href="/">
        Volver a la puerta
      </a>
    </main>
  )
}

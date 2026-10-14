import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import Exterior from '../house/Exterior'
import '../house/house.css'

// El lobby (y el cliente de Supabase) va en otro chunk: la puerta pinta rapido
// y el lobby se descarga mientras corre el acercamiento.
const loadLobby = () => import('../house/Lobby')
const Lobby = lazy(loadLobby)
// El juego solo se descarga si alguien aprieta Jugar.
const BalloonGame = lazy(() => import('../game/BalloonGame'))

const ENTERED_KEY = 'embrujada-entered'

type View = 'outside' | 'lobby' | 'game'

// Flujo publico: exterior (puerta) -> lobby <-> minijuego. Quien ya entro en esta sesion
// vuelve a ver la puerta de cerca, sin el acercamiento largo.
export default function House() {
  const [view, setView] = useState<View>('outside')
  const [returning] = useState(() => sessionStorage.getItem(ENTERED_KEY) === '1')

  useEffect(() => {
    void loadLobby()
  }, [])

  const enter = useCallback(() => {
    sessionStorage.setItem(ENTERED_KEY, '1')
    setView('lobby')
  }, [])

  return (
    <main className="house">
      {view === 'outside' && <Exterior returning={returning} onEnter={enter} />}
      {view === 'lobby' && (
        <Suspense fallback={<div className="lobby" />}>
          <Lobby onPlay={() => setView('game')} />
        </Suspense>
      )}
      {view === 'game' && (
        <Suspense fallback={<div className="lobby" />}>
          <BalloonGame onExit={() => setView('lobby')} />
        </Suspense>
      )}
    </main>
  )
}

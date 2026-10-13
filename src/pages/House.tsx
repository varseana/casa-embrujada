import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import Exterior from '../house/Exterior'
import '../house/house.css'

// El lobby (y el cliente de Supabase) va en otro chunk: la puerta pinta rapido
// y el lobby se descarga mientras corre el acercamiento.
const loadLobby = () => import('../house/Lobby')
const Lobby = lazy(loadLobby)

const ENTERED_KEY = 'embrujada-entered'

// Flujo publico: exterior (puerta) -> lobby. Quien ya entro en esta sesion
// vuelve a ver la puerta de cerca, sin el acercamiento largo.
export default function House() {
  const [inside, setInside] = useState(false)
  const [returning] = useState(() => sessionStorage.getItem(ENTERED_KEY) === '1')

  useEffect(() => {
    void loadLobby()
  }, [])

  const enter = useCallback(() => {
    sessionStorage.setItem(ENTERED_KEY, '1')
    setInside(true)
  }, [])

  return (
    <main className="house">
      {inside ? (
        <Suspense fallback={<div className="lobby" />}>
          <Lobby />
        </Suspense>
      ) : (
        <Exterior returning={returning} onEnter={enter} />
      )}
    </main>
  )
}

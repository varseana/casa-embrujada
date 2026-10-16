import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes self-hosted (no dependen de Google el dia del evento):
// Fraunces (display, con los ejes SOFT/WONK para el tono embrujado) + Hanken Grotesk (UI).
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource/pirata-one'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

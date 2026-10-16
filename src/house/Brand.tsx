import logo from '../assets/vibe-logo.webp'

type Props = {
  size: 'door' | 'hall'
}

// Titulo de la casa: el logo de VIBE arriba y "Haunted House" debajo, en
// Pirata One (gotica) al ancho del logo. El alt "VIBE’s" completa el nombre
// para lectores de pantalla y buscadores: "VIBE’s Haunted House".
export default function Brand({ size }: Props) {
  return (
    <h1 className={`brand is-${size}`}>
      <img
        className="brand-logo"
        src={logo}
        alt="VIBE’s"
        width={640}
        height={357}
        decoding="async"
        fetchPriority={size === 'door' ? 'high' : 'auto'}
      />
      <span className="brand-rest">Haunted House</span>
    </h1>
  )
}

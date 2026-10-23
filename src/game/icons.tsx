// Iconos SVG de cada mejora (una por id de powerups.ts). aria-hidden: el nombre va en texto.
// Dos tonos: currentColor para la silueta y --icon-accent para un detalle.
// `cut` se talla con mascara sobre m y a; m2 y a2 van encima sin tallar.
import { useId, type ReactNode } from 'react'

const A = 'var(--icon-accent, currentColor)'

type Def = { m?: ReactNode; a?: ReactNode; cut?: ReactNode; m2?: ReactNode; a2?: ReactNode }

// circulo como subpath (para anillos con evenodd)
const o = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`

// trazo grueso redondeado
const ln = (d: string, w: number, c = 'currentColor') => (
  <path
    d={d}
    fill="none"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ stroke: c }}
  />
)

// llama en gota: centro x, base b, alto h, medio ancho w
const flame = (x: number, b: number, h: number, w: number) =>
  `M${x} ${b - h}C${x + w * 0.75} ${b - h * 0.5} ${x + w * 1.1} ${b - h * 0.2} ${x + w * 0.8} ${b - h * 0.08}C${x + w * 0.5} ${b} ${x - w * 0.5} ${b} ${x - w * 0.8} ${b - h * 0.08}C${x - w * 1.1} ${b - h * 0.2} ${x - w * 0.75} ${b - h * 0.5} ${x} ${b - h}Z`

// llama con lengua lateral, en 0..64 (base en 32,58)
const FIRE =
  'M32 4C34 14 46 20 46 36C46 48 40 56 32 58C24 56 18 48 18 38C18 30 22 26 24 21C24 28 26 32 30 32C28 24 28 13 32 4Z'

// dardo apuntando arriba, centrado en 0,0; devuelve [cuerpo, plumas]
const DART_M = 'M0 -27L4.5 -13H-4.5ZM-5 -13H5V2H-5ZM-2.2 2H2.2V14H-2.2Z'
const DART_A = 'M0 8L9 21V27L0 20L-9 27V21Z'
const dart = (t: string, k: string) => [
  <path key={k + 'm'} transform={t} d={DART_M} />,
  <path key={k + 'a'} transform={t} d={DART_A} style={{ fill: A }} />,
]

// telarana radial con hilos que cuelgan
const web = (r: number) => {
  let d = ''
  for (let k = 0; k <= 8; k++) {
    const a = (k * Math.PI) / 4
    const x = (32 + r * Math.cos(a)).toFixed(1)
    const y = (32 + r * Math.sin(a)).toFixed(1)
    if (k === 0) d += `M${x} ${y}`
    else {
      const b = ((k - 0.5) * Math.PI) / 4
      d += `Q${(32 + r * 0.72 * Math.cos(b)).toFixed(1)} ${(32 + r * 0.72 * Math.sin(b)).toFixed(1)} ${x} ${y}`
    }
  }
  return d
}
let spokes = ''
for (let k = 0; k < 8; k++) {
  const a = (k * Math.PI) / 4
  spokes += `M32 32L${(32 + 30 * Math.cos(a)).toFixed(1)} ${(32 + 30 * Math.sin(a)).toFixed(1)}`
}

const ICONS: Record<string, Def> = {
  // diana con mira
  pulso: {
    m: (
      <>
        <path d={o(32, 32, 26) + o(32, 32, 20)} />
        <path d={o(32, 32, 13.5) + o(32, 32, 8)} />
        <path d="M29 1H35V13H29ZM29 51H35V63H29ZM1 29H13V35H1ZM51 29H63V35H51Z" />
      </>
    ),
    a: <path d={o(32, 32, 4.5)} />,
  },
  // pluma de cuervo con canon
  pluma: {
    m: (
      <path
        transform="rotate(40 32 32)"
        d="M32 1C45 9 50 20 49 31L40 30L48 38C45 46 39 50 33 51H31C25 50 19 46 16 38L25 33L15 27C15 16 20 8 32 1Z"
      />
    ),
    cut: <path transform="rotate(40 32 32)" d="M31 10H33V50H31Z" />,
    a: <path transform="rotate(40 32 32)" d="M30 46H34L33 63H31Z" />,
  },
  // telarana con arana al centro
  telarana: {
    m: (
      <>
        {ln(spokes, 3.5)}
        {ln(web(14), 3.5)}
        {ln(web(25), 3.5)}
      </>
    ),
    a: (
      <>
        <path d={o(32, 35, 6.5) + o(32, 26, 4)} />
        {ln('M26 30L19 25M38 30L45 25M26 38L19 44M38 38L45 44', 3, A)}
      </>
    ),
  },
  // vela con ojo tallado
  vela: {
    m: (
      <>
        <path d="M19 28H45V61H19Z" />
        <path d="M15 25H49V30H44V37C44 40 40 40 40 37V30H24V41C24 44 20 44 20 41V30H15Z" />
        <path d="M31 19H33V25H31Z" />
      </>
    ),
    cut: <path d="M22 46Q32 36 42 46Q32 56 22 46Z" />,
    m2: <path d={o(32, 46, 3.4)} />,
    a: <path d={flame(32, 21, 19, 8)} />,
  },
  // tres llamas que crecen
  racha: {
    m: (
      <>
        <path transform="translate(-5.4 35.6) scale(.42)" d={FIRE} />
        <path transform="translate(3.9 21.7) scale(.66)" d={FIRE} />
      </>
    ),
    cut: <path d={flame(48, 55, 18, 5)} />,
    a: <path transform="translate(16 2)" d={FIRE} />,
  },
  // globo de pared gruesa
  latex: {
    m: (
      <>
        <path d="M32 3C46 3 55 14 55 26C55 40 43 50 32 50C21 50 9 40 9 26C9 14 18 3 32 3Z" />
      </>
    ),
    cut: (
      <>
        {ln('M32 9C43 9 49 17 49 26C49 37 40 44 32 44C24 44 15 37 15 26C15 17 21 9 32 9Z', 2.5, '#000')}
        <path d="M20 25C20 18 24 14 29 13C25 17 24 20 24 26Z" />
      </>
    ),
    a: (
      <>
        <path d="M27 55L32 49L37 55Z" />
        {ln('M32 55C27 58 37 59 32 63', 3.5, A)}
      </>
    ),
  },
  // ojo cerrado, pestanas quietas
  calma: {
    m: <path d="M3 22C16 47 48 47 61 22C48 35 16 35 3 22Z" />,
    a: ln('M14 37L9 48M23 41L21 53M32 42V55M41 41L43 53M50 37L55 48', 5, A),
    m2: ln('M12 13C22 7 42 7 52 13', 5),
  },
  // moneda del barquero con calavera
  barquero: {
    m: <path d={o(32, 32, 30) + o(32, 32, 25)} />,
    a: (
      <>
        <path d="M32 11C42 11 48 18 48 27C48 33 45 36 42 37V42H22V37C19 36 16 33 16 27C16 18 22 11 32 11Z" />
        <path d="M23 45H41V52H23Z" />
      </>
    ),
    cut: (
      <>
        <path d={o(25, 27, 4.5) + o(39, 27, 4.5)} />
        <path d="M32 32L35 37H29ZM27.5 45H29.5V52H27.5ZM34.5 45H36.5V52H34.5Z" />
      </>
    ),
  },
  // calavera que suelta el ultimo aliento
  aliento: {
    m: <path d="M23 22C34 22 41 29 41 38C41 44 38 47 35 48V56H11V48C8 47 5 44 5 38C5 29 12 22 23 22Z" />,
    cut: (
      <>
        <path d={o(16, 38, 4.5) + o(30, 38, 4.5)} />
        <path d="M23 43L25.5 47H20.5ZM17.5 50H19.5V56H17.5ZM26.5 50H28.5V56H26.5Z" />
      </>
    ),
    a: ln('M40 52C52 53 60 45 58 34C56 23 44 24 46 32C47 37 53 36 52 31M36 16C38 10 44 9 46 4', 5, A),
  },
  // escudo con cera que chorrea
  escudo: {
    m: (
      <path d="M7 5H57V28C57 44 47 54 32 62C17 54 7 44 7 28ZM13 11V28C13 40 21 48 32 55C43 48 51 40 51 28V11Z" />
    ),
    a: (
      <path d="M17 15H47V26C47 29.5 42.5 29.5 42.5 26V23C42.5 21 39.5 21 39.5 23V36C39.5 40 34 40 34 36V23C34 21 30 21 30 23V30C30 33.5 25.5 33.5 25.5 30V23C25.5 21 22.5 21 22.5 23V32C22.5 35.5 17 35.5 17 32Z" />
    ),
  },
  // yunque con llama
  hierro: {
    m: <path d="M3 30H59V39H46V45C46 49 50 52 55 53V61H13V53C18 52 22 49 22 45V42C13 42 7 37 3 30Z" />,
    a: <path d={flame(36, 27, 26, 10)} />,
  },
  // iman de herradura atrayendo un hueso
  iman: {
    m: (
      <>
        <path d="M7 42V28A25 25 0 0 1 57 28V42H44V28A12 12 0 0 0 20 28V42Z" />
        <path
          d={'M26 47H38V51H26Z' + o(25.5, 46.5, 3) + o(25.5, 51.5, 3) + o(38.5, 46.5, 3) + o(38.5, 51.5, 3)}
        />
      </>
    ),
    a: <path d="M7 45H20V57H7ZM44 45H57V57H44Z" />,
  },
  // carcaj con tres dardos
  carcaj: {
    m: (
      <>
        <path d="M19 27H45V54C45 59 40 62 32 62C24 62 19 59 19 54Z" />
        <path d="M23.5 27L24.5 12H27.5L28 27ZM30.5 27V8H33.5V27ZM36 27L36.5 12H39.5L40.5 27Z" />
      </>
    ),
    cut: <path d="M19 32H45V35H19ZM19 50H45V53H19Z" />,
    a: <path d="M26 3L31 10V17L26 13L21 17V10ZM32 0L37 6V13L32 9L27 13V6ZM38 3L43 10V17L38 13L33 17V10Z" />,
  },
  // guadana
  cosecha: {
    m: (
      <>
        {ln('M15 62C22 46 34 26 43 6', 6)}
        <path d="M22 44L33 49L31.5 53L20.5 48Z" />
      </>
    ),
    a: <path d="M45 4C28 -3 7 6 1 30C12 17 27 12 42 19Z" />,
  },
  // reloj de arena
  reloj: {
    m: (
      <>
        <path d="M10 3H54V10H10ZM10 54H54V61H10Z" />
        {ln('M17 10C17 22 27 27 29 32C27 37 17 42 17 54H47C47 42 37 37 35 32C37 27 47 22 47 10Z', 4.5)}
      </>
    ),
    a: (
      <path d="M24 18H40C38 23 34 26 32 28C30 26 26 23 24 18ZM31 28H33V42H31ZM22 51C24 45 29 41 32 40C35 41 40 45 42 51Z" />
    ),
  },
  // puerta entreabierta con luz
  puerta: {
    m: (
      <>
        <path d="M9 3H55V62H49V9H15V62H9Z" />
        <path d="M15 9L36 15V56L15 62Z" />
      </>
    ),
    cut: <path d={o(31, 37, 2.6)} />,
    a: <path d="M40 9H49V62H40Z" />,
  },
  // dardo que atraviesa dos globos
  perforante: {
    m: (
      <>
        <path d={o(23.5, 40.5, 10.5) + 'M19 54L23.5 50.5L28 54Z'} />
        <path d={o(40.5, 23.5, 10.5) + 'M36 37L40.5 33.5L45 37Z'} />
      </>
    ),
    cut: ln('M2 62L62 2', 9, '#000'),
    m2: <path transform="rotate(45 32 32)" d="M32 -1L37 13H27ZM30 13H34V52H30Z" />,
    a2: <path transform="rotate(45 32 32)" style={{ fill: A }} d="M32 47L40 57V64L32 58L24 64V57Z" />,
  },
  // onda expansiva
  onda: {
    m: (
      <g fill="none" style={{ stroke: 'currentColor' }}>
        <circle
          cx="32"
          cy="32"
          r="17"
          strokeWidth="5"
          strokeDasharray="20.7 6"
          transform="rotate(-22 32 32)"
        />
        <circle
          cx="32"
          cy="32"
          r="27.5"
          strokeWidth="5"
          strokeDasharray="15.6 6"
          transform="rotate(-10 32 32)"
        />
      </g>
    ),
    a: <path d={o(32, 32, 8)} />,
  },
  // dos dardos
  doble: {
    m: [dart('translate(24 26) rotate(45)', 'a')[0], dart('translate(40 40) rotate(45)', 'b')[0]],
    a: [dart('translate(24 26) rotate(45)', 'a')[1], dart('translate(40 40) rotate(45)', 'b')[1]],
  },
  // luna llena con mira
  luna: {
    m: <path d={o(32, 32, 21)} />,
    cut: <path d={o(25, 27, 5) + o(39, 38, 4) + o(37, 21, 2.6) + o(25, 41, 2.6)} />,
    a: <path d="M29.5 1H34.5V8H29.5ZM29.5 56H34.5V63H29.5ZM1 29.5H8V34.5H1ZM56 29.5H63V34.5H56Z" />,
  },
  // vela apagada que humea y vela encendida
  segunda: {
    m: (
      <>
        <path d="M6 40H26V61H6ZM36 28H58V61H36Z" />
        <path d="M15 35H17V40H15ZM46 22H48V28H46Z" />
        {ln('M16 30C11 25 21 21 16 14C12 9 19 6 17 2', 3.5)}
      </>
    ),
    a: <path d={flame(47, 24, 20, 8)} />,
  },
  // abanico de tres dardos
  multi: {
    m: [-30, 0, 30].map((r) => dart(`translate(32 59) rotate(${r}) translate(0 -27)`, 'm' + r)[0]),
    a: [-30, 0, 30].map((r) => dart(`translate(32 59) rotate(${r}) translate(0 -27)`, 'm' + r)[1]),
  },
  // cadena de almas
  cadena: {
    m: (
      <g transform="rotate(-45 32 32)">
        {ln('M9 25H21A7 7 0 0 1 21 39H9A7 7 0 0 1 9 25ZM43 25H55A7 7 0 0 1 55 39H43A7 7 0 0 1 43 25Z', 5)}
      </g>
    ),
    a: <path transform="rotate(-45 32 32)" d="M18 29H46V35H18Z" />,
  },
  // craneo de cabra con gota de sangre
  pacto: {
    m: (
      <>
        <path d="M19 19C19 14 25 12 32 12C39 12 45 14 45 19L47 29C47 33 43 35 41 36L38 47C38 50 35 52 32 52C29 52 26 50 26 47L23 36C21 35 17 33 17 29Z" />
        <path d="M23 17C13 17 5 12 2 2C9 9 16 8 26 12ZM41 17C51 17 59 12 62 2C55 9 48 8 38 12Z" />
      </>
    ),
    cut: <path d="M21 24L30 28L27 32L21 28ZM43 24L34 28L37 32L43 28ZM29 42H31V47H29ZM33 42H35V47H33Z" />,
    a: (
      <path d="M32 53C34.5 56.5 36.5 58 36.5 60C36.5 62.5 34.5 63.5 32 63.5C29.5 63.5 27.5 62.5 27.5 60C27.5 58 29.5 56.5 32 53Z" />
    ),
  },
}

export function PowerIcon({ id, className }: { id: string; className?: string }) {
  // el id de la mejora va en el id de la mascara: si dos raices repiten useId, la mascara es la misma
  const mid = 'pi-' + id + useId().replace(/[^a-zA-Z0-9]/g, '')
  const d = ICONS[id]
  if (!d) return null
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      {d.cut && (
        <mask id={mid} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <g fill="#000">{d.cut}</g>
        </mask>
      )}
      <g mask={d.cut ? `url(#${mid})` : undefined} fillRule="evenodd">
        <g fill="currentColor">{d.m}</g>
        <g style={{ fill: A }}>{d.a}</g>
      </g>
      <g fill="currentColor">{d.m2}</g>
      <g style={{ fill: A }}>{d.a2}</g>
    </svg>
  )
}

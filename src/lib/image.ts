// Procesamiento de los PNG recortados del lado del cliente.
//
// Cada colaborador es un PNG con fondo transparente (la persona disfrazada,
// cuerpo completo). Al subir:
//   1. Validamos que de verdad tenga transparencia (un JPEG o un PNG opaco
//      caminaria como un rectangulo).
//   2. Recortamos los margenes transparentes: asi los pies quedan SIEMPRE en el
//      borde inferior y el personaje no flota sobre el piso, sin depender de
//      que el recorte manual haya quedado justo.
//   3. Generamos dos variantes que conservan el alfa (WebP, o PNG si el
//      navegador no codifica WebP):
//        - THUMB (~480px de alto): el sprite que camina por el lobby.
//        - HD (~1400px): la que se muestra grande al hacer hover.

export const THUMB_MAX = 480
export const HD_MAX = 1400
export const MAX_INPUT_BYTES = 25 * 1024 * 1024

const ACCEPTED = ['image/png', 'image/webp']
const ALPHA_CUTOFF = 12 // alfa por debajo de esto cuenta como fondo
const ANALYSIS_MAX = 512 // resolucion a la que se analiza el alfa

export class ImageRejected extends Error {}

type Box = { x: number; y: number; w: number; h: number }

// Busca la caja que contiene todos los pixeles visibles. Devuelve null si la
// imagen es opaca (no tiene fondo transparente que recortar).
function opaqueBounds(bitmap: ImageBitmap): Box | null {
  const scale = Math.min(1, ANALYSIS_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No 2D context para analizar')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  let minX = w, minY = h, maxX = -1, maxY = -1, clear = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < ALPHA_CUTOFF) {
        clear++
        continue
      }
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  // Menos de 3% transparente = no es un recorte real.
  if (clear / (w * h) < 0.03 || maxX < 0) return null

  // De vuelta a coordenadas originales, con 1px de aire para no comer bordes.
  const inv = 1 / scale
  const x = Math.max(0, Math.floor((minX - 1) * inv))
  const y = Math.max(0, Math.floor((minY - 1) * inv))
  const x2 = Math.min(bitmap.width, Math.ceil((maxX + 2) * inv))
  const y2 = Math.min(bitmap.height, Math.ceil((maxY + 2) * inv))
  return { x, y, w: x2 - x, h: y2 - y }
}

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Safari viejo ignora webp en toBlob y devuelve PNG: lo aceptamos igual.
  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const png = await toBlob('image/png')
  if (!png) throw new Error('toBlob fallo')
  return png
}

// Recorta a `box`, reescala manteniendo aspecto (nunca agranda) y codifica con alfa.
async function makeVariant(bitmap: ImageBitmap, box: Box, maxSize: number, quality: number) {
  const scale = Math.min(1, maxSize / Math.max(box.w, box.h))
  const w = Math.max(1, Math.round(box.w * scale))
  const h = Math.max(1, Math.round(box.h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context para comprimir')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, w, h)
  return encode(canvas, quality)
}

// Valida + recorta + genera thumb y hd con un unico decode.
// Lanza ImageRejected con un mensaje legible si el archivo no sirve.
export async function makeVariants(file: File): Promise<{ thumb: Blob; hd: Blob }> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageRejected(`${file.name}: tiene que ser PNG o WebP con fondo transparente.`)
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageRejected(`${file.name}: pesa mas de 25 MB.`)
  }
  const bitmap = await createImageBitmap(file)
  try {
    const box = opaqueBounds(bitmap)
    if (!box) {
      throw new ImageRejected(`${file.name}: no tiene fondo transparente. Recortá a la persona primero.`)
    }
    const [thumb, hd] = await Promise.all([
      makeVariant(bitmap, box, THUMB_MAX, 0.8),
      makeVariant(bitmap, box, HD_MAX, 0.86),
    ])
    return { thumb, hd }
  } finally {
    bitmap.close?.()
  }
}

export function extensionFor(blob: Blob): string {
  return blob.type === 'image/webp' ? 'webp' : 'png'
}

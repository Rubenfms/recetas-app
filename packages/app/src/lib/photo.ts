/**
 * Foto de receta: de lo que devuelve el selector a un Blob pequeño y bien
 * orientado, listo para IndexedDB.
 *
 * Una foto del iPhone son 3-4 MB y 4000 px de lado; guardada tal cual, diez
 * recetas serían 40 MB en el almacenamiento del navegador y en cada copia de
 * seguridad. A 1200 px y WebP salen ~100-200 KB, que a tamaño de pantalla no
 * se distinguen.
 */

const MAX_SIDE = 1200;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // `imageOrientation: 'from-image'` aplica la rotación EXIF, que es lo que
  // hace que las fotos del móvil no salgan tumbadas.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari antiguo o formato raro: se cae al <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = url;
    });
    return img;
  } finally {
    // El <img> ya tiene los datos; la URL puede irse.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function processPhoto(file: File): Promise<Blob> {
  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error('La imagen está vacía.');

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no deja dibujar la imagen.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  // WebP si el navegador sabe codificarlo; si no, JPEG. Safari devuelve un
  // PNG enorme cuando no conoce el tipo pedido, así que se comprueba el tipo
  // del resultado y no solo que exista.
  const webp = await toBlob(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
  if (jpeg) return jpeg;
  throw new Error('No se pudo codificar la imagen.');
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from 'canvas'

const source = new URL('../assets/brand/logo-source.png', import.meta.url)
const outputs = [
  { file: new URL('../client/assets/brand-logo.png', import.meta.url), size: 128, maxBytes: 40 * 1024 },
  { file: new URL('../client/assets/favicon.png', import.meta.url), size: 32, maxBytes: 4 * 1024 },
]

const check = process.argv.includes('--check')
const image = check ? null : await loadImage(fileURLToPath(source))
for (const { file, size, maxBytes } of outputs) {
  if (image) {
    const canvas = createCanvas(size, size)
    const context = canvas.getContext('2d')
    context.patternQuality = 'best'
    context.drawImage(image, 0, 0, size, size)
    await mkdir(dirname(fileURLToPath(file)), { recursive: true })
    await writeFile(file, canvas.toBuffer('image/png', { compressionLevel: 9 }))
  }
  const bytes = await readFile(file)
  const decoded = await loadImage(bytes)
  if (decoded.width !== size || decoded.height !== size || bytes.length > maxBytes) {
    throw new Error(`Invalid brand asset: ${file.pathname}`)
  }
  console.log(`${file.pathname}: ${size}x${size}, ${bytes.length} bytes`)
}

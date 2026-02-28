import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const BGA_IMAGE_DIR = process.env.BGA_IMAGE_DIR || '../bga-agricola/img'
const bgaImagePath = path.resolve(__dirname, BGA_IMAGE_DIR)

const serveBgaImages = (imageDir: string) => ({
  name: 'serve-bga-images',
  configureServer(server: any) {
    server.middlewares.use('/bga-img', (req: any, res: any, next: any) => {
      const filePath = path.join(imageDir, req.url || '')
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.createReadStream(filePath).pipe(res)
        return
      }
      next()
    })
  },
})

export default defineConfig({
  plugins: [react(), serveBgaImages(bgaImagePath)],
  server: {
    fs: {
      allow: ['..'],
    },
  },
  define: {
    'import.meta.env.VITE_BGA_IMAGE_DIR': JSON.stringify('/bga-img'),
  },
})

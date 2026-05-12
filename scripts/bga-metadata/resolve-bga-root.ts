import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')

export function resolveBgaRoot(): string {
  if (process.env.BGA_AGRICOLA_PATH) return process.env.BGA_AGRICOLA_PATH
  const candidates = [
    path.resolve(REPO_ROOT, '../bga-agricola'),
    path.resolve(REPO_ROOT, '../../bga-agricola'),
    path.resolve(REPO_ROOT, '../../../bga-agricola'),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('BGA repo not found; set BGA_AGRICOLA_PATH')
}

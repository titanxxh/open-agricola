#!/usr/bin/env tsx
/**
 * CI guard: main bundle size budget.
 *
 * PR-1: print-only.
 * PR-4: enforces main chunk < 300KB.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type ChunkInfo = { name: string; size: number; path: string }

export function findMainChunk(assetsDir: string): ChunkInfo | null {
  if (!fs.existsSync(assetsDir)) return null
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  let main: ChunkInfo | null = null
  for (const f of jsFiles) {
    const full = path.join(assetsDir, f)
    const size = fs.statSync(full).size
    if (!main || size > main.size) main = { name: f, size, path: full }
  }
  return main
}

export function listAllChunks(assetsDir: string): ChunkInfo[] {
  if (!fs.existsSync(assetsDir)) return []
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  return jsFiles
    .map((f) => {
      const full = path.join(assetsDir, f)
      return { name: f, size: fs.statSync(full).size, path: full }
    })
    .sort((a, b) => b.size - a.size)
}

if (process.argv[1] && process.argv[1].endsWith('check-bundle-size.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const assetsDir = path.join(repoRoot, 'dist', 'assets')
  const strict = process.argv.includes('--strict')
  if (!fs.existsSync(assetsDir)) {
    console.warn(`[check-bundle-size] no dist/assets/ — run "pnpm run build" first`)
    process.exit(0)
  }
  const chunks = listAllChunks(assetsDir)
  const main = chunks[0]
  console.log('[check-bundle-size] chunks:')
  for (const c of chunks.slice(0, 10)) {
    console.log(`  ${formatBytes(c.size).padStart(8)}  ${c.name}`)
  }
  if (!main) {
    console.warn('[check-bundle-size] no JS chunks found')
    process.exit(0)
  }
  console.log(`[check-bundle-size] main chunk: ${main.name} = ${formatBytes(main.size)}`)
  const LIMIT_STRICT = 300 * 1024
  if (strict && main.size > LIMIT_STRICT) {
    console.error(`[check-bundle-size] main chunk exceeds strict limit (${formatBytes(LIMIT_STRICT)})`)
    process.exit(1)
  }
  process.exit(0)
}

#!/usr/bin/env tsx
/**
 * CI guard: main bundle size budget.
 *
 * PR-1: print-only.
 * PR-4: strict by default — fails CI when the main chunk exceeds the budget.
 *
 * Budgets (chosen with ~15% buffer over the Task-4 measurement of
 * 483KB raw / 147KB gzip and 89KB workshop):
 *
 *   - Main raw     ≤ 550 KB  (MAIN_RAW_LIMIT_KB)
 *   - Main gzip    ≤ 170 KB  (MAIN_GZIP_LIMIT_KB)
 *   - Workshop raw ≤ 400 KB  (WORKSHOP_RAW_LIMIT_KB)
 *
 * S6 baseline (2026-05-08): main bundle measured at 529 KB raw / 161 KB gz
 * after physical layering + cards-display split + sandbox lazy boundary.
 * Limits are KEPT at 550/170 (raw/gz) — main bundle was never bloated by
 * impl leak (S6b confirmed via cards-display split + ESLint enforcement).
 * The remaining ~529 KB is React + UI + i18n + transports; further shrinking
 * would require route-level code splitting OR i18n lazy-load (out of S6 scope).
 * The S6 ESLint error-level rules (cards-display + contract + main-client +
 * impl-no-cards-display + utils) are the future-proof boundary against bloat.
 *
 * Flags:
 *   --loose   disable strict mode (prints sizes, always exits 0)
 *   --strict  explicit strict mode (default behaviour)
 *
 * Environment overrides (KB):
 *   MAIN_RAW_LIMIT_KB, MAIN_GZIP_LIMIT_KB, WORKSHOP_RAW_LIMIT_KB
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type ChunkInfo = { name: string; size: number; gzipSize: number; path: string }

function measure(full: string, name: string): ChunkInfo {
  const buf = fs.readFileSync(full)
  const gz = zlib.gzipSync(buf)
  return { name, size: buf.length, gzipSize: gz.length, path: full }
}

export function findMainChunk(assetsDir: string): ChunkInfo | null {
  if (!fs.existsSync(assetsDir)) return null
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js') && f.startsWith('index-'))
  let main: ChunkInfo | null = null
  for (const f of jsFiles) {
    const c = measure(path.join(assetsDir, f), f)
    if (!main || c.size > main.size) main = c
  }
  // Fallback: if no index- prefix, pick largest js chunk (legacy behaviour).
  if (!main) {
    const all = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
    for (const f of all) {
      const c = measure(path.join(assetsDir, f), f)
      if (!main || c.size > main.size) main = c
    }
  }
  return main
}

export function findWorkshopChunk(assetsDir: string): ChunkInfo | null {
  if (!fs.existsSync(assetsDir)) return null
  const jsFiles = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js') && f.startsWith('WorkshopPage-'))
  if (jsFiles.length === 0) return null
  // If multiple (unlikely), pick largest.
  let ws: ChunkInfo | null = null
  for (const f of jsFiles) {
    const c = measure(path.join(assetsDir, f), f)
    if (!ws || c.size > ws.size) ws = c
  }
  return ws
}

export function listAllChunks(assetsDir: string): ChunkInfo[] {
  if (!fs.existsSync(assetsDir)) return []
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  return jsFiles
    .map((f) => measure(path.join(assetsDir, f), f))
    .sort((a, b) => b.size - a.size)
}

function limitKb(envName: string, fallbackKb: number): number {
  const raw = process.env[envName]
  if (!raw) return fallbackKb * 1024
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackKb * 1024
  return Math.floor(parsed * 1024)
}

if (process.argv[1] && process.argv[1].endsWith('check-bundle-size.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const assetsDir = path.join(repoRoot, 'dist', 'assets')
  const loose = process.argv.includes('--loose')
  const strict = !loose // strict by default; --loose disables enforcement
  if (!fs.existsSync(assetsDir)) {
    console.warn(`[check-bundle-size] no dist/assets/ — run "pnpm run build" first`)
    process.exit(0)
  }
  const chunks = listAllChunks(assetsDir)
  console.log('[check-bundle-size] chunks:')
  for (const c of chunks.slice(0, 10)) {
    console.log(
      `  ${formatBytes(c.size).padStart(10)} raw | ${formatBytes(c.gzipSize).padStart(9)} gz   ${c.name}`,
    )
  }
  const main = findMainChunk(assetsDir)
  const workshop = findWorkshopChunk(assetsDir)
  if (!main) {
    console.warn('[check-bundle-size] no JS chunks found')
    process.exit(0)
  }

  const MAIN_RAW = limitKb('MAIN_RAW_LIMIT_KB', 550)
  const MAIN_GZIP = limitKb('MAIN_GZIP_LIMIT_KB', 170)
  const WORKSHOP_RAW = limitKb('WORKSHOP_RAW_LIMIT_KB', 400)

  console.log(
    `[check-bundle-size] main:     ${main.name} = ${formatBytes(main.size)} raw / ${formatBytes(main.gzipSize)} gz (limit ${formatBytes(MAIN_RAW)} raw / ${formatBytes(MAIN_GZIP)} gz)`,
  )
  if (workshop) {
    console.log(
      `[check-bundle-size] workshop: ${workshop.name} = ${formatBytes(workshop.size)} raw / ${formatBytes(workshop.gzipSize)} gz (limit ${formatBytes(WORKSHOP_RAW)} raw)`,
    )
  }

  const failures: string[] = []
  if (main.size > MAIN_RAW) {
    failures.push(
      `main bundle ${formatBytes(main.size)} exceeds limit ${formatBytes(MAIN_RAW)} (raw)`,
    )
  }
  if (main.gzipSize > MAIN_GZIP) {
    failures.push(
      `main bundle ${formatBytes(main.gzipSize)} exceeds limit ${formatBytes(MAIN_GZIP)} (gzip)`,
    )
  }
  if (workshop && workshop.size > WORKSHOP_RAW) {
    failures.push(
      `workshop chunk ${formatBytes(workshop.size)} exceeds limit ${formatBytes(WORKSHOP_RAW)} (raw)`,
    )
  }

  if (failures.length > 0) {
    for (const msg of failures) console.error(`[check:bundle-size] ${msg}`)
    if (strict) {
      console.error('[check-bundle-size] failing — pass --loose to downgrade to a warning')
      process.exit(1)
    }
    console.warn('[check-bundle-size] --loose set, ignoring failures')
  } else {
    console.log('[check-bundle-size] OK — all budgets satisfied')
  }
  process.exit(0)
}

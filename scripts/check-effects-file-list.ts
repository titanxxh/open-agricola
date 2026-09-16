import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const ALLOWED_EFFECT_FILES = [
  'bake-bread.ts',
  'bonus-vp.ts',
  'breed.ts',
  'collect.ts',
  'construct.ts',
  'exchange.ts',
  'family-growth.ts',
  'fencing.ts',
  'first-player.ts',
  'gain.ts',
  'improvement.ts',
  'occupation.ts',
  'pay.ts',
  'place-farmer.ts',
  'plow.ts',
  'reap.ts',
  'receive.ts',
  'renovation.ts',
  'reorganize.ts',
  'sow.ts',
  'special-effect.ts',
  'stables.ts',
] as const

export type EffectsFileListCheck = {
  actualFiles: string[]
  extraFiles: string[]
  missingFiles: string[]
  ok: boolean
}

const sorted = (values: readonly string[]): string[] =>
  [...values].sort((a, b) => a.localeCompare(b))

export const checkEffectsFileList = (effectsDir: string): EffectsFileListCheck => {
  if (!fs.statSync(effectsDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`missing effects directory: ${effectsDir}`)
  }
  const entries = fs.readdirSync(effectsDir, { withFileTypes: true })
  const symlink = entries.find((entry) => entry.isSymbolicLink())
  if (symlink) throw new Error(`effects symlink requires explicit ownership: ${path.join(effectsDir, symlink.name)}`)
  const actualFiles = sorted(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
  const allowedFiles = sorted(ALLOWED_EFFECT_FILES)
  const actualSet = new Set(actualFiles)
  const allowedSet = new Set(allowedFiles)
  const missingFiles = allowedFiles.filter((file) => !actualSet.has(file))
  const extraFiles = actualFiles.filter((file) => !allowedSet.has(file))

  return {
    actualFiles,
    extraFiles,
    missingFiles,
    ok: missingFiles.length === 0 && extraFiles.length === 0,
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-effects-file-list.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const effectsDir = path.join(repoRoot, 'shared/actions/effects')
  const result = checkEffectsFileList(effectsDir)

  if (result.ok) {
    console.log(`[check-effects-file-list] top-level production effects match allow-list (${result.actualFiles.length} files)`)
    process.exit(0)
  }

  console.error('[check-effects-file-list] top-level shared/actions/effects files do not match the allow-list')
  console.error(`  scanned: ${path.relative(repoRoot, effectsDir)}`)
  if (result.missingFiles.length > 0) {
    console.error(`  missing allowed files: ${result.missingFiles.join(', ')}`)
  }
  if (result.extraFiles.length > 0) {
    console.error(`  extra top-level files (any extension): ${result.extraFiles.join(', ')}`)
  }
  console.error('  __tests__/ and internal/ are ignored; only top-level production effect modules are fixed.')
  process.exit(1)
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegisterAll } from './generate-register-all'

export const GENERATED_CARD_FILES = [
  'shared/cards/register-all.ts',
  'shared/cards/catalog.generated.ts',
  'shared/cards/major/generated.ts',
] as const

export type GeneratedCardsSyncCheck = {
  ok: boolean
  staleFiles: string[]
}

export function checkGeneratedCardsSync(repoRoot = process.cwd()): GeneratedCardsSyncCheck {
  const generated = buildRegisterAll({ repoRoot })
  const expected = new Map<string, string>([
    ['shared/cards/register-all.ts', generated.registerAll],
    ['shared/cards/catalog.generated.ts', generated.catalogGenerated],
    ['shared/cards/major/generated.ts', generated.majorGenerated],
  ])
  const staleFiles = GENERATED_CARD_FILES.filter((file) => {
    const filePath = path.join(repoRoot, file)
    return !fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== expected.get(file)
  })

  return {
    ok: staleFiles.length === 0,
    staleFiles,
  }
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url)
if (isCli) {
  const result = checkGeneratedCardsSync()

  if (result.ok) {
    console.log(`[check-generated-cards-sync] ok — ${GENERATED_CARD_FILES.length} generated card files are in sync`)
    process.exit(0)
  }

  console.error('[check-generated-cards-sync] generated card files are stale')
  for (const file of result.staleFiles) {
    console.error(`  - ${file}`)
  }
  console.error('Run: pnpm run generate:register-all')
  process.exit(1)
}

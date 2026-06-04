import { describe, it } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('register-all.ts is in sync with generator', () => {
  it('running generate:register-all produces no diff', () => {
    const generatedFiles = [
      'shared/cards/register-all.ts',
      'shared/cards/catalog.generated.ts',
      'shared/cards/major/generated.ts',
    ]
    const before = new Map(
      generatedFiles.map((file) => [file, readFileSync(file, 'utf8')]),
    )
    execSync('pnpm run generate:register-all', { stdio: 'pipe' })
    for (const file of generatedFiles) {
      if (readFileSync(file, 'utf8') !== before.get(file)) {
        throw new Error(
          `${file} is out of sync with generator. Run: pnpm run generate:register-all`,
        )
      }
    }
  }, 30_000)
})

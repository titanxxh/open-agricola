import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildRegisterAll } from '../generate-register-all'
import { checkGeneratedCardsSync } from '../check-generated-cards-sync'

const writeSource = (filePath: string, source: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, source, 'utf8')
}

describe('checkGeneratedCardsSync', () => {
  it('reports stale generated Card Source catalog artifacts without rewriting them', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-cards-sync-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    const majorRoot = path.join(cardsRoot, 'major')

    writeSource(
      path.join(cardsRoot, 'A', 'A1_Source.ts'),
      `import { defineMinorCard } from '../card-source'\n` +
      `export const A1_Source = defineMinorCard({\n` +
      `  meta: { id: 'A1_Source', name: 'Source', deck: 'A', number: 1, desc: [], cost: {} },\n` +
      `})\n`,
    )
    writeSource(
      path.join(majorRoot, 'well.ts'),
      `import { defineMajorCard } from '../card-source'\n` +
      `export const Well = defineMajorCard({\n` +
      `  meta: { id: 'Well', name: 'Well', deck: 'major', number: 1, desc: [], cost: {}, vp: 0, extraVp: false },\n` +
      `})\n`,
    )

    const generated = buildRegisterAll({ repoRoot: tmp })
    writeSource(path.join(cardsRoot, 'register-all.ts'), `${generated.registerAll}// stale\n`)
    writeSource(path.join(cardsRoot, 'catalog.generated.ts'), generated.catalogGenerated)
    writeSource(path.join(majorRoot, 'generated.ts'), generated.majorGenerated)
    writeSource(path.join(majorRoot, 'runtime.generated.ts'), generated.majorRuntimeGenerated)

    const result = checkGeneratedCardsSync(tmp)

    expect(result.ok).toBe(false)
    expect(result.staleFiles).toEqual(['shared/cards/register-all.ts'])
    expect(fs.readFileSync(path.join(cardsRoot, 'register-all.ts'), 'utf8')).toContain('// stale')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_EFFECT_FILES, checkEffectsFileList } from '../check-effects-file-list'

const writeFixture = (root: string, rel: string): void => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, 'export {}\n')
}

describe('check-effects-file-list', () => {
  it('passes when top-level production effect files match the allow-list', () => {
    const effectsDir = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
    writeFixture(effectsDir, '__tests__/apply-old.test.ts')
    writeFixture(effectsDir, 'internal/apply-old.ts')

    expect(checkEffectsFileList(effectsDir)).toEqual({
      actualFiles: ALLOWED_EFFECT_FILES,
      extraFiles: [],
      missingFiles: [],
      ok: true,
    })
  })

  it('fails when an extra top-level production effect file exists', () => {
    const effectsDir = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
    writeFixture(effectsDir, 'apply-old.ts')

    expect(checkEffectsFileList(effectsDir)).toEqual({
      actualFiles: [...ALLOWED_EFFECT_FILES, 'apply-old.ts'].sort(),
      extraFiles: ['apply-old.ts'],
      missingFiles: [],
      ok: false,
    })
  })

  it('fails when an allowed top-level production effect file is missing', () => {
    const effectsDir = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    for (const file of ALLOWED_EFFECT_FILES) {
      if (file !== 'pay.ts') writeFixture(effectsDir, file)
    }

    expect(checkEffectsFileList(effectsDir)).toEqual({
      actualFiles: ALLOWED_EFFECT_FILES.filter((file) => file !== 'pay.ts'),
      extraFiles: [],
      missingFiles: ['pay.ts'],
      ok: false,
    })
  })
})

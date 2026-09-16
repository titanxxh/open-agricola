import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
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
  it.each([
    'unexpected.mjs',
    'unexpected.js',
    'unexpected.mts',
    'unexpected.cjs',
    'unexpected.tsx',
    'unexpected.json',
    'notes.md',
  ])('fails when %s appears at the top level regardless of extension', (file) => {
    const effectsDir = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    for (const allowed of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, allowed)
    writeFixture(effectsDir, file)

    expect(checkEffectsFileList(effectsDir)).toEqual({
      actualFiles: [...ALLOWED_EFFECT_FILES, file].sort((a, b) => a.localeCompare(b)),
      extraFiles: [file],
      missingFiles: [],
      ok: false,
    })
  })

  it('fails instead of passing when the effects directory is missing', () => {
    const effectsDir = path.join(mkdtempSync(path.join(tmpdir(), 'effects-file-list-')), 'effects')

    expect(() => checkEffectsFileList(effectsDir)).toThrow('missing effects directory')
  })

  it('fails when the effects directory itself is a symlink', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    const target = path.join(base, 'target')
    mkdirSync(target)
    for (const allowed of ALLOWED_EFFECT_FILES) writeFixture(target, allowed)
    const effectsDir = path.join(base, 'effects')
    symlinkSync(target, effectsDir)

    expect(() => checkEffectsFileList(effectsDir)).toThrow('effects directory symlink requires explicit ownership')
  })

  it('fails on top-level symlinks instead of skipping them', () => {
    const effectsDir = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
    for (const allowed of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, allowed)
    symlinkSync(path.join(effectsDir, 'pay.ts'), path.join(effectsDir, 'linked.ts'))

    expect(() => checkEffectsFileList(effectsDir)).toThrow('symlink')
  })

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

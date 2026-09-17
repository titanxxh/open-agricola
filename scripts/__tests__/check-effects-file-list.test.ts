import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ALLOWED_EFFECT_FILES, checkEffectsFileList } from '../check-effects-file-list'

const writeFixture = (root: string, rel: string): void => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, 'export {}\n')
}

const fixtureRoots: string[] = []
afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const createEffectsFixture = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'effects-file-list-'))
  fixtureRoots.push(root)
  return root
}

describe('check-effects-file-list', () => {
  it('fails when the required directory is missing or empty', () => {
    const effectsDir = createEffectsFixture()
    expect(checkEffectsFileList(effectsDir).ok).toBe(false)
    rmSync(effectsDir, { recursive: true })
    expect(() => checkEffectsFileList(effectsDir)).toThrow()
  })

  it('rejects malformed allowed source', () => {
    const effectsDir = createEffectsFixture()
    for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
    writeFileSync(path.join(effectsDir, 'pay.ts'), 'export function bad( {')
    expect(() => checkEffectsFileList(effectsDir)).toThrow('pay.ts')
  })

  it.each(['file', 'directory', 'root'])('rejects top-level source %s symlinks', (kind) => {
    const effectsDir = createEffectsFixture()
    for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
    if (kind === 'root') {
      symlinkSync(effectsDir, path.join(effectsDir, 'linked-root'))
      expect(() => checkEffectsFileList(path.join(effectsDir, 'linked-root'))).toThrow('source symlink')
    } else {
      symlinkSync(kind === 'file' ? path.join(effectsDir, 'pay.ts') : effectsDir, path.join(effectsDir, 'linked'))
      expect(() => checkEffectsFileList(effectsDir)).toThrow('source symlink')
    }
  })

  it('passes when top-level production effect files match the allow-list', () => {
    const effectsDir = createEffectsFixture()
    for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
    writeFixture(effectsDir, '__tests__/apply-old.test.ts')
    writeFixture(effectsDir, 'internal/apply-old.ts')
    writeFixture(effectsDir, 'internal/extra.mjs')
    writeFixture(effectsDir, '__tests__/extra.test.js')
    writeFileSync(path.join(effectsDir, 'README.md'), 'Not a source module')

    expect(checkEffectsFileList(effectsDir)).toEqual({
      actualFiles: ALLOWED_EFFECT_FILES,
      extraFiles: [],
      missingFiles: [],
      ok: true,
    })
  })

  it.each(['ts', 'tsx', 'mts', 'mtsx', 'cts', 'ctsx', 'js', 'jsx', 'mjs', 'mjsx', 'cjs', 'cjsx'])(
    'fails when an extra top-level .%s effect file exists', (extension) => {
      const effectsDir = createEffectsFixture()
      for (const file of ALLOWED_EFFECT_FILES) writeFixture(effectsDir, file)
      writeFixture(effectsDir, `apply-old.${extension}`)

      expect(checkEffectsFileList(effectsDir)).toEqual({
        actualFiles: [...ALLOWED_EFFECT_FILES, `apply-old.${extension}`].sort(),
        extraFiles: [`apply-old.${extension}`],
        missingFiles: [],
        ok: false,
      })
    },
  )

  it('fails when an allowed top-level production effect file is missing', () => {
    const effectsDir = createEffectsFixture()
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

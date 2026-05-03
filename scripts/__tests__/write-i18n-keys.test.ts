import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeI18nKeys } from '../i18n/write-i18n-keys'

function withTempFile(initial: string, fn: (p: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-test-'))
  const p = path.join(dir, 'zh.ts')
  fs.writeFileSync(p, initial)
  try {
    fn(p)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('writeI18nKeys', () => {
  it('inserts a key at the same nested level', () => {
    const initial = "export const zh = {\n  ui: {\n    foo: 'x',\n  },\n}\n"
    withTempFile(initial, (p) => {
      writeI18nKeys(p, 'zh', new Map([['ui.bar', 'y']]))
      const updated = fs.readFileSync(p, 'utf8')
      expect(updated).toContain("foo: 'x'")
      expect(updated).toContain("bar: 'y'")
    })
  })

  it('creates a new nested object when the prefix does not exist', () => {
    const initial = "export const zh = {\n  ui: {\n    foo: 'x',\n  },\n}\n"
    withTempFile(initial, (p) => {
      writeI18nKeys(p, 'zh', new Map([['actions.bake.name', 'Bake']]))
      const updated = fs.readFileSync(p, 'utf8')
      expect(updated).toMatch(/actions:\s*{[^}]*bake:\s*{[^}]*name:\s*'Bake'/s)
    })
  })

  it('does not modify existing keys', () => {
    const initial = "export const zh = {\n  ui: {\n    foo: 'x',\n  },\n}\n"
    withTempFile(initial, (p) => {
      writeI18nKeys(p, 'zh', new Map([['ui.bar', 'y']]))
      const updated = fs.readFileSync(p, 'utf8')
      expect(updated).toContain("foo: 'x'") // existing untouched
    })
  })

  it('escapes single quotes in values', () => {
    const initial = "export const zh = {\n}\n"
    withTempFile(initial, (p) => {
      writeI18nKeys(p, 'zh', new Map([['ui.x', "it's"]]))
      const updated = fs.readFileSync(p, 'utf8')
      expect(updated).toMatch(/x:\s*'it\\'s'/)
    })
  })
})

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findMainChunk, formatBytes } from '../check-bundle-size'

describe('check-bundle-size', () => {
  it('finds the largest JS chunk as main', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-'))
    const assetsDir = path.join(tmp, 'assets')
    fs.mkdirSync(assetsDir)
    fs.writeFileSync(path.join(assetsDir, 'index-abc.js'), 'a'.repeat(1000))
    fs.writeFileSync(path.join(assetsDir, 'chunk-xyz.js'), 'b'.repeat(500))
    fs.writeFileSync(path.join(assetsDir, 'style.css'), 'c'.repeat(100))

    const main = findMainChunk(assetsDir)
    expect(main).toMatchObject({ name: 'index-abc.js', size: 1000 })

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('formats bytes to human-readable', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(1500000)).toBe('1.4 MB')
  })
})

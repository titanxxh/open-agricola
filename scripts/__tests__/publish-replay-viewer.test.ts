import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishReplayViewer } from '../publish-replay-viewer.ts'
import { loadReplayViewerBuild } from '../../server/game/replay-viewer-build.ts'

const roots: string[] = []

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

const createStaging = (root: string): string => {
  const staging = join(root, 'staging')
  mkdirSync(staging, { recursive: true })
  writeFileSync(join(staging, 'index.html'), '<main>Replay</main>')
  writeFileSync(join(staging, 'cards-manifest.json'), '[]')
  return staging
}

describe('publishReplayViewer', () => {
  it('publishes a verified immutable directory without leaving temporary siblings', () => {
    const root = mkdtempSync(join(tmpdir(), 'open-agricola-viewer-'))
    roots.push(root)
    const target = join(root, 'published')
    const first = publishReplayViewer(target, createStaging(root))

    expect(loadReplayViewerBuild(target, first.buildId)).not.toBeNull()
    expect(readdirSync(target)).toEqual([first.buildId])

    const second = publishReplayViewer(target, createStaging(root))
    expect(second.buildId).toBe(first.buildId)
    expect(readdirSync(target)).toEqual([first.buildId])
  })
})

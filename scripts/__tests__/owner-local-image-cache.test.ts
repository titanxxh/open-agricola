import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeImages, prepareImages, repositoryDigest, type ImageCacheContext } from '../ci/owner-local-image-cache'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const temp = () => { const root = mkdtempSync(join(tmpdir(), 'oa-image-cache-')); roots.push(root); return root }
const digest = (char: string) => `sha256:${char.repeat(64)}`
const PINNED = `postgres:18-bookworm@${digest('a')}`, TAGGED = 'grafana/grafana:13.2.3'

/**
 * A fake candidate daemon: `resolves` is what `image inspect` reports per image, `saves` the digest each saved
 * archive's index names, `fails` the phases that exit 1.
 */
function daemon(directory: string, { resolves = {} as Record<string, string>, saves = {} as Record<string, string>, fails = [] as string[] } = {}) {
  const calls: string[] = [], outputs = new Map<string, string>()
  const context: ImageCacheContext = { directory, attempts: 3, retry: async () => { calls.push('retry') },
    async docker(phase, args, io) {
      calls.push(`${phase} ${args.join(' ')}${io?.stdin ? ` <${io.stdin}` : ''}`)
      if (fails.includes(phase)) return 1
      const image = args.at(-1)!
      if (args[0] === 'image') outputs.set(phase, `["${image.replace(/[:@].*$/, '')}@${resolves[image]}"]\n`)
      if (args[0] === 'save') {
        const layout = temp()
        writeFileSync(join(layout, 'index.json'), JSON.stringify({ manifests: [{ digest: saves[image] ?? resolves[image] }] }))
        execFileSync('tar', ['-cf', io!.stdout!, '-C', layout, 'index.json'])
      }
      return 0
    },
    output: phase => outputs.get(phase) ?? '' }
  return { context, calls, phases: () => calls.filter(call => call !== 'retry').map(call => call.split(' ')[0]) }
}

describe('owner-local image cache', () => {
  it('pulls and saves on a cold cache, then loads, names and checks every image on the next run', async () => {
    const directory = join(temp(), 'images'), resolves = { [PINNED]: digest('a'), [TAGGED]: digest('b') }
    const cold = daemon(directory, { resolves })
    expect(await prepareImages([PINNED, TAGGED], cold.context)).toEqual([
      { image: PINNED, digest: digest('a'), source: 'registry' }, { image: TAGGED, digest: digest('b'), source: 'registry' }])
    expect(cold.phases()).toEqual(['image-1', 'image-1-digest', 'image-1-save', 'image-2', 'image-2-digest', 'image-2-save'])
    expect(readdirSync(directory).sort()).toEqual([`grafana+grafana@${'b'.repeat(64)}.tar`, `postgres@${'a'.repeat(64)}.tar`, 'tags.json'])
    // Only tag references need the recorded digest; a pinned reference names its own.
    expect(JSON.parse(readFileSync(join(directory, 'tags.json'), 'utf8'))).toEqual({ [TAGGED]: digest('b') })
    const warm = daemon(directory, { resolves })
    expect(await prepareImages([PINNED, TAGGED], warm.context)).toEqual([
      { image: PINNED, digest: digest('a'), source: 'cache' }, { image: TAGGED, digest: digest('b'), source: 'cache' }])
    expect(warm.calls).toEqual([
      `image-1-load load --quiet <${join(directory, `postgres@${'a'.repeat(64)}.tar`)}`, `image-1-tag tag ${digest('a')} postgres:18-bookworm`,
      `image-1-check image inspect --format {{json .RepoDigests}} ${PINNED}`,
      `image-2-load load --quiet <${join(directory, `grafana+grafana@${'b'.repeat(64)}.tar`)}`, `image-2-tag tag ${digest('b')} grafana/grafana:13.2.3`,
      `image-2-check image inspect --format {{json .RepoDigests}} ${TAGGED}`])
  })

  it('falls back to the retried registry pull when a cached archive fails to load, name or match its digest', async () => {
    const directory = join(temp(), 'images')
    await prepareImages([PINNED, TAGGED], daemon(directory, { resolves: { [PINNED]: digest('a'), [TAGGED]: digest('b') } }).context)
    const loadFails = daemon(directory, { resolves: { [PINNED]: digest('a') }, fails: ['image-1-load', 'image-1'] })
    expect(await prepareImages([PINNED], loadFails.context)).toEqual([{ image: PINNED, digest: digest('a'), source: 'registry' }])
    expect(loadFails.calls.filter(call => !call.startsWith('image-1-save')).map(call => call.split(' ')[0])).toEqual(['image-1-load', 'image-1', 'retry', 'image-1-a1', 'image-1-digest'])
    const unnamed = daemon(directory, { resolves: { [PINNED]: digest('a') }, fails: ['image-1-tag'] })
    expect((await prepareImages([PINNED], unnamed.context))[0].source).toBe('registry')
    // A tag that now resolves elsewhere is pulled again and its new digest recorded.
    const moved = daemon(directory, { resolves: { [TAGGED]: digest('c') } })
    expect(await prepareImages([TAGGED], moved.context)).toEqual([{ image: TAGGED, digest: digest('c'), source: 'registry' }])
    expect(moved.phases()).toEqual(['image-1-load', 'image-1-tag', 'image-1-check', 'image-1', 'image-1-digest', 'image-1-save'])
    expect(JSON.parse(readFileSync(join(directory, 'tags.json'), 'utf8'))).toEqual({ [TAGGED]: digest('c') })
  })

  it('never caches an archive that names another digest, a failed save, or a digest it cannot attribute', async () => {
    const directory = join(temp(), 'images')
    await prepareImages([PINNED], daemon(directory, { resolves: { [PINNED]: digest('a') }, saves: { [PINNED]: digest('f') } }).context)
    await prepareImages([TAGGED], daemon(directory, { resolves: { [TAGGED]: digest('b') }, fails: ['image-1-save'] }).context)
    const pinnedOnly = `postgres@${digest('a')}`
    await prepareImages([pinnedOnly], daemon(directory, { resolves: { [pinnedOnly]: digest('a') } }).context)
    expect(existsSync(directory) && readdirSync(directory)).toEqual([])
    const mismatched = daemon(directory, { resolves: { [PINNED]: digest('e') } })
    expect(await prepareImages([PINNED], mismatched.context)).toEqual([{ image: PINNED, digest: digest('e'), source: 'registry' }])
    expect(readdirSync(directory)).toEqual([])
  })

  it('gives up after the network attempts', async () => {
    const down = daemon(join(temp(), 'images'), { fails: ['image-1', 'image-1-a1', 'image-1-a2'] })
    await expect(prepareImages([TAGGED], down.context)).rejects.toThrow(`Candidate image-1 failed: docker pull ${TAGGED}`)
    expect(down.calls.filter(call => call === 'retry')).toHaveLength(2)
  })

  it('reads the pinned service images and the repository digest Docker reports', () => {
    expect(composeImages(`services:\n  postgres:\n    image: ${PINNED}\n  objects:\n    image: "rustfs/rustfs:1.0.1@${digest('d')}"\n  dev:\n    image: busybox:1.37\n  again:\n    image: ${PINNED}\n`))
      .toEqual([PINNED, `rustfs/rustfs:1.0.1@${digest('d')}`])
    expect(repositoryDigest(PINNED, `["docker.io/library/postgres@${digest('a')}"]`)).toBe(digest('a'))
    expect(repositoryDigest(TAGGED, `["grafana/grafana@${digest('b')}","other/grafana@${digest('c')}"]`)).toBe(digest('b'))
    expect(repositoryDigest(TAGGED, `["grafana/grafana@${digest('b')}","grafana/grafana@${digest('c')}"]`)).toBeNull()
    expect(repositoryDigest(TAGGED, 'Error: No such image')).toBeNull()
  })
})

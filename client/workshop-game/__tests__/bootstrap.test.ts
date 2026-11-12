// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startWorkshopGame, workshopGameUrl } from '../bootstrap'

const query = '?page=game&player=p1&embedded=1&devMode=1'
const localQuery = '?page=game&embedded=1&devMode=1&localSandbox=1'
const origin = 'https://formal.titanxxh.com'
const devParent = `${origin}/?page=workshop&player=p1&devMode=1`

function embed(childQuery = query, parentUrl = `${origin}/?page=workshop`, base = '/') {
  vi.stubEnv('BASE_URL', base)
  const parent = { location: new URL(parentUrl) }
  const child = { parent, top: parent, location: new URL(`${origin}${base}workshop-game.html${childQuery}`) }
  vi.stubGlobal('window', child)
  return child
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.replaceChildren()
})

async function expectInert() {
  const start = vi.fn().mockResolvedValue(undefined)
  await startWorkshopGame(document.body, start)
  expect(start).not.toHaveBeenCalled()
  const link = document.body.querySelector('a')
  expect(link?.textContent).toBe('Open Agricola')
  expect(link?.href).toBe(`${origin}/`)
  expect(link?.target).toBe('_blank')
  expect(link?.rel).toBe('noopener noreferrer')
}

describe('Workshop game entry', () => {
  it.each([query, localQuery, `${localQuery}&freshSandbox=1`])('starts the bounded sandbox %s', async childQuery => {
    embed(childQuery)
    const start = vi.fn().mockResolvedValue(undefined)
    await startWorkshopGame(document.body, start)
    expect(start).toHaveBeenCalledOnce()
  })

  it.each(['/', '/open-agricola/'])('preserves the %s application base', async base => {
    const child = embed(query, `${origin}${base}index.html?page=workshop&view=sandbox`, base)
    const start = vi.fn().mockResolvedValue(undefined)
    await startWorkshopGame(document.body, start)
    expect(start).toHaveBeenCalledOnce()
    vi.stubGlobal('window', child.parent)
    expect(workshopGameUrl(false, false)).toBe(`${base}workshop-game.html${query}`)
    expect(workshopGameUrl(true, true)).toBe(`${base}workshop-game.html${localQuery}&freshSandbox=1`)
  })

  it.each([
    { dev: true, shortcut: '', childQuery: `${query}&localSandbox=1` },
    { dev: false, shortcut: '1', childQuery: `${query}&localSandbox=1` },
    { dev: false, shortcut: '', childQuery: localQuery },
  ])('matches local sandbox identity to parent and build $dev/$shortcut', async ({ dev, shortcut, childQuery }) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('VITE_ENABLE_DEV_AUTH_SHORTCUTS', shortcut)
    const child = embed(childQuery, devParent)
    const start = vi.fn().mockResolvedValue(undefined)
    await startWorkshopGame(document.body, start)
    expect(start).toHaveBeenCalledOnce()
    vi.stubGlobal('window', child.parent)
    expect(workshopGameUrl(true, false)).toBe(`/workshop-game.html${childQuery}`)
  })

  it.each([
    [`${query}&localSandbox=1`, `${origin}/?page=workshop`],
    [`${query}&localSandbox=1`, `${origin}/?page=workshop&player=p1`],
    [localQuery, devParent],
    [`${localQuery}&player=p2`, devParent],
  ])('rejects local sandbox identity changes from %s under %s', async (childQuery, parent) => {
    vi.stubEnv('DEV', true)
    embed(childQuery, parent)
    await expectInert()
  })

  it('rejects top-level access', async () => {
    const child = embed()
    const top = { location: child.location }
    vi.stubGlobal('window', Object.assign(top, { parent: top, top }))
    await expectInert()
  })

  it('rejects a nested Workshop parent', async () => {
    const child = embed()
    vi.stubGlobal('window', { ...child, top: {} })
    await expectInert()
  })

  it.each([
    'https://pre.titanxxh.com/?page=workshop',
    `${origin}/?page=login`,
    `${origin}/?page=workshop&page=workshop`,
    `${origin}/workshop-game.html?page=workshop`,
    `${origin}/untrusted/?page=workshop`,
  ])('rejects an unexpected parent %s', async parent => {
    embed(query, parent)
    await expectInert()
  })

  it('rejects an unreadable parent', async () => {
    const child = embed()
    const parent = { get location() { throw new Error('Blocked cross-origin access') } }
    vi.stubGlobal('window', { ...child, parent, top: parent })
    await expectInert()
  })

  it.each([
    '', '?page=login', query.replace('player=p1', 'player=p2'),
    query.replace('embedded=1', 'embedded=0'), `${query}&room=room-id`,
    `${query}&transport=ws`, `${query}&context=secret`, `${query}&account=1`,
    `${query}&page=game`, `${query}&localSandbox=0`, `${query}&freshSandbox=1`,
    `${query}&localSandbox=1&freshSandbox=0`, `${query}#code=secret`,
  ])('rejects an unexpected child route %s', async childQuery => {
    embed(childQuery)
    await expectInert()
  })

  it('rejects the main application pathname even with a sandbox query', async () => {
    const child = embed()
    vi.stubGlobal('window', { ...child, location: new URL(`${origin}/${query}`) })
    await expectInert()
  })
})

import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { createOpeningSession, createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import type { GameState } from '../shared/contract/types'
import { serializeState } from '../shared/session/serialization'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

declare global {
  interface Window {
    encyclopediaSent: Array<{ type: string }>
    encyclopediaCopied: string[]
    encyclopediaStatusChanges: number
  }
}

type Layout = { name: string; viewport: { width: number; height: number }; phone: boolean }
const DESKTOP: Layout = { name: 'desktop 1440x1000', viewport: { width: 1440, height: 1000 }, phone: false }
const PHONE: Layout = { name: 'mobile 390x844', viewport: { width: 390, height: 844 }, phone: true }
const READ_COMMANDS = ['getCommandScope', 'joinRoom', 'getState', 'getHistory', 'getGameEndProposal']

test.describe.configure({ mode: 'serial' })

const workState = (configure?: (state: GameState) => void) => {
  const fixture = createWorkSession({ seed: 42, configure })
  try { return fixture.withCtx(() => serializeState(fixture.state, {})) }
  finally { fixture.dispose() }
}
const setupState = (phase: 'draft' | 'parent-selection') => {
  const session = createOpeningSession({
    seed: 42,
    options: phase === 'draft' ? { draftMode: 'simultaneous', draftPoolSize: 7 } : { enableParentCards: true },
    expected: { phase, roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  try { return session.withCtx(() => serializeState(session.state, {})) }
  finally { session.dispose() }
}

// Registered before the room fixture so its WebSocket subclass inherits the recording send.
const observeClient = (page: Page) => page.addInitScript(() => {
  window.encyclopediaSent = []
  window.encyclopediaCopied = []
  const send = WebSocket.prototype.send
  WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket['send']>[0]) {
    if (typeof data === 'string') window.encyclopediaSent.push(JSON.parse(data) as { type: string })
    send.call(this, data)
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => { window.encyclopediaCopied.push(text) } },
  })
})
const resetSent = (page: Page) => page.evaluate(() => { window.encyclopediaSent = [] })
const gameWrites = (page: Page) => page.evaluate(read => window.encyclopediaSent
  .filter(message => !read.includes(message.type)), READ_COMMANDS)
const scrollOffset = (page: Page) => page.evaluate(() => window.scrollY)
const sameRequestSnapshot = (page: Page) => page.evaluate(() => new Promise<void>((resolve, reject) => {
  const requestId = crypto.randomUUID()
  const timer = setTimeout(() => reject(new Error('getState timed out')), 5000)
  const receive = (event: MessageEvent) => {
    const message = JSON.parse(event.data as string) as { type: string; requestId?: string }
    if (message.type !== 'stateUpdate' || message.requestId !== requestId) return
    clearTimeout(timer)
    window.lifecycleSocket.removeEventListener('message', receive)
    resolve()
  }
  window.lifecycleSocket.addEventListener('message', receive)
  window.lifecycleSocket.send(JSON.stringify({ type: 'getState', requestId }))
}))
const settleFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
}))

const entry = (page: Page) => page.locator('.header-compact').getByRole('button', { name: 'Look up cards' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Card Encyclopedia' })
const searchBox = (page: Page) => panel(page).getByRole('searchbox', { name: 'Search cards' })
const pageStatus = (page: Page, pageNumber: number) => panel(page).getByText(new RegExp(`^Page ${pageNumber} of \\d+$`))
const attention = (page: Page) => panel(page).locator('.encyclopedia-in-game__status')
const ownFarm = (page: Page, playerId: string) => page.locator(`[data-interaction-focus="farm"][data-focus-player="${playerId}"]`)

async function expectEntryUnobscured(page: Page) {
  await expect(entry(page)).toBeVisible()
  expect(await entry(page).evaluate(button => {
    const box = button.getBoundingClientRect()
    const inViewport = box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth
    return inViewport && button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })).toBe(true)
}

/** The work-phase header scrolls with the page, so the player brings the entry into view first. */
async function openEncyclopedia(page: Page) {
  await entry(page).scrollIntoViewIfNeeded()
  const offset = await scrollOffset(page)
  await entry(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByRole('heading', { name: /^Results: \d+$/ })).toBeVisible()
  expect(await scrollOffset(page)).toBe(offset)
  return offset
}

async function expectPanelLayout(page: Page, layout: Layout) {
  const box = (await panel(page).boundingBox())!
  if (layout.phone) {
    expect(box).toEqual({ x: 0, y: 0, ...layout.viewport })
  } else {
    expect(box.x).toBeGreaterThan(0)
    expect(box.y).toBeGreaterThan(0)
    expect(box.x + box.width).toBeLessThan(layout.viewport.width)
    expect(box.y + box.height).toBeLessThan(layout.viewport.height)
    await expect(panel(page).locator('.encyclopedia-filters--sidebar')).toBeVisible()
  }
}

/** The browse state outlives the panel, so the page to expect depends on earlier visits. */
async function turnPage(page: Page) {
  const status = panel(page).locator('.encyclopedia-pagination__status')
  const current = Number(/^Page (\d+) of/.exec((await status.textContent()) ?? '')?.[1])
  await panel(page).getByRole('button', { name: 'Next page' }).click()
  await expect(status).toHaveText(new RegExp(`^Page ${current + 1} of \\d+$`))
}

async function closeEncyclopedia(page: Page) {
  await panel(page).getByRole('button', { name: 'Close encyclopedia' }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(entry(page)).toBeFocused()
}

async function inRoom(
  { browser, request }: { browser: Browser; request: APIRequestContext },
  layouts: [Layout, Layout],
  run: (pages: [Page, Page], driver: ReturnType<typeof roomDriver>) => Promise<void>,
) {
  const open = (layout: Layout) => browser.newPage({
    viewport: layout.viewport, ...(layout.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const pages: [Page, Page] = [await open(layouts[0]), await open(layouts[1])]
  const driver = roomDriver(pages)
  let joined = false
  try {
    for (const page of pages) await observeClient(page)
    await joinRoomClients(pages, request)
    joined = true
    await run(pages, driver)
  } finally {
    try {
      if (joined) await driver.command(0, { type: 'loadGame', state: workState() })
    } finally { await Promise.all(pages.map(page => page.close())) }
  }
}

for (const layout of [DESKTOP, PHONE]) {
  test.describe(`in-game encyclopedia ${layout.name}`, () => {
    test('U1 offers an unobscured entry in the draft, parent selection and work phases and returns to the same place', async ({ browser, request }, testInfo) => {
      test.setTimeout(90_000)
      await inRoom({ browser, request }, [layout, layout], async ([page], driver) => {
        for (const phase of ['draft', 'parent-selection', 'work'] as const) {
          await driver.command(0, { type: 'loadGame', state: phase === 'work' ? workState() : setupState(phase) })
          await expect(page.locator(phase === 'draft' ? '.draft-overlay' : phase === 'parent-selection' ? '.parent-selection-overlay' : '.game-layout')).toBeVisible()
          if (phase === 'work') {
            await entry(page).evaluate(button => window.scrollTo({ top: window.scrollY + button.getBoundingClientRect().top - 20, behavior: 'instant' }))
          }
          await expectEntryUnobscured(page)
          const offset = await scrollOffset(page)
          if (phase === 'work') expect(offset).toBeGreaterThan(0)
          await resetSent(page)

          await openEncyclopedia(page)
          await expectPanelLayout(page, layout)
          await page.mouse.move(4, 4)
          await page.mouse.wheel(0, 800)
          const body = (await panel(page).locator('.encyclopedia-in-game__body').boundingBox())!
          await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2)
          await page.mouse.wheel(0, 2400)
          await turnPage(page)
          await settleFrames(page)
          expect(await scrollOffset(page)).toBe(offset)
          if (phase === 'work') await page.screenshot({ path: testInfo.outputPath(layout.phone ? 'u1-phone-full-screen.png' : 'u1-desktop-panel.png') })

          await closeEncyclopedia(page)
          expect(await scrollOffset(page)).toBe(offset)
          expect(await gameWrites(page)).toEqual([])
        }
      })
    })

    if (!layout.phone) defineRoomScenarios()
  })
}

function defineRoomScenarios() {
  test('G1 keeps unconfirmed draft picks, the query and the page while the other player submits a real simultaneous draft', async ({ browser, request }, testInfo) => {
    await inRoom({ browser, request }, [DESKTOP, DESKTOP], async ([page, peer], driver) => {
      await driver.command(0, { type: 'loadGame', state: setupState('draft') })
      await expect(page.locator('.draft-overlay')).toBeVisible()
      await page.locator('.draft-pool-row-occ .draft-card').first().click()
      await page.locator('.draft-pool-row-minor .draft-card').first().click()
      const selected = page.locator('.draft-card.selected')
      await expect(selected).toHaveCount(2)
      const pickedIds = () => selected.evaluateAll(cards => cards.map(card => card.querySelector('[data-id]')?.getAttribute('data-id') ?? null))
      const picks = await pickedIds()
      expect(picks).not.toContain(null)
      await resetSent(page)

      await openEncyclopedia(page)
      await searchBox(page).fill('wood')
      await panel(page).getByRole('button', { name: 'Next page' }).click()
      await expect(pageStatus(page, 2)).toBeVisible()
      const pool = (await roomSnapshot(peer)).state.draft!.pools.p2!
      await driver.command(1, { type: 'draftSubmit', playerId: 'p2', pick: { occCardId: pool.occ[0], minorCardId: pool.minor[0] } })

      expect((await roomSnapshot(page)).state.draft!.round).toBe(1)
      await expect(panel(page)).toBeVisible()
      await expect(searchBox(page)).toHaveValue('wood')
      await expect(pageStatus(page, 2)).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('g1-desktop-panel.png') })
      await page.keyboard.press('Escape')
      await expect(panel(page)).toHaveCount(0)
      await expect(entry(page)).toBeFocused()
      await expect(selected).toHaveCount(2)
      expect(await pickedIds()).toEqual(picks)
      expect(await gameWrites(page)).toEqual([])
    })
  })

  test('G2 keeps a farm draft across the panel, its detail, sharing and paging, and across a same-request snapshot', async ({ browser, request }) => {
    await inRoom({ browser, request }, [DESKTOP, DESKTOP], async ([page], driver) => {
      await driver.command(0, { type: 'loadGame', state: workState(state => {
        state.currentPlayerIndex = 0
        Object.assign(state.players[0]!.resources, { wood: 10, reed: 4 })
      }) })
      await driver.command(0, { type: 'action', spaceId: 'farm-expansion' })
      const offer = (await roomSnapshot(page)).interaction
      if (offer.stateId !== 'wait' || offer.request.kind !== 'choice') throw new Error('Expected the farm expansion choice')
      const rooms = offer.request.options.find(option => option.value.startsWith('seq-construct'))
      if (!rooms) throw new Error('Expected the room option')
      await driver.command(0, { type: 'choice', value: rooms.value })
      const farm = ownFarm(page, 'p1')
      await expect(farm).toHaveAttribute('data-interaction-focused', 'true')
      const tiles = [farm.locator('[data-farm-tile-key="0-0"]'), farm.locator('[data-farm-tile-key="1-1"]')]
      for (const tile of tiles) await tile.click()
      for (const tile of tiles) await expect(tile).toHaveClass(/\bselected\b/)
      await resetSent(page)

      const offset = await openEncyclopedia(page)
      await panel(page).getByRole('button', { name: /^View / }).first().click()
      const detail = panel(page).locator('dialog.encyclopedia-detail')
      await expect(detail).toBeVisible()
      await detail.getByRole('button', { name: 'Copy card link' }).click()
      await expect.poll(() => page.evaluate(() => window.encyclopediaCopied.length)).toBe(1)
      const shared = new URL(await page.evaluate(() => window.encyclopediaCopied[0]!))
      expect([...shared.searchParams.keys()].sort()).toEqual(['entry', 'page'])
      await detail.getByRole('button', { name: 'Close details' }).click()
      await expect(detail).toHaveCount(0)
      await expect(panel(page)).toBeVisible()
      await panel(page).getByRole('button', { name: 'Next page' }).click()
      await expect(pageStatus(page, 2)).toBeVisible()
      await page.mouse.click(4, 4)
      await expect(panel(page)).toHaveCount(0)
      await expect(entry(page)).toBeFocused()
      for (const tile of tiles) await expect(tile).toHaveClass(/\bselected\b/)
      await expect(farm).toHaveAttribute('data-interaction-focused', 'true')
      expect(await scrollOffset(page)).toBe(offset)

      const version = (await page.evaluate(() => window.lifecycleUpdate!.version))
      await openEncyclopedia(page)
      await sameRequestSnapshot(page)
      expect(await page.evaluate(() => window.lifecycleUpdate!.version)).toBe(version)
      await expect(pageStatus(page, 2)).toBeVisible()
      await closeEncyclopedia(page)
      for (const tile of tiles) await expect(tile).toHaveClass(/\bselected\b/)
      expect(await scrollOffset(page)).toBe(offset)
      expect(await gameWrites(page)).toEqual([])
      expect((await roomSnapshot(page)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
    })
  })

  test('G3 reminds the waiting player of a new window without closing or taking focus, then focuses it on return', async ({ browser, request }, testInfo) => {
    await inRoom({ browser, request }, [DESKTOP, DESKTOP], async ([initiator, page], driver) => {
      await driver.command(0, { type: 'loadGame', state: workState(state => {
        state.roundActionOrder = state.roundActionOrder.map(() => null)
        state.roundActionOrder[0] = 'grain-utilization'
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = ['C151_SowingDirector']
        for (const player of state.players) {
          player.fields = [{ row: 0, col: 2, stacks: [] }]
          player.resources.grain = 1
        }
      }) })
      await driver.command(1, { type: 'action', spaceId: 'grain-utilization' })
      await expect(ownFarm(page, 'p2')).toHaveAttribute('data-interaction-focused', 'true')
      await driver.command(1, { type: 'commitSelection', playerIndex: 1, payload: { crops: [{ row: 0, col: 2, crop: 'grain' }] } })
      await driver.command(1, { type: 'choice', value: 'confirm' })
      expect((await roomSnapshot(initiator)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
      expect((await roomSnapshot(page)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'private-prompt' } })
      const actions = page.locator('[data-interaction-focus="actions"]')
      await expect(actions).not.toHaveAttribute('data-interaction-focused')
      await resetSent(page)

      const offset = await openEncyclopedia(page)
      await searchBox(page).fill('wood')
      await panel(page).getByRole('button', { name: 'Next page' }).click()
      await expect(pageStatus(page, 2)).toBeVisible()
      await searchBox(page).focus()
      await expect(attention(page)).toBeEmpty()

      await driver.command(0, { type: 'choice', value: '__skip__' })
      await settleFrames(page)
      await expect(attention(page)).toBeEmpty()
      await driver.command(0, { type: 'choice', value: 'confirm' })
      expect((await roomSnapshot(page)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'confirm-next-player' } })

      await expect(attention(page)).toHaveText('Your action is needed')
      await expect(attention(page)).toHaveAttribute('role', 'status')
      const back = panel(page).getByRole('button', { name: 'Back to game' })
      await expect(back).toBeVisible()
      await expect(searchBox(page)).toBeFocused()
      await expect(searchBox(page)).toHaveValue('wood')
      await expect(pageStatus(page, 2)).toBeVisible()
      await expect(actions).not.toHaveAttribute('data-interaction-focused')
      expect(await scrollOffset(page)).toBe(offset)

      await attention(page).evaluate(status => {
        window.encyclopediaStatusChanges = 0
        new MutationObserver(records => { window.encyclopediaStatusChanges += records.length })
          .observe(status, { childList: true, subtree: true, characterData: true })
      })
      await sameRequestSnapshot(page)
      await settleFrames(page)
      expect(await page.evaluate(() => window.encyclopediaStatusChanges)).toBe(0)
      await expect(attention(page)).toHaveText('Your action is needed')
      await page.screenshot({ path: testInfo.outputPath('g3-attention.png') })

      await back.click()
      await expect(panel(page)).toHaveCount(0)
      await expect(entry(page)).toBeFocused()
      await expect(actions).toHaveAttribute('data-interaction-focused', 'true', { timeout: 3000 })
      await settleFrames(page)
      expect(await gameWrites(page)).toEqual([])
      expect((await roomSnapshot(page)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'confirm-next-player' } })
    })
  })
}

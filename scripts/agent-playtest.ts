import { chromium, type Browser, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type ObsPayload = Record<string, unknown>

class PageObserver {
  private _latest: ObsPayload | null = null
  private _updates = 0

  attach(page: Page): void {
    page.on('websocket', (ws) => {
      ws.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(payload) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.type === 'stateUpdate') {
          this._latest = msg.payload as ObsPayload
          this._updates++
        }
      })
    })
  }

  async waitForInitial(timeoutMs = 15000): Promise<void> {
    let waited = 0
    while (waited < timeoutMs) {
      if (this._latest) return
      await new Promise((r) => setTimeout(r, 200))
      waited += 200
    }
    throw new Error('observer connect timeout')
  }

  async waitForNextUpdateAfter(action: () => Promise<void>, timeoutMs = 15000): Promise<void> {
    const prev = this._updates
    await action()
    let waited = 0
    while (waited < timeoutMs) {
      if (this._updates > prev) return
      await new Promise((r) => setTimeout(r, 200))
      waited += 200
    }
    throw new Error('observer update timeout')
  }

  latest(): ObsPayload | null {
    return this._latest
  }

  updates(): number {
    return this._updates
  }

  async waitForUpdate(prev: number, timeoutMs = 8000): Promise<boolean> {
    let waited = 0
    while (waited < timeoutMs) {
      if (this._updates > prev) return true
      await new Promise((r) => setTimeout(r, 200))
      waited += 200
    }
    return false
  }

  close(): void {}
}

const pendingFromPayload = (p: ObsPayload): Pending | null => {
  const interaction = p.interaction as Record<string, unknown> | undefined
  if (!interaction || interaction.stateId !== 'wait') return null
  const request = interaction.request as Record<string, unknown> | undefined
  const kind = typeof request?.kind === 'string' ? request.kind : 'wait'
  return {
    ...interaction,
    type: kind === 'confirm-player-switch' ? 'confirm-next-player' : kind,
    playerIndex: typeof interaction.playerIndex === 'number' ? interaction.playerIndex : undefined,
  }
}

// ── Args ─────────────────────────────────────────────────────────────────────

export type Args = {
  players: number
  room: string
  url: string
  out: string
  seed?: number
  maxSteps: number
  observe: boolean
  moor: boolean
}

export const parseArgs = (argv: string[]): Args => {
  const get = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
  }
  const seedRaw = get('seed', '')
  const moor = argv.includes('--moor')
  const maxStepsRaw = get('max-steps', '')
  return {
    players: Number(get('players', '4')),
    room: get('room', 'dev4'),
    url: get('url', process.env.FRONTEND_URL ?? 'http://localhost:5173'),
    out: get('out', 'artifacts/agent-playtest/play'),
    seed: seedRaw === '' ? undefined : Number(seedRaw),
    maxSteps: Number(maxStepsRaw === '' ? (moor ? '320' : '120') : maxStepsRaw),
    observe: argv.includes('--observe'),
    moor,
  }
}

export const buildPlayerUrl = (args: Args, playerNumber: number): string => {
  const url = new URL(args.url)
  url.searchParams.set('player', `p${playerNumber}`)
  url.searchParams.set('transport', 'ws')
  url.searchParams.set('room', args.room)
  url.searchParams.set('devMode', '1')
  if (args.moor) {
    url.searchParams.set('enableFarmersOfTheMoor', 'true')
    url.searchParams.set('allowIncompleteFarmersOfTheMoorMinorDeal', 'true')
  }
  return url.toString()
}

// ── State view (from observer payload) ───────────────────────────────────────

type Pending = { type: string; playerIndex?: number; [k: string]: unknown }

type StateView = {
  state: Record<string, unknown>
  pending: Pending | null
  round: number
  currentPlayerIndex: number
  gameOver: boolean
  logLen: number
  playerIds: string[]
  occ: Record<string, string[]>
}

export const actingPlayerIndex = (view: { currentPlayerIndex: number; pending: Pending | null }): number =>
  view.pending?.type !== 'confirm-next-player' && typeof view.pending?.playerIndex === 'number'
    ? view.pending.playerIndex
    : view.currentPlayerIndex

const num = (v: unknown, fallback = -1): number => (typeof v === 'number' ? v : fallback)

const occupationMap = (state: Record<string, unknown>): Record<string, string[]> => {
  const spaces = state.actionSpaces
  const map: Record<string, string[]> = {}
  if (Array.isArray(spaces)) {
    for (const a of spaces as Array<Record<string, unknown>>) {
      const takenBy = a.takenBy
      if (Array.isArray(takenBy) && takenBy.length > 0) map[a.id as string] = takenBy as string[]
    }
  }
  return map
}

const viewFromPayload = (p: ObsPayload | null): StateView | null => {
  if (!p) return null
  const state = (p.state ?? {}) as Record<string, unknown>
  const players = Array.isArray(state.players) ? (state.players as Array<Record<string, unknown>>) : []
  const log = state.log
  return {
    state,
    pending: pendingFromPayload(p),
    round: num(state.round),
    currentPlayerIndex: num(state.currentPlayerIndex, 0),
    gameOver: state.gameOver === true,
    logLen: Array.isArray(log) ? log.length : 0,
    playerIds: players.map((pl) => pl.id as string),
    occ: occupationMap(state),
  }
}

const brief = (v: StateView) => ({
  round: v.round,
  currentPlayerIndex: v.currentPlayerIndex,
  pending: v.pending?.type ?? null,
  logLen: v.logLen,
  occCount: Object.keys(v.occ).length,
})

const sigOf = (v: StateView): string =>
  `${v.round}|${v.currentPlayerIndex}|${v.logLen}|${v.pending?.type ?? ''}|${Object.keys(v.occ).length}`

// WS broadcasts can arrive out of order (reset/join floods); wait until the
// observer's view stops changing before trusting it for a decision.
const waitStable = async (
  obs: PageObserver,
  stableMs = 700,
  timeoutMs = 8000,
): Promise<StateView | null> => {
  let last = ''
  let stableFor = 0
  let waited = 0
  while (waited < timeoutMs) {
    const v = viewFromPayload(obs.latest())
    const s = v ? sigOf(v) : ''
    if (s !== '' && s === last) {
      stableFor += 200
      if (stableFor >= stableMs) return v
    } else {
      last = s
      stableFor = 0
    }
    await new Promise((r) => setTimeout(r, 200))
    waited += 200
  }
  return viewFromPayload(obs.latest())
}

// A page's DOM lags the authoritative state until its WS broadcast lands. Wait
// until this page reflects at least `expectedTaken` occupied spaces so we don't
// click a stale-enabled action.
const syncPage = async (page: Page, expectedTaken: number, timeoutMs = 4000): Promise<void> => {
  let waited = 0
  while (waited < timeoutMs) {
    if ((await page.locator('.action-card-holder.taken').count()) >= expectedTaken) return
    await new Promise((r) => setTimeout(r, 200))
    waited += 200
  }
}

// Authoritative attribution: which space did playerId newly occupy?
const findNewAction = (before: StateView, after: StateView, playerId: string): string | null => {
  for (const [id, takenBy] of Object.entries(after.occ)) {
    const had = before.occ[id]?.includes(playerId) ?? false
    if (!had && takenBy.includes(playerId)) return id
  }
  return null
}

// ── Page helpers ─────────────────────────────────────────────────────────────

const openPages = async (browser: Browser, args: Args, obs: PageObserver): Promise<Page[]> => {
  const pages: Page[] = []
  for (let k = 1; k <= args.players; k++) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    const page = await ctx.newPage()
    obs.attach(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('open-agricola-locale-v2', 'en')
    })
    await page.goto(buildPlayerUrl(args, k), {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('[data-action-id]', { timeout: 30000 })
    pages.push(page)
  }
  return pages
}

const actionCard = (page: Page, name: string) => page.locator('.action-card', { hasText: name })

const resetNewGame = async (page: Page, seed?: number): Promise<void> => {
  if (seed !== undefined) {
    await page.locator('.dev-panel .seed-input input').fill(String(seed))
  }
  await page.getByRole('button', { name: 'Reset' }).click()
  await actionCard(page, 'Farmland').first().waitFor({ state: 'visible', timeout: 15000 })
}

const clickFirstAvailableAction = async (page: Page): Promise<string | null> => {
  const buttons = page.locator('[data-action-id]:not(.round) button.action-card:not([disabled])')
  if ((await buttons.count()) === 0) return null
  const btn = buttons.first()
  const actionId = await btn.evaluate(
    (el) => el.closest('[data-action-id]')?.getAttribute('data-action-id') ?? null,
  )
  await btn.click()
  return actionId ?? 'unknown'
}

const clickMoorSpecialAction = async (page: Page): Promise<string | null> => {
  const immediate = page
    .locator(
      [
        '.special-action-card__image-action[aria-label="Hiring Fair"]:not([disabled])',
        '.special-action-card__image-action[aria-label="Horse Market"]:not([disabled])',
        '.special-action-card__image-action[aria-label="Black Market"]:not([disabled])',
        '.special-action-card__image-action[aria-label="Illicit Work"]:not([disabled])',
      ].join(', '),
    )
    .first()
  if ((await immediate.count()) > 0) {
    const label = await immediate.getAttribute('aria-label')
    await immediate.click()
    return label ? `moor:${label}` : 'moor:special-action'
  }

  const terrain = page
    .locator(
      [
        '.special-action-card__image-action[aria-label="Cut Peat"]:not([disabled])',
        '.special-action-card__image-action[aria-label="Fell Trees"]:not([disabled])',
        '.special-action-card__image-action[aria-label="Slash and Burn"]:not([disabled])',
      ].join(', '),
    )
    .first()
  if ((await terrain.count()) === 0) return null
  const label = await terrain.getAttribute('aria-label')
  await terrain.click()
  const tile = page.locator('.farm-tile.selectable').first()
  try {
    await tile.waitFor({ state: 'visible', timeout: 2000 })
  } catch {
    return null
  }
  await tile.click()
  return label ? `moor:${label}` : 'moor:terrain'
}

// Click the primary enabled button inside the interaction bar (confirm / first option).
const clickInteractionPrimary = async (page: Page): Promise<boolean> => {
  const confirm = page.locator('.interaction-actions button:not([disabled])', { hasText: /confirm/i }).first()
  const btn = (await confirm.count()) > 0
    ? confirm
    : page
      .locator(
        '.interaction-actions button:not([disabled]), .interaction-bar__body button:not([disabled])',
      )
      .first()
  try {
    await btn.waitFor({ state: 'visible', timeout: 5000 })
  } catch {
    return false
  }
  await btn.click()
  return true
}

// ── Play mode ────────────────────────────────────────────────────────────────

const runPlay = async (browser: Browser, args: Args, outDir: string): Promise<void> => {
  const snapDir = join(outDir, 'snapshots')
  mkdirSync(snapDir, { recursive: true })

  const obs = new PageObserver()
  const pages = await openPages(browser, args, obs)
  await obs.waitForInitial()

  // Reset to a fresh game from the current active player's page.
  const start = viewFromPayload(obs.latest())
  if (!start) throw new Error('observer produced no state')
  await obs.waitForNextUpdateAfter(async () => {
    await resetNewGame(pages[actingPlayerIndex(start)] ?? pages[0], args.seed)
  })
  await waitStable(obs)

  const trace: unknown[] = []
  let step = 0
  let noProgress = 0
  let stopReason = 'maxSteps'

  while (step < args.maxSteps) {
    const before = await waitStable(obs)
    if (!before) {
      stopReason = 'state-missing'
      break
    }
    if (before.gameOver) {
      stopReason = 'gameOver'
      break
    }
    const activeIdx = actingPlayerIndex(before)
    const page = pages[activeIdx]
    if (!page) {
      stopReason = `no-page-for-index-${activeIdx}`
      break
    }
    const playerId = before.playerIds[activeIdx] ?? `p${activeIdx + 1}`
    const prevUpdates = obs.updates()

    let intentKind: string
    let domHint: string | null = null
    if (before.pending?.type === 'confirm-next-player') {
      intentKind = 'confirm-next-player'
      const ok = await clickInteractionPrimary(page)
      if (!ok) {
        stopReason = `confirm-button-missing@p${activeIdx + 1}`
        writeFileSync(join(snapDir, `step-${step}-stuck.json`), JSON.stringify(before.state))
        break
      }
    } else if (before.pending) {
      intentKind = `pending:${before.pending.type}`
      const ok = await clickInteractionPrimary(page)
      if (!ok) {
        stopReason = `pending:${before.pending.type}@p${activeIdx + 1}`
        writeFileSync(join(snapDir, `step-${step}-pending.json`), JSON.stringify(before, null, 2))
        break
      }
    } else {
      intentKind = 'take-action'
      await syncPage(page, Object.keys(before.occ).length)
      domHint = args.moor
        ? (await clickMoorSpecialAction(page)) ?? await clickFirstAvailableAction(page)
        : await clickFirstAvailableAction(page)
      if (!domHint) {
        noProgress++
        if (noProgress >= 3) {
          stopReason = `no-available-action@p${activeIdx + 1}`
          break
        }
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
    }

    const progressed = await obs.waitForUpdate(prevUpdates)
    const after = await waitStable(obs)
    step++
    const actionId =
      intentKind === 'take-action' && after ? findNewAction(before, after, playerId) ?? domHint : domHint
    trace.push({
      step,
      round: before.round,
      activePlayer: playerId,
      before: brief(before),
      intent: { kind: intentKind, actionId, domHint },
      progressed,
      after: after ? brief(after) : null,
    })
    if (after) writeFileSync(join(snapDir, `step-${step}.json`), JSON.stringify(after.state))

    if (!progressed) {
      noProgress++
      if (noProgress >= 3) {
        stopReason = 'stuck-no-progress'
        break
      }
    } else {
      noProgress = 0
    }
  }

  const final = viewFromPayload(obs.latest())
  obs.close()
  writeFileSync(join(outDir, 'trace.json'), JSON.stringify(trace, null, 2))
  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify(
      { args, steps: step, stopReason, finalRound: final?.round, gameOver: final?.gameOver },
      null,
      2,
    ),
  )
  console.log(`[play] steps=${step} stopReason=${stopReason} finalRound=${final?.round}`)
}

// ── Observe mode (verify WS observer) ────────────────────────────────────────

const runObserve = async (args: Args, outDir: string): Promise<void> => {
  const browser = await chromium.launch()
  const obs = new PageObserver()
  const pages = await openPages(browser, args, obs)
  await obs.waitForInitial()
  await new Promise((r) => setTimeout(r, 1000))
  const v = viewFromPayload(obs.latest())
  console.log('[observe]', v ? JSON.stringify(brief(v)) : 'no payload')
  if (v) writeFileSync(join(outDir, 'observe.json'), JSON.stringify(obs.latest(), null, 2))
  obs.close()
  for (const page of pages) await page.context().close()
  await browser.close()
}

// ── Entry ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const outDir = resolve(args.out)
  mkdirSync(outDir, { recursive: true })

  if (args.observe) {
    await runObserve(args, outDir)
    console.log(`[done] output: ${outDir}`)
    return
  }

  const browser = await chromium.launch()
  try {
    await runPlay(browser, args, outDir)
  } finally {
    await browser.close()
  }
  console.log(`[done] output: ${outDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

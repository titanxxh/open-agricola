import { expect, test } from '@playwright/test'
import { authenticateSolo, recordSoloEvidence, SoloBrowserDriver } from './helpers/standard-solo-acceptance'
import { BACKEND_URL } from './fixtures'
import { checkpoint, restartIsolatedBackend, verifyOriginalReceipt } from './helpers/standard-solo-process'

test.use({ actionTimeout: 10_000 })

class ThreeExpansionGame {
  cut = 0
  felled = 0
  retained = false
  autumn = false
  readonly heating: Array<{ round: number; required: number; wood: number }> = []
  readonly ledger: unknown[] = []
  constructor(readonly driver: SoloBrowserDriver, readonly mother: string) {}
  target() {
    const state = this.driver.state
    const current = state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-current')
    const terrain = state.players[0]!.farmTerrain ?? []
    if (this.cut < 3 && current?.actions.includes('cut-peat')) {
      const tile = terrain.find(tile => tile.kind === 'moor')
      if (tile) return { cardId: current.id, action: 'cut-peat', tile }
    }
    if (this.felled < 2 && current?.actions.includes('fell-trees')) {
      const tile = terrain.find(tile => tile.kind === 'forest')
      if (tile) return { cardId: current.id, action: 'fell-trees', tile }
    }
    return undefined
  }
  async settle() {
    const d = this.driver
    for (let step = 0; step < 30 && d.interaction.stateId === 'wait'; step++) {
      const interaction = d.interaction
      if (interaction.stateId !== 'wait') throw new Error('Pending changed without a command')
      const request = interaction.request
      if (request.kind === 'confirm-next-player') return
      if (request.kind === 'choice' && request.moorSolo?.window === 'preparation') {
        await d.choice(this.target() || this.cut === 3 && this.felled === 2 ? 'keep' : 'replace')
      } else if (request.kind === 'choice' && request.moorSolo?.window === 'retention') {
        const retain = !this.retained && this.target() && request.options.some(option => option.value === 'retain' && !option.disabled)
        await d.choice(retain ? 'retain' : 'discard')
        if (retain) this.retained = true
      } else if (request.kind === 'heating') {
        const round = d.state.round
        const before = { ...d.state.players[0]!.resources }
        const required = d.state.throughTheSeasons!.currentSeason === 'summer' ? 0 : 2
        expect(request.required).toBe(required)
        const wood = Math.max(0, required - (before.fuel ?? 0))
        expect(before.wood).toBeGreaterThanOrEqual(wood)
        const conversion = request.exchangeCatalog.find(option => option.from.wood === 1 && option.to.fuel === 1)
        if (wood && !conversion) throw new Error(`Missing offered wood conversion: ${JSON.stringify(request)}`)
        for (let count = 0; count < wood; count++) {
          await d.page.getByTestId(`heating-option-${conversion!.sourceId}-ex${conversion!.exchangeIndex}`).getByRole('button', { name: '+', exact: true }).click()
        }
        await expect(d.page.locator('.exchange-overlay')).toContainText(`${required}/${required} fuel`)
        await d.ui('confirm-heating', () => d.page.locator('.exchange-overlay .exchange-confirm').click())
        expect(d.state.players[0]!.resources.wood).toBe(before.wood - wood)
        expect(d.state.players[0]!.resources.fuel).toBe((before.fuel ?? 0) + wood - required)
        expect(d.state.players[0]!.sickWorkerIds).toEqual([])
        this.heating.push({ round, required, wood })
      } else if (request.kind === 'feed') {
        expect(d.state.players[0]!.resources.food).toBeGreaterThanOrEqual(request.remaining)
        await d.ui('confirm-feeding', () => d.page.locator('.exchange-overlay .exchange-confirm').click())
      } else if (request.kind === 'animal-reorg') {
        if (!['PR03', 'PR04', 'PR05'].includes(this.mother)) throw new Error(`Unknown animal grant: ${JSON.stringify(interaction)}`)
        const confirm = d.page.locator('.interaction-actions').getByRole('button', { name: 'Confirm', exact: true })
        await expect(confirm).toBeVisible()
        if (!await confirm.isEnabled()) {
          const animal = this.mother === 'PR03' ? 'Cattle' : this.mother === 'PR04' ? 'Boar' : 'Sheep'
          const row = d.page.locator('[data-farm-tile-player="p1"].room .pasture-control-row')
            .filter({ has: d.page.locator('.pasture-control-label').filter({ hasText: new RegExp(`^${animal}$`) }) }).first()
          await row.getByRole('button', { name: '+', exact: true }).click()
        }
        await d.ui('confirm-mother-animal', () => confirm.click())
      } else if (request.kind === 'farm-select' && interaction.sourceCard === this.mother
        && (this.mother === 'PR01' && request.farm.farmType === 'stable' || this.mother === 'PR02' && request.farm.farmType === 'plow')) {
        const tile = request.farm.selectableTiles[0]
        if (!tile) throw new Error(`No native parent reward target: ${JSON.stringify(interaction)}`)
        await d.page.locator(`[data-farm-tile-player="p1"][data-farm-tile-key="${tile.row}-${tile.col}"]`).click()
        await d.ui('confirm-parent-farm-reward', () => d.page.getByRole('button', { name: this.mother === 'PR01' ? 'Confirm stables' : 'Confirm plow', exact: true }).click())
      } else if (request.kind === 'select-trigger' && interaction.spaceId === '__stage:onRoundStart') {
        for (const option of request.options.filter(option => !option.disabled)) {
          if (option.sourceCard !== this.mother && option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name') throw new Error(`Unknown opening trigger: ${JSON.stringify(option)}`)
        }
        const option = request.options.find(option => option.sourceCard === this.mother && !option.disabled)
          ?? request.options.find(option => option.value === '__pass__' && !option.disabled)
        if (!option) throw new Error(`No known parent trigger: ${JSON.stringify(interaction)}`)
        await d.choice(option.value)
      } else if (request.kind === 'choice' && interaction.sourceCard === this.mother && ['PR01', 'PR02'].includes(this.mother)
        && request.options.some(option => option.value === '__skip__' && !option.disabled)) {
        await d.choice('__skip__')
      } else if (request.kind === 'choice' && interaction.spaceId === '__subflow:post-reap-anytime'
        && request.options.length === 1 && request.options[0]?.value === '__skip__') {
        await d.choice('__skip__')
      } else throw new Error(`Unknown native pending: ${JSON.stringify(interaction)}`)
    }
  }
  async special() {
    const d = this.driver
    const target = this.target()
    if (!target) return false
    const before = { ...d.state.players[0]!.resources }
    await d.page.locator(`.special-actions-panel [data-card-id="${target.cardId}"]`).getByRole('button', { name: target.action === 'cut-peat' ? 'Cut Peat' : 'Fell Trees', exact: true }).click()
    await d.ui(target.action, () => d.page.locator(`[data-farm-tile-player="p1"][data-farm-tile-key="${target.tile.row}-${target.tile.col}"]`).click())
    if (target.action === 'cut-peat') {
      this.cut++
      expect(d.state.players[0]!.resources.fuel).toBe((before.fuel ?? 0) + 3)
    } else {
      this.felled++
      expect(d.state.players[0]!.resources.wood).toBe(before.wood + 2)
    }
    await this.settle()
    await d.confirm()
    await this.settle()
    return true
  }
}

test('formal three-expansion choose-7 reaches natural scoring and both owner rematch entries', async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000)
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  let page = await context.newPage()
  let d = new SoloBrowserDriver(page)
  const paper: unknown[] = []
  const heatingExpected: Array<{ round: number; required: number; sickWorkerIds: string[] }> = []
  try {
    await authenticateSolo(context, request, `solo_full_${Date.now().toString(36)}`)
    const parents = await d.open({ moorBalanceRules: true })
    const game = new ThreeExpansionGame(d, parents.mother)
    await game.settle()
    const sourceUrl = page.url()
    const sourceId = d.envelope.roomId
    const initialHands = { occupations: d.state.players[0]!.occupationHand, minors: d.state.players[0]!.minorHand }
    const initialTerrain = d.state.players[0]!.farmTerrain!.length
    let food = parents.mother === 'PR11' ? 1 : 0
    let fishing = d.state.throughTheSeasons!.currentSeason === 'summer' ? 2 : 1
    let autumnRound = 0
    let summerRounds = 0
    await expect(page.locator('.game-layout')).toBeVisible()
    for (let round = 1; round <= 14; round++) {
      const season = d.state.throughTheSeasons!.currentSeason
      if ([4, 7, 9, 11, 13, 14].includes(round)) heatingExpected.push({ round, required: season === 'summer' ? 0 : 2, sickWorkerIds: [] })
      if (season === 'summer') summerRounds++
      expect(d.state.round).toBe(round)
      await d.action('day-laborer')
      food += 2
      await d.confirm()
      await game.settle()
      const beforeRetained = game.retained
      for (let use = 0; use < 2 && game.target(); use++) await game.special()
      if (!beforeRetained && game.retained) food -= 2
      const second = season === 'autumn' && !game.autumn ? 'season-autumn-thanksgiving'
        : season === 'winter' && round <= 11 ? 'forest' : 'fishing'
      await d.action(second)
      if (second === 'season-autumn-thanksgiving') {
        autumnRound = round
        game.autumn = true
        if (d.interaction.stateId === 'wait' && d.interaction.request.kind === 'choice') {
          const option = d.interaction.request.options.find(option => option.labelKey === 'actions.season-autumn-thanksgiving.option-vegetable')
          if (!option) throw new Error(`Unknown autumn choice: ${JSON.stringify(d.interaction)}`)
          await d.choice(option.value)
        }
      } else if (second === 'fishing') { food += fishing; fishing = 0 }
      await d.confirm()
      await game.settle()
      if ([4, 7, 9, 11, 13, 14].includes(round)) food -= 6
      expect(d.state.players[0]!.resources.food).toBe(food)
      expect(d.state.players[0]!.resources.begging).toBe(0)
      expect(d.state.players[0]!.sickWorkerIds).toEqual([])
      paper.push({ round, season, second, food, cutPeat: game.cut, fellTrees: game.felled, retained: game.retained, resources: d.state.players[0]!.resources })
      console.log(JSON.stringify({ scenario: 'native-three-expansion-round', round, season, food }))
      if (round < 14) fishing += d.state.throughTheSeasons!.currentSeason === 'summer' ? 2 : 1
    }
    expect(d.state.gameOver).toBe(true)
    expect(d.interaction.stateId).toBe('gameover')
    expect(game.cut).toBe(3)
    expect(game.felled).toBe(2)
    expect(game.retained).toBe(true)
    expect(game.autumn).toBe(true)
    expect(d.state.players[0]!.farmTerrain).toHaveLength(initialTerrain - 5)
    const player = d.state.players[0]!
    const expectedGrain = summerRounds + (parents.mother === 'PR07' ? 1 : 0)
    expect(player.resources.grain).toBe(expectedGrain)
    expect(player.resources.vegetable).toBe(parents.mother === 'PR06' ? 2 : 1)
    expect(player.resources.sheep).toBe(parents.mother === 'PR05' ? 1 : 0)
    expect(player.resources.boar).toBe(parents.mother === 'PR04' ? 1 : 0)
    expect(player.resources.cattle).toBe(parents.mother === 'PR03' ? 1 : 0)
    const motherPoints: Record<string, number> = { PR01: -0.75, PR02: -0.25, PR03: 0, PR04: 0.1, PR05: 0.2, PR06: 0.3, PR07: 0.4, PR08: 0.5, PR09: 0.6, PR10: 0.7, PR11: 0.8, PR12: 0.9 }
    const grainPoints = expectedGrain <= 3 ? 1 : expectedGrain <= 5 ? 2 : 3
    const paperCategories = { fields: player.fields.length ? 1 : -1, pastures: -1, grains: grainPoints,
      vegetables: parents.mother === 'PR06' ? 2 : 1, sheeps: parents.mother === 'PR05' ? 1 : -1,
      boars: parents.mother === 'PR04' ? 1 : -1, cattles: parents.mother === 'PR03' ? 1 : -1, horses: -1,
      empty: -(13 - (initialTerrain - 5) - player.fields.length - player.stableTiles.length),
      stables: player.stableTiles.length, clayRooms: 0, stoneRooms: 0, farmers: 6, cards: 0, beggings: 0, parentCards: motherPoints[parents.mother]! }
    expect(Object.fromEntries(d.payload.scores![0]!.categories.map(category => [category.key, category.total || 0]))).toEqual(paperCategories)
    const paperScore = Math.round(Object.values(paperCategories).reduce((sum, points) => sum + points, 0) * 100) / 100
    expect(d.payload.scores![0]!.total).toBe(paperScore)
    expect({ occupations: d.state.players[0]!.occupationHand, minors: d.state.players[0]!.minorHand }).toEqual(initialHands)
    const events = [...new Map(d.events.flatMap(event => event.type === 'stateUpdate' ? event.payload.state.events : []).map(event => [event.occurrenceId, event])).values()]
    expect(events.filter(event => event.type === 'worker.placed')).toHaveLength(28)
    expect(events.filter(event => event.type === 'harvest.started').map(event => event.round)).toEqual([4, 7, 9, 11, 13, 14])
    expect(events.filter(event => event.type === 'worker.placed' && event.spaceId === 'season-autumn-thanksgiving')).toHaveLength(1)
    expect(events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    expect(events.flatMap(event => event.type === 'harvest.heated'
      ? [{ round: event.round, required: event.required, sickWorkerIds: event.sickWorkerIds }] : [])).toEqual(heatingExpected)
    const result = await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${sourceId}`)
    const completed = await result.json()
    const terminal = structuredClone(d.payload)
    expect(completed.lifecycle).toBe('completed')
    expect(completed.result.players[0].score).toBe(d.payload.scores![0]!.total)
    await page.screenshot({ path: testInfo.outputPath('three-expansion-natural-score.png') })
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByRole('button', { name: 'Play again with these settings' })).toBeInViewport()
    await page.getByRole('button', { name: 'Play again with these settings' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose your starting hand' })).toBeVisible()
    const immediateId = new URL(page.url()).searchParams.get('room')!
    expect(immediateId).not.toBe(sourceId)
    await expect.poll(() => d.envelope.roomId).toBe(immediateId)
    const originalConfiguration = await (await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${sourceId}/creation-configuration`)).json()
    expect(originalConfiguration).toMatchObject({ ok: true, configuration: {
      kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'choose-7', enableParentCards: true, draftParents: true,
      enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true,
    } })
    const before = await checkpoint(immediateId, sourceId)
    const cookies = await context.cookies()
    await d.attach(testInfo, 'natural-terminal-and-immediate-rematch')
    await context.close()
    const processes = await restartIsolatedBackend(before.viewerBuildId, before.gameBuildId)
    const restored = await checkpoint(immediateId, sourceId)
    expect(restored).toEqual(before)
    context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    await context.addCookies(cookies)
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    page = await context.newPage()
    d = new SoloBrowserDriver(page)
    await page.route('**/replay-viewers/**', route => route.abort())
    await page.goto(sourceUrl)
    await expect(page.locator('.solo-completed-summary')).toContainText(String(completed.result.players[0].score))
    expect(await (await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${sourceId}/creation-configuration`)).json()).toEqual(originalConfiguration)
    await page.getByRole('button', { name: 'Play again with these settings' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose your starting hand' })).toBeVisible()
    const restartedId = new URL(page.url()).searchParams.get('room')!
    expect(restartedId).not.toBe(sourceId)
    expect(restartedId).not.toBe(immediateId)
    await expect.poll(() => d.envelope.roomId).toBe(restartedId)
    expect(d.commands.filter(command => command.type === 'createRoom')).toHaveLength(1)
    expect(d.commands.find(command => command.type === 'createRoom')).toMatchObject({ sourceGameContextId: sourceId })
    expect(d.state).toMatchObject({ phase: 'solo-hand-selection', enableParentCards: true,
      enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true,
    })
    expect(d.state.soloHandSelection?.groups.map(group => [group.kind, group.cardIds.length, group.keepCount]))
      .toEqual([['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]])
    const originalAfterRestart = await (await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${sourceId}`)).json()
    expect(originalAfterRestart).toMatchObject({ lifecycle: 'completed', result: completed.result })
    await recordSoloEvidence(testInfo, 'completed-source-process-rematch', { processes, before, restored,
      sourceId, immediateId, restartedId, originalConfiguration, originalAfterRestart,
      commands: d.commands, viewerUnavailable: true,
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(sourceUrl)
    await page.getByRole('button', { name: 'Play again with these settings' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose your starting hand' })).toBeVisible()
    expect((await (await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${sourceId}`)).json()).result).toEqual(completed.result)
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport)
      await page.route(`**/api/v1/game-contexts/${sourceId}/creation-configuration`, route => route.fulfill({ json: {
        ok: true, configuration: { kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'choose-7',
          officialCardPool: 'default-implemented-A-E', enableCommunityDeck: false, customCardIds: ['fixture-unavailable-card'],
          enableParentCards: true, draftParents: true, enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true },
        issues: [{ workshopCardId: 'fixture-unavailable-card', reason: 'missing' }],
      } }))
      await page.goto(sourceUrl)
      await page.getByRole('button', { name: 'Play again with these settings' }).click()
      const settings = page.getByRole('dialog', { name: 'Review the original settings' })
      await expect(settings).toBeVisible()
      await expect(settings.getByRole('checkbox', { name: 'fixture-unavailable-card' })).toBeChecked()
      await expect(settings.getByRole('checkbox', { name: 'Enable Parent Cards expansion' })).toBeChecked()
      await expect(settings.getByRole('checkbox', { name: 'Enable Through the Seasons expansion' })).toBeChecked()
      await expect(settings.getByRole('checkbox', { name: 'Enable Farmers of the Moor expansion' })).toBeChecked()
      await expect(settings.getByRole('radio', { name: /Choose 7 from 10/ })).toBeChecked()
      await expect(settings.getByRole('button', { name: 'Start solo game' })).toBeDisabled()
      await settings.getByRole('checkbox', { name: 'fixture-unavailable-card' }).click()
      await expect(settings.getByRole('button', { name: 'Start solo game' })).toBeEnabled()
      await expect(settings.getByRole('button', { name: 'Start solo game' })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`unavailable-source-corrected-${viewport.width}.png`) })
      const commandStart = d.commands.length
      await settings.getByRole('button', { name: 'Start solo game' }).click()
      await expect(page.getByRole('dialog', { name: 'Choose your starting hand' })).toBeVisible()
      const created = d.commands.slice(commandStart).find(command => command.type === 'createRoom')
      expect(created).toMatchObject({ maxPlayers: 1, soloHandMode: 'choose-7', enableParentCards: true, draftParents: true,
        enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, customCardIds: [] })
      expect(created && 'sourceGameContextId' in created ? created.sourceGameContextId : undefined).toBeUndefined()
      await page.unroute(`**/api/v1/game-contexts/${sourceId}/creation-configuration`)
    }
    await recordSoloEvidence(testInfo, 'independent-food-ledger', { parents, autumnRound, rounds: paper, heatingWindows: game.heating, allHarvestHeatingExpected: heatingExpected, paperCategories, paperScore, finalScores: terminal.scores,
      unavailableSourceSetup: 'Private creation-configuration GET fixture only; original completed identity and all corrected new rooms are real formal games. This fixture does not count toward the natural fourteen-round proof.' })
  } finally {
    await d.attach(testInfo, 'native-three-expansion-commands')
    await context.close()
  }
})

test('a stopped backend process restores paid Moor retention from the same PostgreSQL and S3 namespaces', async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000)
  let context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  let d = new SoloBrowserDriver(await context.newPage())
  let originalClosed = false
  try {
    await authenticateSolo(context, request, `solo_restart_${Date.now().toString(36)}`)
    const parents = await d.open()
    const game = new ThreeExpansionGame(d, parents.mother)
    await game.settle()
    for (let round = 1; round <= 10; round++) {
      await d.action('day-laborer')
      await d.confirm()
      await game.settle()
      const target = game.target()
      if (target) {
        await d.page.locator(`.special-actions-panel [data-card-id="${target.cardId}"]`).getByRole('button', { name: target.action === 'cut-peat' ? 'Cut Peat' : 'Fell Trees', exact: true }).click()
        await d.ui(target.action, () => d.page.locator(`[data-farm-tile-player="p1"][data-farm-tile-key="${target.tile.row}-${target.tile.col}"]`).click())
        expect(d.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', moorSolo: { window: 'retention' } } })
        await d.choice('retain')
        break
      }
      await d.action(d.state.throughTheSeasons!.currentSeason === 'winter' && d.state.round <= 11 ? 'forest' : 'fishing')
      await d.confirm()
      await game.settle()
    }
    expect(d.state.farmersOfTheMoor!.soloSupply!.retentionPaid).toBe(true)
    const original = d.commands.findLast(command => command.type === 'choice' && command.value === 'retain')!
    const receipt = d.receipt
    const sourceId = d.envelope.roomId
    const sourceUrl = d.page.url()
    const beforePublic = { state: d.state, interaction: d.interaction, scores: d.payload.scores }
    const cookies = await context.cookies()
    await d.attach(testInfo, 'pre-process-stop-native-commands')
    await context.close()
    originalClosed = true
    const before = await checkpoint(sourceId)
    expect({ stepNo: before.stepNo, frameHash: before.frameHash }).toEqual({ stepNo: receipt.outcome.stepNo, frameHash: receipt.outcome.frameHash })
    const processes = await restartIsolatedBackend(before.viewerBuildId, before.gameBuildId)
    const restored = await checkpoint(sourceId)
    expect(restored).toEqual(before)
    context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    originalClosed = false
    await context.addCookies(cookies)
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const duplicateEvents = await verifyOriginalReceipt(context, sourceId, original, receipt)
    expect(await checkpoint(sourceId)).toEqual(before)
    d = new SoloBrowserDriver(await context.newPage())
    await d.page.goto(sourceUrl)
    await expect(d.page.locator('.game-layout')).toBeVisible()
    expect({ state: d.state, interaction: d.interaction, scores: d.payload.scores }).toEqual(beforePublic)
    await expect(d.page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    await d.page.screenshot({ path: testInfo.outputPath('retention-restored-new-process-mobile.png') })
    await d.confirm()
    expect(d.interaction).toMatchObject({ stateId: 'idle' })
    await d.action('grain-seeds')
    expect(d.state.players[0]!.resources.food).toBe(beforePublic.state.players[0]!.resources.food)
    expect(d.envelope.version).toBeGreaterThan(receipt.outcome.roomVersion!)
    await recordSoloEvidence(testInfo, 'process-and-persistence-proof', { processes, before, restored, receipt, duplicateEvents,
      namespaceKeptUntilAfterResume: true, browserContextRecreated: true })
  } finally {
    await d.attach(testInfo, 'post-process-recovery-native-commands')
    if (!originalClosed) await context.close()
  }
})

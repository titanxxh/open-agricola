import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { SoloBrowserDriver } from '../../e2e-tests/helpers/standard-solo-acceptance'
import { observeReleasePage, type ReleaseDiagnosticSnapshot } from '../../e2e-tests/helpers/release-diagnostics'
import { verifyVisibleReleaseAssets } from './render'
import { isSameSite } from '../../server/http-origin'

export type SmokeMode = 'random' | 'choose-7'
export type SmokeTarget = { appUrl: string; apiUrl: string; buildId: string }
export type SmokeCredentials = { username: string; password: string }
export type ReleaseFailureStage = 'build-metadata' | 'login' | 'logout' | 'browser-errors'
  | `${SmokeMode}:${'create-or-resume' | 'opening' | 'reload' | 'render'}`
type SavedRoom = { roomId: string; step0Hash: string }
type Progress = { version: 1; targetKey: string; rooms: Partial<Record<SmokeMode, SavedRoom>>;
  pendingCreation: { mode: SmokeMode; identity: { scopeId: string; commandId: string } | null } | null }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const evidenceHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function parseSmokeTarget(appUrl: string, apiUrl: string, buildId: string): SmokeTarget {
  const app = new URL(appUrl), api = new URL(apiUrl)
  for (const url of [app, api]) {
    assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Use HTTP(S) URLs without credentials, queries or fragments')
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Formal game rehearsal is limited to loopback targets; production acceptance must not create games')
  }
  assert.ok(isSameSite(app, api), 'Release smoke requires same-site frontend and API origins')
  assert.ok(['/', '/open-agricola/'].includes(app.pathname)); assert.equal(api.pathname, '/')
  assert.ok(buildId.trim(), 'Select the expected hosted build')
  return { appUrl: app.href, apiUrl: api.origin, buildId }
}

export function writeEvidence(directory: string, name: string, value: unknown): void {
  assert.match(name, /^[a-z][a-z0-9.-]*\.json$/)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, name), temporary = `${file}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  renameSync(temporary, file)
}

export function createFailureRecorder(directory: string, diagnostics: () => ReleaseDiagnosticSnapshot) {
  let firstFailure: Error | undefined
  return (stage: ReleaseFailureStage, error: unknown, snapshot = diagnostics()) => {
    if (firstFailure && error === firstFailure) return { primary: false, error: firstFailure }
    const primary = !firstFailure
    const errorCategory = error instanceof Error && ['AssertionError', 'Error', 'TypeError', 'TimeoutError', 'SyntaxError', 'RangeError', 'ReferenceError'].includes(error.name) ? error.name : 'unknown'
    writeEvidence(directory, primary ? 'failure.json' : 'cleanup-failure.json', { stage, errorCategory, diagnostics: snapshot })
    firstFailure ??= new Error(`Release smoke failed during ${stage}; see failure.json`)
    return { primary, error: firstFailure }
  }
}

function progressFor(directory: string, targetKey: string): Progress {
  const file = join(directory, 'progress.json')
  if (!existsSync(file)) return { version: 1, targetKey, rooms: {}, pendingCreation: null }
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
  assert.ok(object(value) && value.version === 1 && value.targetKey === targetKey && object(value.rooms), 'Progress belongs to a different target/account or has an invalid format')
  assert.equal(value.pendingCreation, null, 'Creation outcome is uncertain. Resolve the saved command receipt before retrying; do not create another room.')
  const rooms: Progress['rooms'] = {}
  for (const mode of ['random', 'choose-7'] as const) {
    const room = value.rooms[mode]
    if (room === undefined) continue
    assert.ok(object(room) && typeof room.roomId === 'string' && uuid.test(room.roomId) && typeof room.step0Hash === 'string' && /^[a-f0-9]{64}$/.test(room.step0Hash), 'Invalid saved room')
    rooms[mode] = { roomId: room.roomId, step0Hash: room.step0Hash }
  }
  return { version: 1, targetKey, rooms, pendingCreation: null }
}

function snapshot(driver: SoloBrowserDriver) {
  const { state, interaction } = driver.payload, player = state.players[0]
  assert.ok(player)
  return structuredClone({ roomId: driver.envelope.roomId, version: driver.envelope.version,
    phase: state.phase, round: state.round, roundPhase: state.roundPhase, resources: player.resources,
    occupationHand: player.occupationHand, minorHand: player.minorHand, parents: player.parentCards,
    handSelection: state.soloHandSelection, parentSelection: state.parentSelection,
    moor: state.farmersOfTheMoor, seasons: state.throughTheSeasons, interaction })
}
export type SmokeRoom = SavedRoom & { mode: SmokeMode; snapshot: ReturnType<typeof snapshot>;
  renderedAssets: Awaited<ReturnType<typeof verifyVisibleReleaseAssets>> }
export type SmokeEvidence = { ownerId: string; rooms: SmokeRoom[]; commandTypes: string[]; logout: true }

async function settleOpening(driver: SoloBrowserDriver, mother?: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const interaction = driver.interaction
    if (interaction.stateId === 'idle') return
    if (interaction.stateId === 'wait' && interaction.request.kind === 'confirm-next-player') return
    assert.equal(driver.state.round, 1); assert.equal(driver.state.roundPhase, 'preparation')
    if (interaction.stateId !== 'wait' || interaction.spaceId !== '__stage:onRoundStart') throw new Error('Unrecognized opening interaction')
    if (interaction.sourceCard === 'E096_Elder' && interaction.request.kind === 'choice') {
      assert.ok(interaction.request.options.some(option => option.value === '__skip__' && !option.disabled))
      await driver.choice('__skip__')
    } else if (interaction.request.kind === 'select-trigger' && mother && ['PR10', 'PR11', 'PR12'].includes(mother)) {
      const option = interaction.request.options.find(option => option.sourceCard === mother && !option.disabled)
        ?? interaction.request.options.find(option => option.value === '__pass__' && !option.disabled)
      assert.ok(option, 'A known parent opening must offer its trigger or pass')
      await driver.choice(option.value)
    } else throw new Error('Unrecognized opening interaction')
  }
  throw new Error('Opening did not reach the work phase')
}

export async function runReleaseSmoke({ page, target, credentials, outputDirectory, failureRecorder }: {
  page: Page; target: SmokeTarget; credentials: SmokeCredentials; outputDirectory: string;
  failureRecorder?: ReturnType<typeof createFailureRecorder>
}): Promise<SmokeEvidence> {
  target = parseSmokeTarget(target.appUrl, target.apiUrl, target.buildId)
  const progress = progressFor(outputDirectory, evidenceHash([target, credentials.username]))
  const save = () => writeEvidence(outputDirectory, 'progress.json', progress)
  const diagnostics = observeReleasePage(page, { capacity: 512 }), driver = new SoloBrowserDriver(page)
  const errors: string[] = [], onError = (error: Error) => errors.push(error.name)
  page.on('pageerror', onError)
  await page.context().addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  let stage: ReleaseFailureStage = 'build-metadata', authenticated = false, result: SmokeEvidence | undefined
  let primaryFailure: Error | undefined
  const recordFailure = failureRecorder ?? createFailureRecorder(outputDirectory, () => diagnostics.snapshot())
  const fail = (error: unknown) => {
    if (progress.pendingCreation) {
      const command = driver.commands.findLast(command => command.type === 'createRoom')
      if (command?.commandContext) progress.pendingCreation.identity = { scopeId: command.commandContext.scopeId, commandId: command.commandContext.commandId }
      save()
    }
    return recordFailure(stage, error, diagnostics.snapshot())
  }
  try {
    const metadata = await page.context().request.get(`${target.appUrl}frontend-build.json`)
    assert.equal(metadata.status(), 200)
    const build: unknown = await metadata.json()
    assert.ok(object(build) && build.format === 1 && build.gameBuildId === target.buildId && build.basePath === new URL(target.appUrl).pathname, 'Frontend must match the selected build and base path')
    stage = 'login'
    await page.goto(`${target.appUrl}?page=login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#username').fill(credentials.username); await page.locator('#password').fill(credentials.password)
    const login = page.waitForResponse(response => response.url() === `${target.apiUrl}/api/auth/login` && response.request().method() === 'POST')
    await page.locator('.login-form button[type="submit"]').click(); assert.equal((await login).status(), 200); authenticated = true
    const me = await page.context().request.get(`${target.apiUrl}/api/auth/me`); assert.equal(me.status(), 200)
    const identity: unknown = await me.json()
    assert.ok(object(identity) && object(identity.user) && typeof identity.user.id === 'string')
    const ownerId = identity.user.id, rooms: SmokeRoom[] = []
    for (const mode of ['random', 'choose-7'] as const) {
      await page.setViewportSize(mode === 'random' ? { width: 1280, height: 900 } : { width: 375, height: 812 })
      stage = `${mode}:create-or-resume`
      let saved = progress.rooms[mode]
      if (saved) {
        const count = driver.events.length, roomId = saved.roomId
        await page.goto(`${target.appUrl}?room=${roomId}`, { waitUntil: 'domcontentloaded' })
        await expect.poll(() => driver.events.slice(count).some(event => event.type === 'stateUpdate' && event.sync === 'snapshot' && event.roomId === roomId)).toBe(true)
      } else {
        await page.goto(target.appUrl, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: 'Solo game', exact: true }).click()
        const setup = page.getByRole('dialog', { name: 'Start a solo game' })
        if (mode === 'choose-7') {
          await setup.getByRole('radio', { name: /Choose 7 from 10/ }).check()
          for (const name of ['Enable Parent Cards expansion', 'Enable Through the Seasons expansion', 'Enable Farmers of the Moor expansion']) await setup.getByRole('checkbox', { name, exact: true }).check()
        }
        progress.pendingCreation = { mode, identity: null }; save()
        const receipt = await driver.ui('create-room', () => setup.getByRole('button', { name: 'Start solo game', exact: true }).click())
        assert.ok(receipt.outcome.roomId && uuid.test(receipt.outcome.roomId) && receipt.outcome.frameHash)
        saved = { roomId: receipt.outcome.roomId, step0Hash: receipt.outcome.frameHash }
        progress.rooms[mode] = saved; progress.pendingCreation = null; save()
      }
      const room = saved
      stage = `${mode}:opening`
      if (mode === 'choose-7' && driver.state.phase === 'solo-hand-selection') {
        const groups = driver.state.soloHandSelection?.groups; assert.ok(groups)
        assert.deepEqual(groups.map(group => [group.kind, group.cardIds.length, group.keepCount]), [['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]])
        const dialog = page.getByRole('dialog', { name: 'Choose your starting hand' })
        for (const [index, group] of groups.entries()) {
          const selected = group.cardIds.map((id, index) => ({ id, index })).filter(card => card.id !== 'E096_Elder').slice(0, group.keepCount)
          for (const card of selected) await dialog.locator('fieldset').nth(index).getByRole('checkbox').nth(card.index).check()
        }
        await driver.ui('select-hand', () => dialog.getByRole('button', { name: 'Confirm starting hand' }).click())
      }
      if (driver.state.phase === 'parent-selection') {
        const candidates = driver.state.parentSelection?.candidates.p1; assert.ok(candidates)
        const preference: typeof candidates.mother = ['PR08', 'PR11', 'PR10', 'PR12', 'PR07', 'PR09', 'PR06', 'PR05', 'PR04', 'PR03', 'PR02', 'PR01']
        const mother = preference.find(id => candidates.mother.includes(id))
        const father = candidates.father[0]; assert.ok(mother && father)
        await page.locator(`[data-section="mother"] [data-card-id="${mother}"]`).click()
        await page.locator(`[data-section="father"] [data-card-id="${father}"]`).click()
        await driver.ui('select-parents', () => page.locator('.parent-selection-confirm').click())
      }
      await settleOpening(driver, driver.state.players[0]?.parentCards?.mother ?? undefined)
      if (mode === 'random') {
        const action = driver.state.actionSpaces.find(space => space.id === 'day-laborer'); assert.ok(action)
        if (!action.takenBy.length) { assert.equal(driver.state.players[0]?.resources.food, 0); await driver.action('day-laborer') }
        if (driver.interaction.stateId === 'wait') await driver.confirm()
        assert.equal(driver.state.players[0]?.resources.food, 2)
      }
      assert.equal(driver.state.players.length, 1); assert.equal(driver.state.round, 1); assert.equal(driver.state.roundPhase, 'work')
      assert.equal(driver.state.players[0]?.occupationHand.length, 7); assert.equal(driver.state.players[0]?.minorHand.length, 7)
      if (mode === 'choose-7') {
        assert.equal(driver.state.players[0]?.minorHand.filter(card => card.startsWith('M')).length, 4)
        assert.equal(driver.state.farmersOfTheMoor?.specialActionCards.length, 1)
        assert.equal(driver.state.farmersOfTheMoor?.soloSupply?.drawCount, 9)
      }
      stage = `${mode}:reload`
      const before = snapshot(driver), sentHands = driver.commands.filter(command => command.type === 'soloHandSubmit').length
      const prior = diagnostics.snapshot().entries.findLast(event => event.kind === 'frame' && event.messageType === 'stateUpdate' && event.roomId === room.roomId && event.sync === 'snapshot')
      assert.ok(prior && prior.kind === 'frame')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect.poll(() => diagnostics.snapshot().entries.some(event => event.kind === 'frame' && event.messageType === 'stateUpdate'
        && event.roomId === room.roomId && event.sync === 'snapshot' && event.documentId > prior.documentId && event.socketId !== prior.socketId)).toBe(true)
      assert.deepEqual(snapshot(driver), before, 'A fresh document must restore the exact same game, hand and pending interaction')
      assert.equal(driver.commands.filter(command => command.type === 'soloHandSubmit').length, sentHands)
      stage = `${mode}:render`
      const renderedAssets = await verifyVisibleReleaseAssets(page)
      assert.ok(renderedAssets.length, 'The game must render real sprite assets')
      await page.screenshot({ path: join(outputDirectory, `${mode}.png`) })
      if (mode === 'choose-7') {
        await page.locator('.farm-grid').first().scrollIntoViewIfNeeded()
        const farmAssets = await verifyVisibleReleaseAssets(page)
        assert.ok(farmAssets.length, 'The Moor farm must render real sprite assets')
        renderedAssets.push(...farmAssets)
        await page.screenshot({ path: join(outputDirectory, 'moor-farm.png') })
      }
      rooms.push({ ...room, mode, snapshot: before, renderedAssets })
    }
    assert.deepEqual(errors, [])
    result = { ownerId, rooms, commandTypes: driver.commands.map(command => command.type), logout: true }
  } catch (error) { primaryFailure = fail(error).error }
  finally {
    try {
      if (authenticated) {
        stage = 'logout'
        assert.equal((await page.context().request.post(`${target.apiUrl}/api/auth/logout`, { data: {} })).status(), 200)
        assert.equal((await page.context().request.get(`${target.apiUrl}/api/auth/me`)).status(), 401)
      }
    } catch (error) {
      const failure = fail(error)
      primaryFailure ??= failure.error
    }
    finally { writeEvidence(outputDirectory, 'diagnostics.json', diagnostics.snapshot()); diagnostics.dispose(); page.off('pageerror', onError) }
  }
  if (primaryFailure) throw primaryFailure
  if (errors.length) { stage = 'browser-errors'; throw fail(new Error('Browser runtime error')).error }
  assert.ok(result)
  return result
}

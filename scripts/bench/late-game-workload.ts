import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'
import { getCardDefinition, getMinorImprovementCard, getOccupationCard } from '../../shared/cards/catalog.ts'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import { getCardListenerSource, setCardListenerSource } from '../../shared/cards/card-listener-source.ts'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state.ts'
import { familySize } from '../../shared/domain/player.ts'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import { snapshotForWorker } from '../../shared/session/recovery-catalog.ts'
import { GameSession, type SessionResponse } from '../../server/game/authoritative-session.ts'
import { canonicalJson } from '../../server/game/replay-codec.ts'
import { executeWorkloadCommand, type RoomWorkload } from './room-performance.ts'

type Command = RoomWorkload['commands'][number]
const CARD_SETS = [
  { occupations: ['B126_Carpenter', 'C122_Bricklayer', 'D154_ChimneySweep', 'E118_KindlingGatherer', 'D105_Sculptor'], minors: ['B012_Stockyard', 'B068_Beanfield', 'A012_DrinkingTrough', 'A056_Basket', 'A015_CarpentersAxe'] },
  { occupations: ['A143_Stonecutter', 'D121_ClayPlasterer', 'C128_WoodenHutExtender', 'B162_ForestClearer', 'D125_ForestTrader'], minors: ['C011_WildlifeReserve', 'C070_LettucePatch', 'B013_CarpentersParlor', 'E075_StoneAxe', 'C051_FishingNet'] },
  { occupations: ['C088_CarpentersApprentice', 'B128_Plumber', 'A128_RiparianBuilder', 'D143_TreeCutter', 'D146_Porter'], minors: ['C012_CattleFarm', 'E068_CherryOrchard', 'C076_WoodCart', 'B048_ForestStone', 'A075_LumberMill'] },
  { occupations: ['B095_MasterBricklayer', 'C094_StableCleaner', 'E150_RockBeater', 'D144_WaterWorker', 'B147_Huntsman'], minors: ['A011_MudPatch', 'E069_MelonPatch', 'E015_NailBasket', 'C036_ClayDeposit', 'B079_Corf'] },
]
const increment = (counts: Record<string, number>, key: string): void => { counts[key] = (counts[key] ?? 0) + 1 }

// Recorder-only instrumentation, scoped to each session's registry. The fixture
// contains ordinary cards, never these wrappers or a special rule implementation.
const observeHooks = (session: GameSession, calls: Record<string, number>): void => session.withCtx(() => {
  const registry = requireActiveCardRegistry('late-game recorder')
  const selected = new Set(CARD_SETS.flatMap(set => [...set.occupations, ...set.minors]))
  for (const listener of registry.getAllListeners()) {
    if (!listener.cardIds?.some(id => selected.has(id)) || !listener.handler) continue
    const original = listener.handler
    const wrapped: typeof listener = { ...listener, handler(context) {
      increment(calls, `${listener.id}:${context.phase}`)
      return original(context)
    } }
    const source = getCardListenerSource(listener)
    if (source) setCardListenerSource(wrapped, source)
    registry.registerListener(wrapped)
  }
  for (const id of selected) {
    const effect = registry.getEffect(id)
    if (!effect?.onComputeAnimalZones) continue
    const original = effect.onComputeAnimalZones
    registry.setEffect({ ...effect, onComputeAnimalZones(...args) {
      increment(calls, `${id}:onComputeAnimalZones`)
      return original(...args)
    } })
  }
})

const restart = (session: GameSession): GameSession => {
  const snapshot = structuredClone(snapshotForWorker(serializeSessionSnapshot(session.state, session)))
  session.dispose()
  return new GameSession(rehydrateState(snapshot))
}

const assertPrepared = (session: GameSession): void => {
  assert.equal(session.state.players.length, 4)
  const seen = new Set<string>()
  for (const [index, player] of session.state.players.entries()) {
    assert.equal(familySize(player), 5, `round ${session.state.round} player ${index} family size`)
    assert.equal(player.workers.filter(worker => worker.isActive && !worker.isNewborn && !worker.supplyUse).length, 5)
    assert.deepEqual(player.occupationPlayed, CARD_SETS[index]!.occupations)
    assert.deepEqual(player.minorPlayed, CARD_SETS[index]!.minors)
    assert(player.occupationPlayed.length + player.minorPlayed.length + player.improvements.length <= 14)
    for (const id of player.improvements) assert(getCardDefinition(id), `unknown improvement ${id}`)
    const played = new Set([...player.occupationPlayed, ...player.minorPlayed])
    for (const modifier of player.activeModifiers) assert(played.has(modifier.cardId), `stale modifier ${modifier.cardId}`)
    for (const id of [...player.occupationPlayed, ...player.minorPlayed]) {
      assert(!seen.has(id), `duplicate played card ${id}`)
      seen.add(id)
      assert(ALL_CARD_IMPLS[id] && getCardDefinition(id), `unknown card ${id}`)
    }
  }
  assert.equal(seen.size, 40)
}

const prepareLateGame = (): { session: GameSession; prefixCommands: number } => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room-performance/4p.json', import.meta.url), 'utf8')) as RoomWorkload
  let session = new GameSession(rehydrateState(structuredClone(source.initial)))
  let prefixCommands = 0
  for (const command of source.commands) {
    if (session.state.round === 12) break
    if (command.type === 'restart') session = restart(session)
    else {
      const response = executeWorkloadCommand(session, command)
      assert(response.ok, `stock prefix rejected: ${response.error}`)
    }
    prefixCommands++
  }
  assert.equal(session.state.round, 12)
  const { state } = rehydrateState(serializeSessionSnapshot(session.state, session))
  for (const space of state.actionSpaces) space.takenBy = []
  for (const [index, player] of state.players.entries()) {
    const cards = CARD_SETS[index]!
    for (const id of cards.occupations) assert(getOccupationCard(id), id)
    for (const id of cards.minors) assert(getMinorImprovementCard(id), id)
    player.occupationPlayed = [...cards.occupations]
    player.minorPlayed = [...cards.minors]
    player.playedCards = [...cards.occupations, ...cards.minors]
    player.activeModifiers = []
    player.extraOccupationsFromCards = []
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
    player.cardStates = {}
    player.improvements = []
    player.resources = { ...player.resources, wood: 45, clay: 30, reed: 25, stone: 25, food: 150, grain: 10, vegetable: 6, sheep: 0, boar: 0, cattle: 0 }
    for (const worker of player.workers) {
      worker.isActive = true
      worker.isNewborn = false
      delete worker.supplyUse
    }
    player.rooms = 5
    player.houseType = 'wood'
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
    player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }, { row: 0, col: 3, stacks: [] }]
    player.stableTiles = [{ row: 2, col: 4 }]
    player.fenceSegments = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'].map(edge => ({ edge, type: 'fence' }))
    player.pastures = [{ id: 'pasture-2-4', size: 1, tiles: [{ row: 2, col: 4 }], stables: 1, animalType: null, animalCount: 0 }]
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    writeCardExtraData(player, cards.minors[1]!, 'cardFieldStacks', [{ crop: index === 2 ? 'wood' : 'vegetable', remaining: index === 2 ? 3 : 2 }])
    if (index === 2) writeCardExtraData(player, 'B048_ForestStone', 'foodCount', 2)
  }
  // Explicit preparation is a new undo boundary, not part of the preceding game.
  // Keep actual log/events/archive, discard the old two-worker command cursor.
  session.loadState(state)
  assertPrepared(session)
  // Match the consumer's fresh-session restoration boundary, including private
  // engine frame-id allocation, before capturing the recorded starting point.
  const prepared = serializeSessionSnapshot(session.state, session)
  session.dispose()
  session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(prepared))))
  assertPrepared(session)
  return { session, prefixCommands }
}

const selectCommand = (session: GameSession, response: SessionResponse): Command => {
  if (response.interaction.stateId === 'wait') {
    const { playerIndex: actor, request } = response.interaction
    if (request.kind === 'confirm-next-player') return { type: 'choice', actor: request.nextPlayerIndex, value: 'confirm' }
    if (request.kind === 'confirm-player-switch') return { type: 'choice', actor: request.fromPlayerIndex, value: 'confirm' }
    if (request.kind === 'feed') return { type: 'choice', actor, value: 'confirm', payload: { selections: [] } }
    if (request.kind === 'animal-reorg') return { type: 'choice', actor, value: 'confirm', payload: { zones: request.zones } }
    if (request.kind === 'choice' || request.kind === 'select-trigger') {
      // Prefer actual optional effects/payments; stop open-ended repeat menus.
      const options = request.options.filter(option => !('disabled' in option && option.disabled))
      const choice = options.find(option => option.value === '__done__') ??
        options.find(option => option.value !== '__skip__' && !option.value.startsWith('occupation:')) ?? options[0]
      assert(choice, 'empty choice')
      return { type: 'choice', actor, value: choice.value }
    }
    if (request.kind === 'farm-select') {
      const farm = request.farm
      if (farm.farmType === 'plow') return { type: 'selection', actor, payload: { tile: farm.selectableTiles[0] } }
      if (farm.farmType === 'room') {
        const tile = farm.selectableTiles.find(candidate => session.state.players[actor]!.roomTiles.some(room => Math.abs(room.row - candidate.row) + Math.abs(room.col - candidate.col) === 1))
        assert(tile, 'no adjacent room tile')
        return { type: 'selection', actor, payload: { rooms: [tile] } }
      }
      if (farm.farmType === 'stable') return { type: 'selection', actor, payload: { stables: farm.selectableTiles.slice(0, 1) } }
      if (farm.farmType === 'sow') return { type: 'selection', actor, payload: { crops: farm.selectableFields.slice(0, farm.maxSelections ?? 2).map(field => ({ ...field.tile, crop: field.allowedCrops[0] })) } }
      if (farm.farmType === 'fence') {
        for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
          const edges = [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]
          const player = session.state.players[actor]!
          const occupied = [...player.roomTiles, ...player.fields, ...player.pastures.flatMap(pasture => pasture.tiles)].some(tile => tile.row === row && tile.col === col)
          const existing = new Set(player.fenceSegments.map(segment => segment.edge))
          const additions = edges.filter(edge => !existing.has(edge))
          if (!occupied && additions.length > 0 && additions.length < 4 && existing.size + additions.length <= 15 && additions.every(edge => farm.selectableEdges.includes(edge))) return { type: 'selection', actor, payload: { edges: additions, extraWood: farm.extraWood ?? 0 } }
        }
      }
    }
    throw new Error(`Unhandled interaction ${JSON.stringify(request)}`)
  }
  const actor = session.state.currentPlayerIndex
  const availability = session.getActionAvailability(actor)
  const preferred = ['farmland', 'fencing', 'farm-expansion', 'house-redevelopment', 'farm-redevelopment', 'cultivation', 'grain-utilization', 'forest', 'copse', 'grove', 'clay-pit', 'hollow-4', 'reed-bank', 'fishing', 'traveling-players', 'day-laborer', 'grain-seeds', 'western-quarry', 'vegetable-seeds', 'eastern-quarry', 'resource-market-4', 'sheep-market', 'pig-market', 'cattle-market']
  const actionId = [...preferred, ...Object.keys(availability)].find(id => availability[id])
  assert(actionId, `no action round ${session.state.round} player ${actor}`)
  return { type: 'action', actor, actionId }
}

export const recordLateGameWorkload = () => {
  const prepared = prepareLateGame()
  let session = prepared.session
  const hookCalls: Record<string, number> = {}
  observeHooks(session, hookCalls)
  const initial = serializeSessionSnapshot(session.state, session)
  for (const player of initial.frame.players) assert(player.playedCardAnimalZones.length > 0)
  const commands: Command[] = []
  const rounds: Record<string, number> = {}
  const commandTypes: Record<string, number> = {}
  const pendingKinds: Record<string, number> = {}
  let paymentChoices = 0
  let peakSnapshotBytes = Buffer.byteLength(JSON.stringify(initial))
  let peakUndoDepth = 0
  let response = session.getState()
  const undone = new Set<number>()
  let restarted = false
  while (!session.state.gameOver && commands.length < 500) {
    let command = selectCommand(session, response)
    const round = session.state.round
    if (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      increment(pendingKinds, request.kind === 'farm-select' ? `farm-select:${request.farm.farmType}` : request.kind)
      if (request.kind === 'choice' && request.options.some(option => option.effectPreview?.kind === 'payment')) paymentChoices++
      if (request.kind === 'farm-select' && round <= 14 && !undone.has(round)) {
        undone.add(round)
        command = { type: round % 2 === 0 ? 'undoAction' : 'undoStep', actor: response.interaction.playerIndex }
      } else if (!restarted && round === 13 && request.kind === 'farm-select') {
        restarted = true
        command = { type: 'restart', actor: response.interaction.playerIndex }
      }
    }
    if (command.type === 'restart') {
      session = restart(session)
      observeHooks(session, hookCalls)
      response = session.getState()
    } else response = executeWorkloadCommand(session, command)
    assert(response.ok, `command ${commands.length} ${JSON.stringify(command)}: ${response.error}; interaction ${JSON.stringify(response.interaction)}`)
    commands.push(command)
    increment(rounds, String(round))
    increment(commandTypes, command.type)
    assertPrepared(session)
    const snapshot = serializeSessionSnapshot(session.state, session)
    peakSnapshotBytes = Math.max(peakSnapshotBytes, Buffer.byteLength(JSON.stringify(snapshot)))
    peakUndoDepth = Math.max(peakUndoDepth, snapshot.sessionCursor.history?.length ?? 0)
  }
  assert(session.state.gameOver, 'late-game transcript must finish')
  assert(commands.length >= 60)
  assert(restarted && undone.size === 3, JSON.stringify({ restarted, undone: [...undone], rounds, commands: commands.length }))
  assert(Object.keys(hookCalls).some(key => key.endsWith(':computeCosts')))
  assert(Object.keys(hookCalls).some(key => key.endsWith(':after')))
  const preparation = 'Explicit late-game pressure preparation, NOT a naturally played 5-worker game: replay stock seed563 4p trace to round12 preserving real histories, then set each player to 5 ordinary active workers, 5 connected wooden rooms, 2 fields, 1 fenced stable, 10 distinct played cards (5 occupations/5 minors), explicit placeholder hands and abundant resources. Reset pre-preparation undo cursor. All recorded rounds12-14 commands and final harvest/end-game pending (engine round15) use normal public session APIs, including undo, pending restart, farming, card payments and harvest.'
  const workload: RoomWorkload = { seed: 563, players: 4, preparation, initial, commands }
  const final = serializeSessionSnapshot(session.state, session)
  const finalCanonicalHash = createHash('sha256').update(canonicalJson(final)).digest('hex')
  const newEvents = session.state.events.slice(initial.state.events.length)
  const eventTypes: Record<string, number> = {}
  for (const event of newEvents) increment(eventTypes, event.type)
  assert((eventTypes['resource.paid'] ?? 0) > 0, 'actual payment events required')
  const shape = {
    preparation, prefixCommands: prepared.prefixCommands, rounds, commandTypes, pendingKinds,
    commands: commands.length, gameOver: session.state.gameOver, paymentChoices, eventTypes, finalCanonicalHash,
    familySizes: session.state.players.map(familySize), cards: CARD_SETS,
    finalPlayedCards: session.state.players.map(player => ({ occupations: player.occupationPlayed, minors: player.minorPlayed, majors: player.improvements, count: player.occupationPlayed.length + player.minorPlayed.length + player.improvements.length })),
    initialSnapshotBytes: Buffer.byteLength(JSON.stringify(initial)), peakSnapshotBytes, peakUndoDepth,
    history: { initial: { log: initial.state.log.length, events: initial.state.events.length, archive: initial.state.publicEventArchive.length }, final: { log: session.state.log.length, events: session.state.events.length, archive: session.state.publicEventArchive.length } },
    hookCalls, hookCallsScope: 'Recorder-only observation, including snapshot/display checks; not benchmark operation counts.',
  }
  session.dispose()
  return { workload, shape, final }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, output] = process.argv.slice(2)
  assert(mode === 'record' && output, 'usage: late-game-workload.ts record <output.json>')
  const { workload, shape } = recordLateGameWorkload()
  writeFileSync(output, `${JSON.stringify(workload)}\n`)
  writeFileSync(output.replace(/\.json$/, '.shape.json'), `${JSON.stringify(shape, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(shape, null, 2)}\n`)
}

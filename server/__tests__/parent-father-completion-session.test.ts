import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FatherParentCardId } from '../../shared/parents'
import { completeParentFatherAction } from '../../shared/parents/father-completion'
import type { DraftGameEvent, EventSink } from '../../shared/contract/events'
import type { ActionSpace, AnytimeAction, GameState, PlayerState } from '../../shared/contract/types'
import { countUnusedFarmyardSpaces, getAllTilePositions } from '../../shared/domain/farm'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const ACTION_ID = 'complete-parent-father'

const makeEventSink = (events: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    events.push(event)
  },
  emitMany: (nextEvents) => {
    events.push(...nextEvents)
  },
})

const setDeterministicHands = (state: GameState): void => {
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const setup = (father: FatherParentCardId, mutate?: (player: PlayerState, state: GameState) => void) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.enableParentCards = true
  state.phase = 'playing'
  state.parentSelection = null
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  setDeterministicHands(state)
  const player = state.players[0]!
  player.parentCards = { mother: 'PR01', father }
  mutate?.(player, state)
  session.loadState(state)
  return session
}

const anytimeIds = (resp: ReturnType<GameSession['getState']>): string[] =>
  resp.interaction.anytimeActions.map((action: AnytimeAction) => action.id)

const pasture = (
  id: string,
  row: number,
  col: number,
  animalType: 'sheep' | 'boar' | 'cattle' | null = null,
  animalCount = 0,
): PlayerState['pastures'][number] => ({
  id,
  size: 1,
  tiles: [{ row, col }],
  stables: 0,
  animalType,
  animalCount,
})

const numberedIds = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`)

const setPlayedCardCounts = (
  player: PlayerState,
  counts: { occupations?: number, minors?: number, majors?: number },
): void => {
  player.occupationPlayed = numberedIds('occ', counts.occupations ?? 0)
  player.minorPlayed = numberedIds('minor', counts.minors ?? 0)
  player.improvements = numberedIds('major', counts.majors ?? 0)
}

const setUnusedFarmyardSpaces = (player: PlayerState, unusedSpaces: number): void => {
  const tiles = getAllTilePositions()
  const usedCount = tiles.length - unusedSpaces
  player.rooms = 2
  player.roomTiles = tiles.slice(0, 2)
  player.fields = tiles.slice(2, usedCount).map(({ row, col }) => ({ row, col, stacks: [] }))
  player.stableTiles = []
  player.pastures = []
  player.farmTerrain = []
  player.farmyardSpaceStates = []
}

const auditFathers = ['PS01', 'PS02', 'PS03', 'PS04', 'PS05', 'PS06', 'PS07', 'PS08', 'PS09', 'PS10', 'PS11', 'PS12'] as const
const auditThresholds = {
  PS01: [2, 3, 5], PS02: [1, 2, 3], PS03: [1, 2, 3], PS04: [3, 4, 6],
  PS05: [1, 2, 3], PS06: [6, 8, 10], PS07: [2, 3, 4], PS08: [7, 5, 3],
  PS09: [2, 3, 4], PS10: [6, 9, 12], PS11: [3, 4, 5], PS12: [2, 3, 4],
} as const
const auditMinorDeck = ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife', 'A004_Baseboards']
const auditOccDeck = ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer', 'A103_Portmonger']
const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const auditSetup = (father: FatherParentCardId) => {
  const session = new GameSession(56125, undefined, { playerCount: 2, enableParentCards: true, parentSelectionSeed: 9002 })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources, food: 50 }
  }
  const others = auditFathers.filter((id) => id !== father)
  session.state.parentSelection!.candidates = {
    p1: { mother: ['PR10', 'PR01'], father: [father, others[0]!] },
    p2: { mother: ['PR12', 'PR02'], father: [others[1]!, others[2]!] },
  }
  expect(session.loadState(session.state).ok).toBe(true)
  expect(session.submitParentSelection(0, { mother: 'PR10', father }).ok).toBe(true)
  const response = session.submitParentSelection(1, { mother: 'PR12', father: others[1]! })
  expect(response.ok, response.error).toBe(true)
  expect(response.state.phase).toBe('playing')
  expect(response.interaction.stateId).toBe('idle')
  expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 50, wood: 1 })
  expect(response.state.players[1]!.resources).toEqual({ ...emptyResources, food: 50, clay: 1 })
  session.state.ordinaryCardDecks = { minor: [...auditMinorDeck], occupation: [...auditOccDeck] }
  return session
}

const auditFields = (player: PlayerState, count: number) => {
  player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
    .slice(0, count).map((tile) => ({ ...tile, stacks: [] }))
}

const auditPastures = (player: PlayerState, rows: Array<{ col: number; size?: number; animal?: 'sheep' | 'boar' | 'cattle'; count?: number }>) => {
  player.pastures = []
  player.fenceSegments = []
  player.resources.sheep = player.resources.boar = player.resources.cattle = 0
  for (const [index, entry] of rows.entries()) {
    const size = entry.size ?? 1
    const tiles = Array.from({ length: size }, (_, offset) => ({ row: 0, col: entry.col + offset }))
    player.pastures.push({ id: `pen-${index}`, tiles, size, stables: 0, animalType: entry.animal ?? null, animalCount: entry.count ?? 0 })
    const edges = [...tiles.flatMap((tile) => [`H-0-${tile.col}`, `H-1-${tile.col}`]), `V-0-${entry.col}`, `V-0-${entry.col + size}`]
    for (const edge of edges) if (!player.fenceSegments.some((segment) => segment.edge === edge)) player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })
    if (entry.animal) player.resources[entry.animal] += entry.count ?? 0
  }
}

const auditSetCount = (session: GameSession, father: FatherParentCardId, count: number) => {
  const player = session.state.players[0]!
  switch (father) {
    case 'PS01': auditFields(player, count); break
    case 'PS02': auditPastures(player, Array.from({ length: count }, (_, col) => ({ col }))); break
    case 'PS03': auditPastures(player, ['sheep', 'boar', 'cattle'].slice(0, count).map((animal, col) => ({ col, animal: animal as 'sheep' | 'boar' | 'cattle', count: 1 }))); break
    case 'PS04': auditPastures(player, [{ col: 0, size: 3, animal: 'sheep', count }]); break
    case 'PS05':
      player.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1'].slice(0, count)
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => !player.improvements.includes(id))
      break
    case 'PS06':
      player.occupationPlayed = auditOccDeck.slice(0, Math.min(4, count - 2))
      player.minorPlayed = auditMinorDeck.slice(0, Math.max(0, count - 6))
      break
    case 'PS07':
      player.occupationPlayed = auditOccDeck.slice(0, count)
      player.resources.grain = 4
      player.resources.vegetable = 2
      auditFields(player, 4)
      break
    case 'PS08': auditFields(player, 13 - count); break
    case 'PS09': player.stableTiles = Array.from({ length: count }, (_, col) => ({ row: 0, col })); break
    case 'PS10':
      if (count === 4) auditPastures(player, [{ col: 0 }])
      else if (count === 8) auditPastures(player, [{ col: 0, size: 3 }])
      else if (count === 10) auditPastures(player, [{ col: 0 }, { col: 1 }, { col: 2 }])
      else auditPastures(player, [{ col: 0, size: 2 }, ...Array.from({ length: (count - 6) / 3 }, (_, index) => ({ col: index + 2 }))])
      expect(player.fenceSegments).toHaveLength(count)
      break
    case 'PS11': player.resources.grain = count; break
    case 'PS12': player.resources.vegetable = count; break
  }
  session.state.ordinaryCardDecks.minor = session.state.ordinaryCardDecks.minor.filter((id) => !player.minorPlayed.includes(id))
  session.state.ordinaryCardDecks.occupation = session.state.ordinaryCardDecks.occupation.filter((id) => !player.occupationPlayed.includes(id))
}

const auditRestore = (session: GameSession) => {
  const restored = new GameSession(56125, undefined, { playerCount: 2 })
  const saved = auditClone(serializeSessionSnapshot(session.state, session))
  const response = restored.loadState(rehydrateState(saved))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  expect(auditClone(response.state.players.map((player) => ({ ...player, farmTerrain: player.farmTerrain ?? [] })))).toEqual(
    auditClone(session.state.players.map((player) => ({ ...player, farmTerrain: player.farmTerrain ?? [] }))),
  )
  return restored
}

const auditClaim = (session: GameSession, father: FatherParentCardId, tier: number) => {
  let response = session.takeAnytimeAction(0, ACTION_ID)
  expect(response.ok, response.error).toBe(true)
  const choice = `${father}:${tier}${father === 'PS04' ? `:${['wood', 'clay', 'reed'].slice(0, tier).join(',')}` : ''}`
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    expect(response.interaction.request.options.map((option) => option.value)).toContain(choice)
    response = session.resolveChoice(0, choice)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const auditCompletePending = (session: GameSession, father: FatherParentCardId, tier: number) => {
  if (father === 'PS03') {
    const choices = Object.values(session.state.ordinaryCardDrawChoices)
    expect(choices.map((choice) => choice.cardType).sort()).toEqual(tier === 3 ? ['minor', 'occupation'] : [tier === 1 ? 'minor' : 'occupation'])
    for (const choice of choices) {
      expect(choice.candidates).toEqual((choice.cardType === 'minor' ? auditMinorDeck : auditOccDeck).slice(0, 3))
      const response = session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[1]!)
      expect(response.ok, response.error).toBe(true)
      expect(response.privateEvents).toContainEqual(expect.objectContaining({ type: 'private.handChanged', recipientPlayerId: 'p1', sourceCard: 'PS03', cardIds: ['__test_placeholder__', choice.candidates[1]] }))
    }
  } else if (father === 'PS07') {
    const response = session.commitSelectionChoice(0, { crops: session.state.players[0]!.fields.slice(0, tier).map((field) => ({ row: field.row, col: field.col, crop: 'grain' as const })) })
    expect(response.ok, response.error).toBe(true)
  } else if (father === 'PS09' || father === 'PS10') {
    const prompt = session.getState()
    expect(prompt.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    let remaining = tier
    const zones = prompt.interaction.request.zones.map((zone) => {
      const animalCount = Math.min(remaining, zone.capacity)
      remaining -= animalCount
      return { id: zone.id, zoneType: zone.zoneType, animalType: animalCount > 0 ? father === 'PS09' ? 'sheep' : 'boar' : null, animalCount }
    })
    expect(remaining).toBe(0)
    expect(session.resolveChoice(0, 'confirm', { zones }).ok).toBe(true)
  }
  expect(session.getState().interaction.stateId).toBe('idle')
}

const auditAssertReward = (session: GameSession, father: FatherParentCardId, tier: number, before: PlayerState) => {
  const expected = { ...before.resources }
  switch (father) {
    case 'PS01': expected.stone += tier; break
    case 'PS02': expected[before.houseType] += tier; break
    case 'PS03':
      expect(session.state.players[0]!.minorHand).toEqual(tier === 2 ? before.minorHand : [...before.minorHand, auditMinorDeck[1]])
      expect(session.state.players[0]!.occupationHand).toEqual(tier === 1 ? before.occupationHand : [...before.occupationHand, auditOccDeck[1]])
      break
    case 'PS04': for (const resource of (['wood', 'clay', 'reed'] as const).slice(0, tier)) expected[resource] += 1; break
    case 'PS05': expected[(['wood', 'clay', 'reed'] as const)[tier - 1]!] += tier; break
    case 'PS06': expected.food += [1, 3, 5][tier - 1]!; break
    case 'PS07':
      expected.grain -= tier
      expect(session.state.players[0]!.fields.map((field) => field.stacks)).toEqual(Array.from({ length: 4 }, (_, index) => index < tier ? [{ kind: 'grain', remaining: 3 }] : []))
      expect(session.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(1)
      break
    case 'PS08': if (tier !== 2) expected.grain += 1; if (tier !== 1) expected.vegetable += 1; break
    case 'PS09': expected.sheep += tier; break
    case 'PS10': expected.boar += tier; break
    case 'PS11': expected.clay += tier; break
    case 'PS12': expected.food += tier + 1; break
  }
  expect(session.state.players[0]!.resources).toEqual(expected)
}

const auditAssertCompleted = (session: GameSession, father: FatherParentCardId, tier: number) => {
  const response = session.getState()
  expect(response.state.players[0]!.cardStates[father]).toMatchObject({ infobox: 'Completed', extraData: { fatherCompletedTier: tier } })
  expect(response.state.players[0]!.parentCards.father).toBe(father)
  expect(response.state.log.filter((entry) => entry.key === 'log.cardInfoboxChanged' && entry.params?.cardId === father))
    .toEqual([{ key: 'log.cardInfoboxChanged', params: { cardId: father, text: 'Completed' } }])
  expect(response.state.events.filter((event) => event.type === 'card.stateChanged' && event.cardId === father && event.key === 'fatherCompletedTier'))
    .toEqual([expect.objectContaining({ actorPlayerId: 'p1', targetPlayerId: 'p1', value: tier })])
  expect(response.state.events.filter((event) => event.type === 'card.infoboxChanged' && event.cardId === father))
    .toEqual([expect.objectContaining({ actorPlayerId: 'p1', targetPlayerId: 'p1', text: 'Completed' })])
  for (const viewer of ['p1', 'p2', null]) {
    const payload = session.buildSyncPayload(response, viewer)
    expect(payload.state.players[0]!.cardStates[father]?.infobox).toBe('Completed')
    expect(payload.scores![0]!.categories.find((category) => category.key === 'parentCards')?.entries).toEqual([{ type: 'parentCard', cardId: 'PR10', score: 0.7 }])
  }
  const before = auditClone(response.state)
  expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
  expect(auditClone(session.state)).toEqual(before)
  expect(session.resolveChoice(0, `${father}:${tier}`).ok).toBe(false)
  expect(auditClone(session.state)).toEqual(before)
}

const auditFinish = (session: GameSession) => {
  session.state.round = 14
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  expect(session.loadState(session.state).ok).toBe(true)
  let response = session.performRoundEnd()
  for (let step = 0; step < 30 && !response.state.gameOver; step++) {
    expect(response.ok, response.error).toBe(true)
    const request = response.interaction.request
    if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'choice') {
      expect(request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    } else if (request.kind === 'animal-reorg') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones: request.zones.map((zone) => ({ id: zone.id, zoneType: zone.zoneType, animalType: zone.animalType, animalCount: zone.animalCount })) })
    } else throw new Error(`unexpected final interaction: ${JSON.stringify(response.interaction)}`)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.gameOver).toBe(true)
  expect(response.interaction.stateId).toBe('gameover')
  expect(response.scores![0]!.categories.find((category) => category.key === 'parentCards')?.entries).toEqual([{ type: 'parentCard', cardId: 'PR10', score: 0.7 }])
  expect(response.scores![0]!.total).toBeCloseTo(response.scores![0]!.categories.reduce((sum, category) => sum + category.total, 0))
  expect(session.buildSyncPayload(response, null).scores).toEqual(response.scores)
}

describe('Parents batch 2 father printed-rule audit', () => {
  it.each(auditFathers.flatMap((father) => [1, 2, 3].map((tier) => ({ father, tier }))))(
    '$father tier $tier grants only that printed reward once and survives restore and final scoring', ({ father, tier }) => {
      let session = auditSetup(father)
      auditSetCount(session, father, auditThresholds[father][tier - 1]!)
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state)
      auditClaim(session, father, tier)
      if (['PS03', 'PS07', 'PS09', 'PS10'].includes(father)) session = auditRestore(session)
      auditCompletePending(session, father, tier)
      auditAssertReward(session, father, tier, before.players[0]!)
      expect(session.state.players[1]).toEqual(before.players[1])
      expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
      expect(auditClone(session.state.actionSpaces)).toEqual(before.actionSpaces)
      expect(session.state.players[0]!.fenceSegments).toEqual(before.players[0]!.fenceSegments)
      expect(session.state.players[0]!.stableTiles).toEqual(before.players[0]!.stableTiles)
      expect(session.state.players[0]!.occupationPlayed).toEqual(before.players[0]!.occupationPlayed)
      expect(session.state.players[0]!.minorPlayed).toEqual(before.players[0]!.minorPlayed)
      expect(session.state.players[0]!.improvements).toEqual(before.players[0]!.improvements)
      auditAssertCompleted(session, father, tier)
      session = auditRestore(session)
      auditAssertCompleted(session, father, tier)
      auditFinish(session)
    },
  )

  it.each(auditFathers.flatMap((father) => [1, 2, 3].map((tier) => ({ father, tier }))))(
    '$father tier $tier is unavailable below its current threshold', ({ father, tier }) => {
      const session = auditSetup(father)
      const threshold = auditThresholds[father][tier - 1]!
      const below = father === 'PS08' ? threshold + 1 : father === 'PS10' ? [4, 8, 10][tier - 1]! : threshold - 1
      auditSetCount(session, father, auditThresholds[father][2])
      auditSetCount(session, father, below)
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state)
      const response = session.takeAnytimeAction(0, ACTION_ID)
      if (tier === 1) {
        expect(response.ok).toBe(false)
        expect(auditClone(session.state)).toEqual(before)
      } else {
        expect(response.ok, response.error).toBe(true)
        if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
          expect(response.interaction.request.options.every((option) => !option.value.startsWith(`${father}:${tier}`))).toBe(true)
          const waiting = auditClone(session.state)
          expect(session.resolveChoice(0, `${father}:${tier}${father === 'PS04' ? ':wood,clay,reed' : ''}`).ok).toBe(false)
          expect(auditClone(session.state)).toEqual(waiting)
        } else {
          expect(response.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier ?? 1).toBeLessThan(tier)
        }
      }
    },
  )

  it.each(auditFathers)('%s can defer a low-tier reward and later choose the high tier', (father) => {
    const session = auditSetup(father)
    auditSetCount(session, father, auditThresholds[father][0])
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier).toBeUndefined()
    const acted = session.takeAction(0, 'day-laborer')
    expect(acted.ok, acted.error).toBe(true)
    expect(acted.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier).toBeUndefined()
    if (acted.interaction.request.kind === 'confirm-next-player') expect(session.resolveChoice(acted.interaction.playerIndex, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    const pending = session.getState().interaction
    if (pending.request.kind === 'confirm-next-player') expect(session.resolveChoice(pending.playerIndex, 'confirm').ok).toBe(true)
    expect(session.state.currentPlayerIndex).toBe(0)
    auditSetCount(session, father, auditThresholds[father][2])
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state.players[0]!)
    auditClaim(session, father, 3)
    auditCompletePending(session, father, 3)
    auditAssertReward(session, father, 3, before)
    auditAssertCompleted(session, father, 3)
  })

  it.each(auditFathers.flatMap((father) => [1, 2].map((tier) => ({ father, tier }))))(
    '$father may choose tier $tier even when all three thresholds are met', ({ father, tier }) => {
      const session = auditSetup(father)
      auditSetCount(session, father, auditThresholds[father][2])
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state.players[0]!)
      auditClaim(session, father, tier)
      auditCompletePending(session, father, tier)
      auditAssertReward(session, father, tier, before)
      auditAssertCompleted(session, father, tier)
    },
  )
})

describe('Parents batch 2 father interaction boundaries', () => {
  it.each(auditFathers)('%s rejects a foreign tier and wrong responder then permits legal retry', (father) => {
    const session = auditSetup(father)
    auditSetCount(session, father, auditThresholds[father][2])
    expect(session.loadState(session.state).ok).toBe(true)
    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok, prompt.error).toBe(true)
    expect(prompt.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    const choice = `${father}:3${father === 'PS04' ? ':wood,clay,reed' : ''}`
    const before = auditClone(session.state)
    expect(session.resolveChoice(1, choice).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.resolveChoice(0, father === 'PS01' ? 'PS12:3' : 'PS01:3').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.getState().interaction).toEqual(prompt.interaction)
    const retryBefore = auditClone(session.state.players[0]!)
    const response = session.resolveChoice(0, choice)
    expect(response.ok, response.error).toBe(true)
    auditCompletePending(session, father, 3)
    auditAssertReward(session, father, 3, retryBefore)
    auditAssertCompleted(session, father, 3)
  })

  it.each((['clay', 'stone'] as const).flatMap((houseType) => [1, 2, 3].map((tier) => ({ houseType, tier }))))(
    'PS02 uses the current $houseType house material for tier $tier', ({ houseType, tier }) => {
      const session = auditSetup('PS02')
      auditSetCount(session, 'PS02', tier)
      session.state.players[0]!.houseType = houseType
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state.players[0]!)
      auditClaim(session, 'PS02', tier)
      auditAssertReward(session, 'PS02', tier, before)
      auditAssertCompleted(session, 'PS02', tier)
    },
  )

  it.each([1, 2, 3])('PS03 tier %i draws private candidates, rejects invalid picks, and restores halfway', (tier) => {
    let session = auditSetup('PS03')
    auditSetCount(session, 'PS03', 3)
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS03', tier)
    session = auditRestore(session)
    const choices = Object.values(session.state.ordinaryCardDrawChoices)
    expect(choices).toHaveLength(tier === 3 ? 2 : 1)
    for (const [index, choice] of choices.entries()) {
      const before = auditClone(session.state)
      expect(session.takeAction(0, 'forest').ok).toBe(false)
      expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
      expect(session.resolveOrdinaryCardDrawChoice(1, choice.id, choice.candidates[0]!).ok).toBe(false)
      expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, 'not-a-candidate').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
      for (const viewer of ['p1', 'p2', null]) {
        const payload = session.buildSyncPayload(session.getState(), viewer)
        if (viewer === 'p1') expect(payload.state.ordinaryCardDrawChoices[choice.id]!.candidates).toEqual(choice.candidates)
        else for (const candidate of choice.candidates) expect(JSON.stringify(payload)).not.toContain(candidate)
      }
      const response = session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[1]!)
      expect(response.ok, response.error).toBe(true)
      const hand = choice.cardType === 'minor' ? response.state.players[0]!.minorHand : response.state.players[0]!.occupationHand
      expect(hand).toEqual(['__test_placeholder__', choice.candidates[1]])
      expect(response.state.ordinaryCardDecks[choice.cardType]).toEqual((choice.cardType === 'minor' ? auditMinorDeck : auditOccDeck).slice(3))
      for (const viewer of ['p2', null]) for (const candidate of choice.candidates) expect(JSON.stringify(session.buildSyncPayload(response, viewer))).not.toContain(candidate)
      const selected = auditClone(session.state)
      expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[0]!).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(selected)
      if (index === 0) session = auditRestore(session)
    }
    expect(session.state.ordinaryCardDrawChoices).toEqual({})
    auditAssertCompleted(session, 'PS03', tier)
  })

  it.each([1, 2, 3].flatMap((tier) => [0, 1, 2, 4].flatMap((minor) => [0, 1, 2, 4].map((occupation) => ({ tier, minor, occupation }))))) (
    'PS03 tier $tier with minor=$minor occupation=$occupation draws only remaining cards and completes once', ({ tier, minor, occupation }) => {
      let session = auditSetup('PS03')
      auditSetCount(session, 'PS03', tier)
      session.state.ordinaryCardDecks = { minor: auditMinorDeck.slice(0, minor), occupation: auditOccDeck.slice(0, occupation) }
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state)
      auditClaim(session, 'PS03', tier)
      session = auditRestore(session)
      const choices = Object.values(session.state.ordinaryCardDrawChoices)
      const types = (['minor', 'occupation'] as const).filter((type) =>
        (tier === 3 || (tier === 1 ? type === 'minor' : type === 'occupation')) && before.ordinaryCardDecks[type].length > 0,
      )
      expect(choices.map((choice) => choice.cardType)).toEqual(types)
      for (const choice of choices) {
        expect(choice.candidates).toEqual(before.ordinaryCardDecks[choice.cardType].slice(0, 3))
        for (const viewer of ['p1', 'p2', null]) {
          const payload = session.buildSyncPayload(session.getState(), viewer)
          if (viewer === 'p1') expect(payload.state.ordinaryCardDrawChoices[choice.id]!.candidates).toEqual(choice.candidates)
          else for (const candidate of choice.candidates) expect(JSON.stringify(payload)).not.toContain(candidate)
        }
        const waiting = auditClone(session.state)
        expect(session.resolveOrdinaryCardDrawChoice(1, choice.id, choice.candidates[0]!).ok).toBe(false)
        expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, 'not-a-candidate').ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        const response = session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[0]!)
        expect(response.ok, response.error).toBe(true)
        expect(response.privateEvents).toContainEqual(expect.objectContaining({ type: 'private.handChanged', recipientPlayerId: 'p1', sourceCard: 'PS03' }))
        const selected = auditClone(session.state)
        expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[0]!).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(selected)
        session = auditRestore(session)
      }
      for (const type of ['minor', 'occupation'] as const) {
        expect(session.state.ordinaryCardDecks[type]).toEqual(types.includes(type) ? before.ordinaryCardDecks[type].slice(3) : before.ordinaryCardDecks[type])
        const hand = type === 'minor' ? 'minorHand' : 'occupationHand'
        expect(session.state.players[0]![hand]).toEqual(types.includes(type) ? ['__test_placeholder__', before.ordinaryCardDecks[type][0]] : ['__test_placeholder__'])
      }
      expect(session.state.ordinaryCardDrawChoices).toEqual({})
      expect(session.getState().interaction.stateId).toBe('idle')
      expect(session.state.players[0]!.resources).toEqual(before.players[0]!.resources)
      expect(session.state.players[0]!.pastures).toEqual(before.players[0]!.pastures)
      expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
      expect(session.state.players[1]).toEqual(before.players[1])
      auditAssertCompleted(session, 'PS03', tier)
    },
  )

  it('PS03 counts animals housed as a pet and in an unfenced stable', () => {
    const session = auditSetup('PS03')
    const player = session.state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = player.resources.sheep = 1
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = { '0-0': 'boar' }
    player.resources.boar = 1
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS03', 2)
    auditCompletePending(session, 'PS03', 2)
    auditAssertCompleted(session, 'PS03', 2)
  })

  it('PS04 does not add different animal types to meet the same-type threshold', () => {
    const session = auditSetup('PS04')
    auditPastures(session.state.players[0]!, [{ col: 0, animal: 'sheep', count: 2 }, { col: 1, animal: 'boar', count: 2 }])
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it.each((['boar', 'cattle'] as const).flatMap((animal) => [1, 2, 3].map((tier) => ({ animal, tier }))))(
    'PS04 tier $tier counts $animal without consuming it', ({ animal, tier }) => {
      const session = auditSetup('PS04')
      auditPastures(session.state.players[0]!, [{ col: 0, size: 3, animal, count: auditThresholds.PS04[tier - 1]! }])
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state.players[0]!)
      auditClaim(session, 'PS04', tier)
      auditAssertReward(session, 'PS04', tier, before)
      expect(session.state.players[0]!.pastures).toEqual(before.pastures)
      auditAssertCompleted(session, 'PS04', tier)
    },
  )

  it.each(['wood,wood', 'wood,food', 'wood,grain', 'wood,clay,reed', 'stone'])('PS04 rejects invalid two-resource selection %s and permits retry', (resources) => {
    const session = auditSetup('PS04')
    auditSetCount(session, 'PS04', 4)
    expect(session.loadState(session.state).ok).toBe(true)
    const response = session.takeAnytimeAction(0, ACTION_ID)
    expect(response.ok, response.error).toBe(true)
    const before = auditClone(session.state)
    expect(session.resolveChoice(0, `PS04:2:${resources}`).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.resolveChoice(0, 'PS04:2:wood,clay').ok).toBe(true)
    auditAssertReward(session, 'PS04', 2, before.players[0]!)
    auditAssertCompleted(session, 'PS04', 2)
  })

  it.each(['wood', 'clay', 'reed', 'stone', 'wood,clay', 'wood,reed', 'wood,stone', 'clay,reed', 'clay,stone', 'reed,stone', 'wood,clay,reed', 'wood,clay,stone', 'wood,reed,stone', 'clay,reed,stone'])(
    'PS04 grants exactly the chosen distinct building resources %s', (resources) => {
      const session = auditSetup('PS04')
      auditSetCount(session, 'PS04', 6)
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state.players[0]!)
      const selected = resources.split(',')
      expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(true)
      expect(session.resolveChoice(0, `PS04:${selected.length}:${resources}`).ok).toBe(true)
      const expected = { ...before.resources }
      for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) if (selected.includes(resource)) expected[resource] += 1
      expect(session.state.players[0]!.resources).toEqual(expected)
      expect(session.state.players[0]!.pastures).toEqual(before.pastures)
      auditAssertCompleted(session, 'PS04', selected.length)
    },
  )

  it('PS06 counts major improvements and both parents toward six cards', () => {
    const session = auditSetup('PS06')
    const player = session.state.players[0]!
    player.occupationPlayed = ['A100_Curator']
    player.minorPlayed = ['A001_Shelter']
    player.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => !player.improvements.includes(id))
    session.state.ordinaryCardDecks = { minor: auditMinorDeck.slice(1), occupation: auditOccDeck.slice(1) }
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state.players[0]!)
    auditClaim(session, 'PS06', 1)
    auditAssertReward(session, 'PS06', 1, before)
    auditAssertCompleted(session, 'PS06', 1)
  })

  it('PS05 excludes minor improvements and occupations while PS06 excludes unplayed hands', () => {
    for (const father of ['PS05', 'PS06'] as const) {
      const session = auditSetup(father)
      const player = session.state.players[0]!
      if (father === 'PS05') {
        player.minorPlayed = [...auditMinorDeck]
        player.occupationPlayed = [...auditOccDeck]
      } else {
        player.minorHand = auditMinorDeck.slice(1)
        player.occupationHand = auditOccDeck.slice(1)
        player.minorPlayed = [auditMinorDeck[0]!]
        player.occupationPlayed = [auditOccDeck[0]!]
        player.improvements = ['Major_Fireplace1']
        session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
      }
      session.state.ordinaryCardDecks = { minor: [], occupation: [] }
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state)
      expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    }
  })

  it.each([1, 2, 3])('PS07 tier %i rejects over-limit, occupied and unfunded sowing before a mixed-crop retry', (tier) => {
    const session = auditSetup('PS07')
    auditSetCount(session, 'PS07', tier + 1)
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS07', tier)
    const fields = session.state.players[0]!.fields
    for (const crops of [
      fields.slice(0, tier + 1).map((field) => ({ row: field.row, col: field.col, crop: 'grain' })),
      [{ ...session.state.players[0]!.roomTiles[0]!, crop: 'grain' }],
      [{ row: fields[0]!.row, col: fields[0]!.col, crop: 'wood' }],
    ]) {
      const before = auditClone(session.state)
      const response = session.commitSelectionChoice(0, { crops: crops as Parameters<GameSession['commitSelectionChoice']>[1]['crops'] })
      expect(response.ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
      expect(response.interaction.request.farm.farmType).toBe('sow')
    }
    const before = auditClone(session.state)
    const crops = fields.slice(0, tier).map((field, index) => ({ row: field.row, col: field.col, crop: index === 0 ? 'vegetable' as const : 'grain' as const }))
    expect(session.commitSelectionChoice(1, { crops }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const response = session.commitSelectionChoice(0, { crops })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, vegetable: 1, grain: 5 - tier })
    expect(response.state.players[0]!.fields.slice(0, tier).map((field) => field.stacks)).toEqual([
      [{ kind: 'vegetable', remaining: 2 }], ...Array.from({ length: tier - 1 }, () => [{ kind: 'grain', remaining: 3 }]),
    ])
    expect(response.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(1)
    expect(response.state.players[1]).toEqual(before.players[1])
    auditAssertCompleted(session, 'PS07', tier)
  })

  it.each([1, 2, 3])('PS07 tier %i rejects an already sown field and insufficient seed then permits retry', (tier) => {
    const session = auditSetup('PS07')
    auditSetCount(session, 'PS07', tier + 1)
    session.state.players[0]!.resources.grain = 0
    session.state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS07', tier)
    const before = auditClone(session.state)
    const fields = session.state.players[0]!.fields
    for (const crop of [
      { row: fields[0]!.row, col: fields[0]!.col, crop: 'vegetable' as const },
      { row: fields[1]!.row, col: fields[1]!.col, crop: 'grain' as const },
    ]) {
      expect(session.commitSelectionChoice(0, { crops: [crop] }).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    }
    expect(session.commitSelectionChoice(0, { crops: [{ row: fields[1]!.row, col: fields[1]!.col, crop: 'vegetable' }] }).ok).toBe(true)
    expect(session.state.players[0]!.resources.vegetable).toBe(1)
    expect(session.state.players[0]!.resources.grain).toBe(0)
    expect(session.state.players[0]!.fields[0]).toEqual(before.players[0]!.fields[0])
    expect(session.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(1)
    auditAssertCompleted(session, 'PS07', tier)
  })

  it.each([2, 3])('PS07 tier %i permits sowing only one field', (tier) => {
    const session = auditSetup('PS07')
    auditSetCount(session, 'PS07', tier + 1)
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS07', tier)
    const field = session.state.players[0]!.fields[0]!
    const response = session.commitSelectionChoice(0, { crops: [{ row: field.row, col: field.col, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
    expect(response.state.players[0]!.fields.filter((entry) => entry.stacks.length > 0)).toHaveLength(1)
    auditAssertCompleted(session, 'PS07', tier)
  })

  it.each([1, 2, 3])('PS07 tier %i can decline sowing after restoring the choice', (tier) => {
    let session = auditSetup('PS07')
    auditSetCount(session, 'PS07', tier + 1)
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS07', tier)
    session = auditRestore(session)
    const before = auditClone(session.state)
    expect(session.getState().interaction.request.farm.minSelections).toBe(0)
    expect(session.commitSelectionChoice(1, { crops: [] }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const response = session.commitSelectionChoice(0, { crops: [] })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(response.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    expect(response.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(auditClone(response.state.actionSpaces)).toEqual(before.actionSpaces)
    expect(response.state.players[1]).toEqual(before.players[1])
    auditAssertCompleted(session, 'PS07', tier)
    session = auditRestore(session)
    const completed = auditClone(session.state)
    expect(session.commitSelectionChoice(0, { crops: [] }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(completed)
    auditAssertCompleted(session, 'PS07', tier)
  })

  it.each([false, true])('PS07 triggers Field Spade only for actual sowing (sow=%s)', (sow) => {
    let session = auditSetup('PS07')
    auditSetCount(session, 'PS07', 3)
    const player = session.state.players[0]!
    player.minorPlayed = ['E079_FieldSpade']
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS07', 2)
    session = auditRestore(session)
    const before = auditClone(session.state)
    const field = before.players[0]!.fields[0]!
    const response = session.commitSelectionChoice(0, {
      crops: sow ? [{ row: field.row, col: field.col, crop: 'grain' }] : [],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toEqual({
      ...before.players[0]!.resources,
      grain: sow ? 3 : 4,
      stone: sow ? 1 : 0,
    })
    expect(response.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(sow ? 1 : 0)
    expect(response.state.players[0]!.fields.filter((entry) => entry.stacks.length > 0)).toHaveLength(sow ? 1 : 0)
    expect(response.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(auditClone(response.state.actionSpaces)).toEqual(before.actionSpaces)
    expect(response.state.players[1]).toEqual(before.players[1])
    auditAssertCompleted(session, 'PS07', 2)
    session = auditRestore(session)
    expect(session.state.players[0]!.resources).toEqual(response.state.players[0]!.resources)
    auditAssertCompleted(session, 'PS07', 2)
  })

  it.each([1, 2, 3].flatMap((tier) => ['no-fields', 'no-seeds'].map((condition) => ({ tier, condition }))))(
    'PS07 tier $tier can complete when there are $condition', ({ tier, condition }) => {
      let session = auditSetup('PS07')
      auditSetCount(session, 'PS07', tier + 1)
      const player = session.state.players[0]!
      if (condition === 'no-fields') player.fields = []
      else { player.resources.grain = 0; player.resources.vegetable = 0 }
      expect(session.loadState(session.state).ok).toBe(true)
      const before = auditClone(session.state)
      const response = auditClaim(session, 'PS07', tier)
      expect(response.interaction.stateId).toBe('idle')
      expect(response.state.players[0]!.resources).toEqual(before.players[0]!.resources)
      expect(response.state.players[0]!.fields).toEqual(before.players[0]!.fields)
      expect(response.state.players[0]!.workers).toEqual(before.players[0]!.workers)
      expect(auditClone(response.state.actionSpaces)).toEqual(before.actionSpaces)
      expect(response.state.players[1]).toEqual(before.players[1])
      expect(response.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(0)
      session = auditRestore(session)
      auditAssertCompleted(session, 'PS07', tier)
    },
  )

  it('PS08 counts overlapping pasture and stable as one used tile', () => {
    const session = auditSetup('PS08')
    const player = session.state.players[0]!
    auditFields(player, 5)
    auditPastures(player, [{ col: 4 }])
    player.fields = player.fields.filter((field) => field.col !== 4)
    player.stableTiles = [{ row: 0, col: 4 }]
    player.pastures[0]!.stables = 1
    expect(countUnusedFarmyardSpaces(player)).toBe(8)
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    session.state.players[0]!.fields.push({ row: 1, col: 1, stacks: [] })
    expect(countUnusedFarmyardSpaces(session.state.players[0]!)).toBe(7)
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, 'PS08', 1)
    expect(session.state.players[0]!.resources.grain).toBe(1)
  })

  it.each((['PS09', 'PS10'] as const).flatMap((father) => [1, 2, 3].flatMap((tier) =>
    (['house', 'cook', 'release'] as const).map((mode) => ({ father, tier, mode }))),
  ))('$father tier $tier can $mode its animals without extra harvest or breeding', ({ father, tier, mode }) => {
    let session = auditSetup(father)
    auditSetCount(session, father, auditThresholds[father][tier - 1]!)
    const player = session.state.players[0]!
    const animal = father === 'PS09' ? 'sheep' : 'boar'
    player.fields = [{ row: 2, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] }]
    if (mode === 'house') {
      if (father === 'PS09') {
        auditPastures(player, [{ col: 0, size: 4, animal, count: 2 }])
        player.pastures[0]!.stables = player.stableTiles.length
      } else {
        player.stableTiles = [{ row: 0, col: 0 }]
        player.pastures[0]!.stables = 1
        player.pastures[0]!.animalType = animal
        player.pastures[0]!.animalCount = 2
        player.resources[animal] = 2
      }
    } else if (mode === 'cook') {
      player.improvements = ['Major_Fireplace1']
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
    } else {
      player.houseAnimalType = 'cattle'
      player.houseAnimalCount = 1
      player.resources.cattle = 1
      for (const pen of player.pastures) {
        pen.animalType = 'cattle'
        pen.animalCount = pen.size * 2
        player.resources.cattle += pen.animalCount
      }
      player.stableAnimals = Object.fromEntries(player.stableTiles.map((tile) => [`${tile.row}-${tile.col}`, 'cattle' as const]))
      player.resources.cattle += player.stableTiles.length
    }
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    auditClaim(session, father, tier)
    session = auditRestore(session)
    const prompt = session.getState()
    expect(prompt.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    const waiting = auditClone(session.state)
    expect(session.resolveChoice(1, 'confirm', { zones: [] }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(waiting)
    if (mode === 'cook') {
      const exchange = session.takeAnytimeAction(0, 'exchange')
      expect(exchange.ok, exchange.error).toBe(true)
      const option = exchange.interaction.request.options.find((entry) => entry.labelParams?.resource === animal || JSON.stringify(entry).includes(animal))!
      expect(option).toBeDefined()
      const cooked = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=${tier}`)
      expect(cooked.ok, cooked.error).toBe(true)
      if (cooked.interaction.stateId === 'wait' && cooked.interaction.request.kind === 'animal-reorg') {
        expect(session.resolveChoice(0, 'confirm', { zones: [] }).ok).toBe(true)
      }
    } else {
      const zones = prompt.interaction.request.zones.map((zone) => ({
        id: zone.id, zoneType: zone.zoneType, animalType: zone.animalType,
        animalCount: zone.animalCount + (mode === 'house' && zone.id === 'pen-0' ? tier : 0),
      }))
      const invalid = zones.map((zone, index) => index === 0 ? { ...zone, animalType: animal, animalCount: 999 } : zone)
      expect(session.resolveChoice(0, 'confirm', { zones: invalid }).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(waiting)
      const response = session.resolveChoice(0, 'confirm', { zones })
      expect(response.ok, response.error).toBe(true)
    }
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.state.players[0]!.resources).toEqual({
      ...before.players[0]!.resources,
      [animal]: mode === 'house' ? 2 + tier : 0,
      food: before.players[0]!.resources.food + (mode === 'cook' ? tier * 2 : 0),
    })
    expect(session.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.harvestBreedSummary).toEqual(before.harvestBreedSummary)
    expect(session.state.events.filter((event) => event.type.startsWith('harvest.'))).toEqual(before.events.filter((event) => event.type.startsWith('harvest.')))
    expect(session.state.round).toBe(1)
    expect(session.state.roundPhase).toBe('work')
    expect(session.state.log.length).toBeGreaterThan(before.log.length)
    auditAssertCompleted(session, father, tier)
  })

  it.each(['PS11', 'PS12'] as const)('%s ignores crops on fields and uses only current personal supply', (father) => {
    const session = auditSetup(father)
    const crop = father === 'PS11' ? 'grain' : 'vegetable'
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: crop, remaining: 5 }] }]
    auditSetCount(session, father, auditThresholds[father][0] - 1)
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    auditSetCount(session, father, auditThresholds[father][2])
    expect(session.loadState(session.state).ok).toBe(true)
    auditClaim(session, father, 3)
    expect(session.state.players[0]!.resources[crop]).toBe(auditThresholds[father][2])
    expect(session.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    auditAssertCompleted(session, father, 3)
  })

  it.each(['disabled', 'parent-selection', 'draft', 'nonholder'] as const)('father completion is rejected for %s without changing state', (condition) => {
    let session = auditSetup('PS01')
    auditSetCount(session, 'PS01', 5)
    if (condition === 'disabled') session.state.enableParentCards = false
    if (condition === 'nonholder') session.state.players[0]!.parentCards.father = null
    if (condition === 'parent-selection' || condition === 'draft') {
      session = new GameSession(56125, undefined, { playerCount: 2, enableParentCards: true, parentSelectionSeed: 9002, ...(condition === 'draft' ? { draftMode: 'simultaneous', draftPoolSize: 7 } : {}) })
      setDeterministicHands(session.state)
    }
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })
})

describe('Parent father completion session', () => {
  it('compiles simple father rewards to existing gain and completion-marker actions', () => {
    const session = setup('PS01', (player) => {
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
      ]
    })
    const state = session.getState().state
    const player = state.players[0]!
    const events: DraftGameEvent[] = []

    const result = completeParentFatherAction.resolveChoice!({
      state,
      player,
      space: { id: ACTION_ID } as ActionSpace,
      eventSink: makeEventSink(events),
    } as never, 'PS01:1')

    expect(result.type).toBe('flow')
    expect(player.resources.stone).toBe(0)
    expect(player.cardStates.PS01).toBeUndefined()
    expect(events).toEqual([])
    if (result.type !== 'flow') throw new Error('expected father completion flow')
    expect(result.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'PS01',
          params: { stone: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'PS01',
          params: { kind: 'set-extra-data', key: 'fatherCompletedTier', value: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'PS01',
          params: { kind: 'set-infobox', text: 'Completed' },
        },
      ],
    })
  })

  it('completes a satisfied simple father tier once and marks the face-up parent card', () => {
    const session = setup('PS01', (player) => {
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
      ]
    })

    const offered = session.getState()
    expect(offered.interaction.stateId).toBe('idle')
    expect(anytimeIds(offered)).toContain(ACTION_ID)

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    expect(prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS01:1', 'PS01:2'])

    const completed = session.resolveChoice(0, 'PS01:1')
    const player = completed.state.players[0]!
    expect(completed.ok).toBe(true)
    expect(player.resources.stone).toBe(1)
    expect(player.parentCards.father).toBe('PS01')
    expect(player.cardStates.PS01?.infobox).toBe('Completed')
    expect(player.cardStates.PS01?.extraData?.fatherCompletedTier).toBe(1)
    expect(anytimeIds(completed)).not.toContain(ACTION_ID)

    const repeat = session.takeAnytimeAction(0, ACTION_ID)
    expect(repeat.ok).toBe(false)
    expect(repeat.state.players[0]!.resources.stone).toBe(1)
  })

  it('does not expose father completion when no simple satisfied tier exists', () => {
    const session = setup('PS11', (player) => {
      player.resources.grain = 2
    })

    const resp = session.getState()
    expect(anytimeIds(resp)).not.toContain(ACTION_ID)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
  })

  it('revalidates the chosen tier before granting the reward', () => {
    const session = setup('PS01', (player) => {
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
      ]
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS01:1', 'PS01:2'])

    session.state.players[0]!.fields = session.state.players[0]!.fields.slice(0, 1)
    const stale = session.resolveChoice(0, 'PS01:2')
    expect(stale.ok).toBe(false)
    expect(stale.state.players[0]!.resources.stone).toBe(0)
    expect(stale.state.players[0]!.cardStates.PS01).toBeUndefined()
  })

  it('does not appear during pending interactions', () => {
    const session = setup('PS01', (player) => {
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
      ]
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.interaction.stateId).toBe('wait')
    expect(anytimeIds(prompt)).not.toContain(ACTION_ID)
  })

  it('grants PS02 house-material rewards from the current house type', () => {
    const session = setup('PS02', (player) => {
      player.houseType = 'clay'
      player.pastures = [
        pasture('p1', 2, 0),
        pasture('p2', 2, 1),
      ]
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS02:1', 'PS02:2'])

    const completed = session.resolveChoice(0, 'PS02:2')
    const player = completed.state.players[0]!
    expect(completed.ok).toBe(true)
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(2)
    expect(player.resources.stone).toBe(0)
    expect(player.cardStates.PS02?.extraData?.fatherCompletedTier).toBe(2)
    expect(player.cardStates.PS02?.infobox).toBe('Completed')
  })

  it('creates PS03 draw-3 keep-1 choices for minor, occupation, and both decks', () => {
    const minor = setup('PS03', (player, state) => {
      player.pastures = [pasture('p1', 2, 0, 'sheep', 1)]
      state.ordinaryCardDecks.minor = ['minor-a', 'minor-b', 'minor-c', 'minor-d']
    })

    const minorCompleted = minor.takeAnytimeAction(0, ACTION_ID)
    expect(minorCompleted.ok).toBe(true)
    expect(minorCompleted.state.players[0]!.cardStates.PS03?.extraData?.fatherCompletedTier).toBe(1)
    expect(Object.values(minorCompleted.state.ordinaryCardDrawChoices)).toEqual([
      expect.objectContaining({
        playerId: minorCompleted.state.players[0]!.id,
        cardType: 'minor',
        candidates: ['minor-a', 'minor-b', 'minor-c'],
        sourceCard: 'PS03',
        sourceActionId: ACTION_ID,
      }),
    ])
    expect(minorCompleted.state.ordinaryCardDecks.minor).toEqual(['minor-d'])
    expect(anytimeIds(minorCompleted)).toEqual([])
    expect(minor.takeAction(0, 'forest')).toMatchObject({
      ok: false,
      error: 'ordinary card draw choice in progress',
    })

    const minorChoice = Object.values(minorCompleted.state.ordinaryCardDrawChoices)[0]!
    const minorResolved = minor.resolveOrdinaryCardDrawChoice(0, minorChoice.id, 'minor-b')
    expect(minorResolved.ok).toBe(true)
    expect(minorResolved.state.players[0]!.minorHand).toContain('minor-b')
    expect(minorResolved.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.handChanged',
        recipientPlayerId: minorResolved.state.players[0]!.id,
        cardType: 'minor',
        cardIds: expect.arrayContaining(['minor-b']),
        sourceCard: 'PS03',
        sourceActionId: ACTION_ID,
      }),
    ])

    const occupation = setup('PS03', (player, state) => {
      player.pastures = [
        pasture('p1', 2, 0, 'sheep', 1),
        pasture('p2', 2, 1, 'boar', 1),
      ]
      state.ordinaryCardDecks.occupation = ['occ-a', 'occ-b', 'occ-c', 'occ-d']
    })
    expect(occupation.takeAnytimeAction(0, ACTION_ID).ok).toBe(true)
    const occupationCompleted = occupation.resolveChoice(0, 'PS03:2')
    expect(Object.values(occupationCompleted.state.ordinaryCardDrawChoices)).toEqual([
      expect.objectContaining({
        cardType: 'occupation',
        candidates: ['occ-a', 'occ-b', 'occ-c'],
      }),
    ])

    const both = setup('PS03', (player, state) => {
      player.pastures = [
        pasture('p1', 2, 0, 'sheep', 1),
        pasture('p2', 2, 1, 'boar', 1),
        pasture('p3', 2, 2, 'cattle', 1),
      ]
      state.ordinaryCardDecks.minor = ['minor-1', 'minor-2', 'minor-3']
      state.ordinaryCardDecks.occupation = ['occ-1', 'occ-2', 'occ-3']
    })
    expect(both.takeAnytimeAction(0, ACTION_ID).ok).toBe(true)
    const bothCompleted = both.resolveChoice(0, 'PS03:3')
    expect(bothCompleted.ok).toBe(true)
    expect(Object.values(bothCompleted.state.ordinaryCardDrawChoices).map((choice) => choice.cardType).sort()).toEqual(['minor', 'occupation'])
  })

  it('offers PS04 resource combinations and revalidates same-animal requirements', () => {
    const session = setup('PS04', (player) => {
      player.pastures = [pasture('p1', 2, 0, 'boar', 4)]
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.request.options?.map((option) => option.value)).toContain('PS04:2:wood,stone')
    expect(prompt.interaction.request.options?.map((option) => option.value)).not.toContain('PS04:2:wood,wood')
    const rewardLabels = prompt.interaction.request.options
      ?.filter((option) => option.value.startsWith('PS04:2:'))
      .map((option) => option.labelParams?.reward)
    expect(new Set(rewardLabels).size).toBe(rewardLabels?.length)
    expect(prompt.interaction.request.options?.find((option) => option.value === 'PS04:2:wood,stone')?.labelParams?.reward)
      .toContain('wood + stone')
    expect(prompt.interaction.request.options?.find((option) => option.value === 'PS04:2:wood,stone')?.descriptionPreview)
      .toMatchObject({
        kind: 'action',
        labelParams: {
          reward: 'If you do, you immediately get 2 different building resources of your choice.',
        },
        effectPreview: {
          kind: 'resourceExchange',
          resourcesGained: { wood: 1, stone: 1 },
        },
      })

    const invalid = session.resolveChoice(0, 'PS04:2:wood,wood')
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.resources.wood).toBe(0)

    const completed = session.resolveChoice(0, 'PS04:2:wood,stone')
    const player = completed.state.players[0]!
    expect(completed.ok).toBe(true)
    expect(player.resources.wood).toBe(1)
    expect(player.resources.stone).toBe(1)
    expect(player.resources.clay).toBe(0)
    expect(player.cardStates.PS04?.extraData?.fatherCompletedTier).toBe(2)
  })

  it('does not unlock PS03 animal-type or PS04 same-animal requirements from total mixed animals alone', () => {
    const session = setup('PS03', (player) => {
      player.pastures = [pasture('p1', 2, 0, 'sheep', 3)]
    })

    const ps03 = session.takeAnytimeAction(0, ACTION_ID)
    expect(ps03.ok).toBe(true)
    expect(Object.values(ps03.state.ordinaryCardDrawChoices).map((choice) => choice.cardType)).toEqual(['minor'])

    const ps04 = setup('PS04', (player) => {
      player.pastures = [
        pasture('p1', 2, 0, 'sheep', 2),
        pasture('p2', 2, 1, 'boar', 2),
      ]
    })
    expect(anytimeIds(ps04.getState())).not.toContain(ACTION_ID)
  })

  it('counts occupations, minor improvements, major improvements, and parents for PS06 tiers', () => {
    const below = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 1, minors: 1, majors: 1 })
    })
    expect(anytimeIds(below.getState())).not.toContain(ACTION_ID)

    const tier1 = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 2, minors: 1, majors: 1 })
      player.resources.food = 0
    })
    const tier1Completed = tier1.takeAnytimeAction(0, ACTION_ID)
    expect(tier1Completed.ok).toBe(true)
    expect(tier1Completed.interaction.stateId).toBe('idle')
    expect(tier1Completed.state.players[0]!.resources.food).toBe(1)
    expect(tier1Completed.state.players[0]!.cardStates.PS06?.extraData?.fatherCompletedTier).toBe(1)

    const tier2 = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 2, minors: 2, majors: 2 })
    })
    const tier2Prompt = tier2.takeAnytimeAction(0, ACTION_ID)
    expect(tier2Prompt.ok).toBe(true)
    expect(tier2Prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2'])

    const tier3 = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 3, minors: 3, majors: 2 })
      player.resources.food = 0
    })
    const tier3Prompt = tier3.takeAnytimeAction(0, ACTION_ID)
    expect(tier3Prompt.ok).toBe(true)
    expect(tier3Prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2', 'PS06:3'])
    const tier3Completed = tier3.resolveChoice(0, 'PS06:3')
    expect(tier3Completed.ok).toBe(true)
    expect(tier3Completed.state.players[0]!.resources.food).toBe(5)
    expect(tier3Completed.state.players[0]!.cardStates.PS06?.extraData?.fatherCompletedTier).toBe(3)
  })

  it('rejects a stale PS06 choice when total cards drop below the chosen threshold', () => {
    const session = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 2, minors: 2, majors: 2 })
      player.resources.food = 0
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2'])

    setPlayedCardCounts(session.state.players[0]!, { occupations: 1, minors: 1, majors: 1 })
    const stale = session.resolveChoice(0, 'PS06:2')
    expect(stale.ok).toBe(false)
    expect(stale.state.players[0]!.resources.food).toBe(0)
    expect(stale.state.players[0]!.cardStates.PS06).toBeUndefined()
  })

  it('opens PS08 tiers from unused farmyard spaces and grants the chosen crop reward', () => {
    const tooManyUnused = setup('PS08', (player) => {
      setUnusedFarmyardSpaces(player, 8)
    })
    expect(countUnusedFarmyardSpaces(tooManyUnused.getState().state.players[0]!)).toBe(8)
    expect(anytimeIds(tooManyUnused.getState())).not.toContain(ACTION_ID)

    const tier1 = setup('PS08', (player) => {
      setUnusedFarmyardSpaces(player, 7)
    })
    expect(countUnusedFarmyardSpaces(tier1.getState().state.players[0]!)).toBe(7)
    const tier1Completed = tier1.takeAnytimeAction(0, ACTION_ID)
    expect(tier1Completed.ok).toBe(true)
    expect(tier1Completed.state.players[0]!.resources.grain).toBe(1)
    expect(tier1Completed.state.players[0]!.resources.vegetable).toBe(0)
    expect(tier1Completed.state.players[0]!.cardStates.PS08?.extraData?.fatherCompletedTier).toBe(1)

    const tier2 = setup('PS08', (player) => {
      setUnusedFarmyardSpaces(player, 5)
    })
    expect(countUnusedFarmyardSpaces(tier2.getState().state.players[0]!)).toBe(5)
    const tier2Prompt = tier2.takeAnytimeAction(0, ACTION_ID)
    expect(tier2Prompt.ok).toBe(true)
    expect(tier2Prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS08:1', 'PS08:2'])
    const tier2Completed = tier2.resolveChoice(0, 'PS08:2')
    expect(tier2Completed.ok).toBe(true)
    expect(tier2Completed.state.players[0]!.resources.grain).toBe(0)
    expect(tier2Completed.state.players[0]!.resources.vegetable).toBe(1)
    expect(tier2Completed.state.players[0]!.cardStates.PS08?.extraData?.fatherCompletedTier).toBe(2)

    const tier3 = setup('PS08', (player) => {
      setUnusedFarmyardSpaces(player, 3)
    })
    expect(countUnusedFarmyardSpaces(tier3.getState().state.players[0]!)).toBe(3)
    const tier3Prompt = tier3.takeAnytimeAction(0, ACTION_ID)
    expect(tier3Prompt.ok).toBe(true)
    expect(tier3Prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS08:1', 'PS08:2', 'PS08:3'])
    const tier3Completed = tier3.resolveChoice(0, 'PS08:3')
    expect(tier3Completed.ok).toBe(true)
    expect(tier3Completed.state.players[0]!.resources.grain).toBe(1)
    expect(tier3Completed.state.players[0]!.resources.vegetable).toBe(1)
    expect(tier3Completed.state.players[0]!.cardStates.PS08?.extraData?.fatherCompletedTier).toBe(3)
  })

  it('runs PS07 as a single optional sow flow and completes after declining', () => {
    const session = setup('PS07', (player) => {
      player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
      player.resources.grain = 2
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
      ]
    })

    const prompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.request.options?.map((option) => option.value)).toEqual(['PS07:1', 'PS07:2'])

    const sowPrompt = session.resolveChoice(0, 'PS07:2')
    expect(sowPrompt.ok).toBe(true)
    expect(sowPrompt.interaction.stateId).toBe('wait')
    expect(sowPrompt.interaction.request.farm?.farmType).toBe('sow')
    expect(sowPrompt.interaction.request.farm?.maxSelections).toBe(2)
    expect(sowPrompt.state.players[0]!.cardStates.PS07).toBeUndefined()

    const empty = session.commitSelectionChoice(0, { crops: [] })
    expect(empty.ok).toBe(true)
    expect(empty.state.players[0]!.cardStates.PS07?.extraData?.fatherCompletedTier).toBe(2)
    expect(empty.state.players[0]!.resources.grain).toBe(2)
  })

  it('rejects PS07 sowing over the tier maximum without marking completion', () => {
    const session = setup('PS07', (player) => {
      player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
      player.resources.grain = 3
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
      ]
    })

    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(true)
    const sowPrompt = session.resolveChoice(0, 'PS07:2')
    expect(sowPrompt.ok).toBe(true)
    const fields = sowPrompt.interaction.request.farm?.farmType === 'sow'
      ? sowPrompt.interaction.request.farm.selectableFields.map((field) => field.tile)
      : []
    const overMax = session.commitSelectionChoice(0, {
      crops: [
        { ...fields[0]!, crop: 'grain' },
        { ...fields[1]!, crop: 'grain' },
        { ...fields[2]!, crop: 'grain' },
      ],
    })
    expect(overMax.ok).toBe(false)
    expect(overMax.state.players[0]!.cardStates.PS07).toBeUndefined()
  })

  it('marks PS07 completed after a valid sow commit', () => {
    const session = setup('PS07', (player) => {
      player.occupationPlayed = ['occ-1', 'occ-2']
      player.resources.grain = 1
      player.fields = [
        { row: 1, col: 0, stacks: [] },
        { row: 1, col: 1, stacks: [] },
      ]
    })

    const sowPrompt = session.takeAnytimeAction(0, ACTION_ID)
    expect(sowPrompt.ok).toBe(true)
    expect(sowPrompt.interaction.stateId).toBe('wait')
    expect(sowPrompt.interaction.request.farm?.farmType).toBe('sow')
    const field = sowPrompt.interaction.request.farm?.farmType === 'sow'
      ? sowPrompt.interaction.request.farm.selectableFields[0]!.tile
      : { row: 1, col: 0 }
    const completed = session.commitSelectionChoice(0, {
      crops: [{ ...field, crop: 'grain' }],
    })
    const player = completed.state.players[0]!
    expect(completed.ok).toBe(true)
    expect(player.fields.find((entry) => entry.row === field.row && entry.col === field.col)?.stacks).toEqual([
      { kind: 'grain', remaining: 3 },
    ])
    expect(player.cardStates.PS07?.extraData?.fatherCompletedTier).toBe(1)
    expect(player.cardStates.PS07?.infobox).toBe('Completed')
    expect(anytimeIds(completed)).not.toContain(ACTION_ID)
  })

  it('does not expose or execute father completion when Parent Cards are disabled', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.enableParentCards = false
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    setDeterministicHands(state)
    state.players[0]!.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ]
    state.players[0]!.parentCards = { mother: null, father: 'PS01' }
    session.loadState(state)

    expect(anytimeIds(session.getState())).not.toContain(ACTION_ID)
    expect(session.takeAnytimeAction(0, ACTION_ID).ok).toBe(false)
  })
})

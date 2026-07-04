import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FatherParentCardId } from '../../shared/parents'
import { completeParentFatherAction } from '../../shared/parents/father-completion'
import type { DraftGameEvent, EventSink } from '../../shared/contract/events'
import type { ActionSpace, AnytimeAction, GameState, PlayerState } from '../../shared/contract/types'
import { countUnusedFarmyardSpaces, getAllTilePositions } from '../../shared/domain/farm'

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
    expect(prompt.interaction.options?.map((option) => option.value)).toEqual(['PS01:1', 'PS01:2'])

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
    expect(prompt.interaction.options?.map((option) => option.value)).toEqual(['PS01:1', 'PS01:2'])

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
    expect(prompt.interaction.options?.map((option) => option.value)).toEqual(['PS02:1', 'PS02:2'])

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
    expect(prompt.interaction.options?.map((option) => option.value)).toContain('PS04:2:wood,stone')
    expect(prompt.interaction.options?.map((option) => option.value)).not.toContain('PS04:2:wood,wood')
    const rewardLabels = prompt.interaction.options
      ?.filter((option) => option.value.startsWith('PS04:2:'))
      .map((option) => option.labelParams?.reward)
    expect(new Set(rewardLabels).size).toBe(rewardLabels?.length)
    expect(prompt.interaction.options?.find((option) => option.value === 'PS04:2:wood,stone')?.labelParams?.reward)
      .toContain('wood + stone')
    expect(prompt.interaction.options?.find((option) => option.value === 'PS04:2:wood,stone')?.descriptionPreview)
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
    expect(tier2Prompt.interaction.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2'])

    const tier3 = setup('PS06', (player) => {
      setPlayedCardCounts(player, { occupations: 3, minors: 3, majors: 2 })
      player.resources.food = 0
    })
    const tier3Prompt = tier3.takeAnytimeAction(0, ACTION_ID)
    expect(tier3Prompt.ok).toBe(true)
    expect(tier3Prompt.interaction.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2', 'PS06:3'])
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
    expect(prompt.interaction.options?.map((option) => option.value)).toEqual(['PS06:1', 'PS06:2'])

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
    expect(tier2Prompt.interaction.options?.map((option) => option.value)).toEqual(['PS08:1', 'PS08:2'])
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
    expect(tier3Prompt.interaction.options?.map((option) => option.value)).toEqual(['PS08:1', 'PS08:2', 'PS08:3'])
    const tier3Completed = tier3.resolveChoice(0, 'PS08:3')
    expect(tier3Completed.ok).toBe(true)
    expect(tier3Completed.state.players[0]!.resources.grain).toBe(1)
    expect(tier3Completed.state.players[0]!.resources.vegetable).toBe(1)
    expect(tier3Completed.state.players[0]!.cardStates.PS08?.extraData?.fatherCompletedTier).toBe(3)
  })

  it('runs PS07 as a single sow flow and marks completion only after successful sowing', () => {
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
    expect(prompt.interaction.options?.map((option) => option.value)).toEqual(['PS07:1', 'PS07:2'])

    const sowPrompt = session.resolveChoice(0, 'PS07:2')
    expect(sowPrompt.ok).toBe(true)
    expect(sowPrompt.interaction.stateId).toBe('wait')
    expect(sowPrompt.interaction.farm?.farmType).toBe('sow')
    expect(sowPrompt.interaction.farm?.maxSelections).toBe(2)
    expect(sowPrompt.state.players[0]!.cardStates.PS07).toBeUndefined()

    const empty = session.commitSelectionChoice(0, { crops: [] })
    expect(empty.ok).toBe(false)
    expect(empty.state.players[0]!.cardStates.PS07).toBeUndefined()
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
    const fields = sowPrompt.interaction.farm?.farmType === 'sow'
      ? sowPrompt.interaction.farm.selectableFields.map((field) => field.tile)
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
    expect(sowPrompt.interaction.farm?.farmType).toBe('sow')
    const field = sowPrompt.interaction.farm?.farmType === 'sow'
      ? sowPrompt.interaction.farm.selectableFields[0]!.tile
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

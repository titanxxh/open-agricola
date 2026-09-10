import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { setStoredResource, getStoredResource } from '../../shared/cards/helpers/card-storage'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A078_Canoe'
import '../../shared/cards/A/A079_GardenHoe'
import '../../shared/cards/A/A081_InterimStorage'
import '../../shared/cards/A/A082_WorkCertificate'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, round = 14, playerCount = 2, occupations = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  round?: number
  playerCount?: number
  occupations?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7080 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A078 Canoe parity', () => {
  const CARD_ID = 'A078_Canoe'

  it('A078 S1: one occupation and two wood allow Canoe to be played', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 1, resources: { wood: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A078 S2: fewer than one occupation keep Canoe unavailable', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { wood: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A078 S3: Fishing gains its food plus one additional food and reed', () => {
    const session = setup({ cardId: CARD_ID, resources: { food: 0 } })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 3
    session.loadState(state)
    const response = session.takeAction(0, 'fishing')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, reed: 1 })
  })

  it('A078 S4: a non-Fishing action grants no Canoe bonus', () => {
    const response = setup({ cardId: CARD_ID, resources: { food: 0 } }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 0 })
  })
})

describe('A079 Garden Hoe parity', () => {
  const CARD_ID = 'A079_GardenHoe'

  const sowSession = (crop: 'grain' | 'vegetable') => {
    const session = setup({ cardId: CARD_ID, resources: { [crop]: 1 } })
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(state)
    const pending = session.takeAction(0, 'grain-utilization')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    return session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop }] })
  }

  it('A079 S1: paying one wood plays Garden Hoe', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A079 S2: an unconditional Sow planting vegetable gains one clay and one stone', () => {
    const response = sowSession('vegetable')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, clay: 1, stone: 1 })
  })

  it('A079 S3: an unconditional Sow planting only grain grants no Garden Hoe resources', () => {
    const response = sowSession('grain')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })

  it('A079 S4: no vegetable planted leaves Garden Hoe unchanged', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })
})

describe('A081 Interim Storage parity', () => {
  const CARD_ID = 'A081_InterimStorage'

  it('A081 S1: paying two food plays Interim Storage', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { food: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  for (const { scenario, action, collected, stored } of [
    { scenario: 'S2', action: 'clay-pit', collected: 'clay', stored: 'wood' },
    { scenario: 'S3', action: 'reed-bank', collected: 'reed', stored: 'clay' },
    { scenario: 'S4', action: 'eastern-quarry', collected: 'stone', stored: 'reed' },
  ] as const) {
    it(`A081 ${scenario}: using ${collected} accumulation stores one ${stored} on Interim Storage`, () => {
      const session = setup({ cardId: CARD_ID, round: 6 })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === action)!.resources[collected] = 2
      session.loadState(state)
      const response = session.takeAction(0, action)
      expect(response.state.players[0]!.resources[collected]).toBe(2)
      expect(getStoredResource(response.state.players[0]!, CARD_ID, stored)).toBe(1)
    })
  }

  it('A081 S5: a wood accumulation space stores nothing on Interim Storage', () => {
    const session = setup({ cardId: CARD_ID, round: 6 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    const response = session.takeAction(0, 'forest')
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'wood')).toBe(0)
  })

  it('A081 S6: at round seven all stored wood clay and reed move to the supply', () => {
    const session = setup({ cardId: CARD_ID, round: 6, resources: { wood: 0, clay: 0, reed: 0 } })
    const state = session.getState().state
    for (const resource of ['wood', 'clay', 'reed'] as const) {
      setStoredResource(state.players[0]!, CARD_ID, resource, 1)
    }
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    autoAdvanceRoundEnd(session)
    const response = session.getState()
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, reed: 1 })
    for (const resource of ['wood', 'clay', 'reed'] as const) {
      expect(getStoredResource(response.state.players[0]!, CARD_ID, resource)).toBe(0)
    }
  })
})

describe('A082 Work Certificate parity', () => {
  const CARD_ID = 'A082_WorkCertificate'

  it('A082 S1: three occupations and one food allow Work Certificate to be played', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 3, resources: { food: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A082 S2: fewer than three occupations keep Work Certificate unavailable', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 2, resources: { food: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  const certificateSession = (forestWood: number) => {
    const session = setup({ cardId: CARD_ID })
    const state = session.getState().state
    for (const space of state.actionSpaces) {
      for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) space.resources[resource] = 0
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
    session.loadState(state)
    return session
  }

  const enterCertificate = (session: GameSession) =>
    resolveTriggerIfPresent(session, session.takeAction(0, 'day-laborer'), CARD_ID)

  it('A082 S3: after another action Work Certificate may take one wood from a four-wood Forest', () => {
    const session = certificateSession(4)
    let response = enterCertificate(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const wood = options(response).find((option) =>
      option.value !== '__skip__' && option.effectPreview?.resourcesGained?.wood === 1)
      ?? options(response).find((option) => option.value !== '__skip__')
    expect(wood).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, wood!.value)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
  })

  it('A082 S4: the Work Certificate take may be declined', () => {
    const session = certificateSession(4)
    let response = enterCertificate(session)
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(4)
  })

  it('A082 S5: a three-resource Forest is below the Work Certificate threshold', () => {
    const response = certificateSession(3).takeAction(0, 'day-laborer')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
  })
})

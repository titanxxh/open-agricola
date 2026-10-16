import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createWorkSession } from './_helpers/session-fixtures'
import { sessionOptions } from './_helpers/card-regression-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import '../../shared/cards/C/C039_StudioBoat'

const CARD_ID = 'C039_StudioBoat'

const setup = (playerCount: 2 | 3 | 4, played = false, startPlayerIndex = 0) => {
  return createWorkSession({seed:39, options:{playerCount}, configure:state => {
    state.currentPlayerIndex = startPlayerIndex
    state.players.forEach((player,index) => {
      player.startPlayer = index === startPlayerIndex
      player.occupationHand = ['__test_placeholder__']
      player.minorHand = index === 0 && !played ? [CARD_ID] : ['__test_placeholder__']
    })
    const owner = state.players[0]!
    owner.occupationPlayed = ['A125_Priest']
    owner.resources.wood = 1
    if (played) {
      owner.minorPlayed = [CARD_ID]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    }
  }})
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (sessionOptions(response).some((option) => option.value === CARD_ID)) return response
  const improvement = sessionOptions(response).find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? sessionOptions(response).find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const prompt = openMinorPrompt(session)
  if (prompt.state.players[0]!.minorPlayed.includes(CARD_ID)) return prompt
  const option = cardOption(prompt)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const bonusTotal = (response: SessionResponse) => response.scores![0]!.categories
  .filter(category => category.key === 'cardBonusVp')
  .flatMap(category => category.entries)
  .filter(entry => entry.type === 'bonus' && entry.cardId === CARD_ID)
  .reduce((sum,entry) => sum + entry.score,0)

const nextNaturalRound = (session: GameSession) => {
  let r = session.getState()
  for (let n = 0; n < 30; n++) {
    expect(r.ok,r.error).toBe(true)
    if (r.state.round === 2) {
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNextPlayer(session)
      return r
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
      r = confirmNextPlayer(session)
      continue
    }
    if (r.interaction.stateId !== 'idle') throw new Error(JSON.stringify(r.interaction))
    const actor = r.state.currentPlayerIndex
    const space = ['forest','reed-bank','grain-seeds','clay-pit','day-laborer','fishing'].find(id => session.getActionAvailability(actor)[id])
    if (!space) throw new Error('No legal filler')
    r = session.takeAction(actor,space)
  }
  throw new Error('Natural second round missing')
}

describe('C039 Studio Boat session', () => {
  it('C039 S1: a three-player owner needs one occupation, pays one wood, and creates an all-access action space', () => {
    const blocked = setup(3)
    const blockedState = blocked.getState().state
    blockedState.players[0]!.occupationPlayed = []
    blocked.loadState(blockedState)
    const blockedPrompt = openMinorPrompt(blocked)

    expect(cardOption(blockedPrompt)).toBeUndefined()
    expect(blockedPrompt.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(blockedPrompt.state.players[0]!.resources.wood).toBe(1)

    const session = setup(3)
    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)).toBeDefined()
    expect(session.getActionAvailability(1)[CARD_ID]).toBe(false)
  })

  it.each([
    { playerCount: 2, actorIndex: 0, ownerBonusVp: 1 },
    { playerCount: 2, actorIndex: 1, ownerBonusVp: 0 },
    { playerCount: 3, actorIndex: 0, ownerBonusVp: 1 },
    { playerCount: 3, actorIndex: 1, ownerBonusVp: 0 },
  ] satisfies Array<{ playerCount: 2 | 3; actorIndex: number; ownerBonusVp: number }>)('C039 S2: $playerCount-player use by actor $actorIndex scores exactly $ownerBonusVp owner bonus VP', ({ playerCount, actorIndex, ownerBonusVp }) => {
    const session = setup(playerCount, true, actorIndex)
    const nextRound = nextNaturalRound(session)
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.actionSpaces.find((space) => space.id === CARD_ID)?.resources.food).toBe(1)
    const foodBefore = nextRound.state.players[actorIndex]!.resources.food

    const response = session.takeAction(actorIndex, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[actorIndex]!.resources.food).toBe(foodBefore + 1)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(ownerBonusVp)
    expect(bonusTotal(response)).toBe(ownerBonusVp)
  })

  it('C039 S3: real four-player purchase and owner Traveling Players give one public bonus point', () => {
    const session = setup(4)
    const bought = playMinor(session)
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.actionSpaces.some(space => space.id === CARD_ID)).toBe(false)
    for (const [actor,space] of [[1,'forest'],[2,'reed-bank'],[3,'grain-seeds']] satisfies Array<[number,string]>) {
      confirmNextPlayer(session)
      const response = session.takeAction(actor,space)
      expect(response.ok,response.error).toBe(true)
    }
    confirmNextPlayer(session)
    const response = session.takeAction(0,'traveling-players')
    expect(response.ok,response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusTotal(response)).toBe(1)
  })
})

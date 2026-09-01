import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B116_Shoreforester'
import '../../shared/cards/C/C125_Nightworker'

const CARD_ID = 'B116_Shoreforester'

const setup = () => {
  const session = new GameSession(116, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources.food = 10
  })
  state.players[0]!.occupationHand = [CARD_ID]
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let resp = session.takeAction(0, 'lessons')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (!option) return resp
  resp = session.resolveChoice(0, option.value)
  return resp
}

const setupRoundEnd = (reed: number) => {
  const session = new GameSession(116, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((current) => {
    current.resources.food = 10
    markAllWorkersUsed(state, current)
  })
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.resources.wood = 0
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
  if (!reedBank) throw new Error('reed-bank missing')
  reedBank.resources.reed = reed
  session.loadState(state)
  return session
}

describe('B116_Shoreforester session', () => {
  it('gains 1 wood when played through Lessons', () => {
    const session = setup()
    const beforeScoreTotals = session.getState().scores.map((score) => score.total)
    const beforeReed = session.getState().state.actionSpaces
      .find((space) => space.id === 'reed-bank')!.resources.reed
    const resp = playOccupation(session)
    expect(resp.state.players[0]!.occupationHand).not.toContain(CARD_ID)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.round).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed)
      .toBe(beforeReed)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-next-player')
    }
    expect(resp.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID,
    )).toEqual([
      expect.objectContaining({
        resources: { wood: 1 },
        reason: 'cardEffect',
        from: { kind: 'card', playerId: resp.state.players[0]!.id, cardId: CARD_ID },
        to: { kind: 'player', playerId: resp.state.players[0]!.id },
      }),
    ])
    expect(resp.state.events.filter((event) =>
      event.type === 'card.played' && event.cardId === CARD_ID,
    )).toHaveLength(1)
    expect(resp.state.events.filter((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toHaveLength(1)
    expect(resp.state.log.filter((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ gain: { wood: 1 } }) }),
    ])
    expect(resp.scores.map((score) => score.total)).toEqual(beforeScoreTotals)
  })

  it('observes the Reed Bank after accumulation when it was empty before preparation', () => {
    const session = setupRoundEnd(0)
    const beforeScoreTotals = session.getState().scores.map((score) => score.total)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.interaction.allowedCommands).toEqual(['takeAction'])
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(1)

    const accumulated = resp.state.events.filter((event) =>
      event.type === 'action.accumulated' && event.spaceId === 'reed-bank',
    )
    const gains = resp.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID,
    )
    expect(accumulated).toEqual([
      expect.objectContaining({ round: 2, phase: 'preparation', resources: { reed: 1 } }),
    ])
    expect(gains).toEqual([
      expect.objectContaining({
        round: 2,
        phase: 'preparation',
        resources: { wood: 1 },
        reason: 'cardEffect',
        from: { kind: 'card', playerId: resp.state.players[0]!.id, cardId: CARD_ID },
        to: { kind: 'player', playerId: resp.state.players[0]!.id },
      }),
    ])
    expect(resp.state.events.filter((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toHaveLength(1)
    expect(accumulated[0]!.seq).toBeLessThan(gains[0]!.seq)
    expect(resp.state.log.filter((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ gain: { wood: 1 } }) }),
    ])
    expect(resp.scores.map((score) => score.total)).toEqual(beforeScoreTotals)
  })

  it('does not gain wood when the Reed Bank was nonempty before preparation', () => {
    const session = setupRoundEnd(1)
    const beforeScoreTotals = session.getState().scores.map((score) => score.total)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.interaction.allowedCommands).toEqual(['takeAction'])
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.events).toContainEqual(expect.objectContaining({
      type: 'action.accumulated',
      spaceId: 'reed-bank',
      round: 2,
      phase: 'preparation',
      resources: { reed: 1 },
    }))
    expect(resp.state.events.some((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID,
    )).toBe(false)
    expect(resp.state.events.some((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toBe(false)
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toBe(false)
    expect(resp.scores.map((score) => score.total)).toEqual(beforeScoreTotals)
  })

  it('still gains wood when Nightworker takes the newly accumulated reed first', () => {
    const session = setupRoundEnd(0)
    const state = session.getState().state
    const nightworker = state.players[1]!
    nightworker.occupationPlayed.push('C125_Nightworker')
    Object.assign(nightworker.resources, { wood: 1, clay: 1, reed: 0, stone: 1 })
    session.loadState(state)
    const beforeScoreTotals = session.getState().scores.map((score) => score.total)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Nightworker choice')
    expect(resp.interaction.sourceCard).toBe('C125_Nightworker')
    const activate = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(activate).toBeDefined()

    resp = session.resolveChoice(1, activate!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(0)
    expect(resp.state.players[1]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    const accumulated = resp.state.events.find((event) =>
      event.type === 'action.accumulated' && event.spaceId === 'reed-bank' && event.round === 2,
    )
    const collected = resp.state.events.find((event) =>
      event.type === 'resource.moved' &&
      event.sourceCardId === 'C125_Nightworker' &&
      event.from.kind === 'actionSpace' &&
      event.from.spaceId === 'reed-bank',
    )
    const gained = resp.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID,
    )
    const workStarted = resp.state.events.find((event) => event.type === 'work.started' && event.round === 2)
    expect(accumulated).toBeDefined()
    expect(collected).toBeDefined()
    expect(gained).toEqual([expect.objectContaining({ resources: { wood: 1 } })])
    expect(workStarted).toBeDefined()
    expect(accumulated!.seq).toBeLessThan(collected!.seq)
    expect(collected!.seq).toBeLessThan(gained[0]!.seq)
    expect(gained[0]!.seq).toBeLessThan(workStarted!.seq)
    expect(resp.scores.map((score) => score.total)).toEqual(beforeScoreTotals)
  })
})

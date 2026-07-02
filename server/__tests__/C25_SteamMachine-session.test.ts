import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GameSession } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import '../../shared/cards/C/C025_SteamMachine'
import '../../shared/cards/A/A092_AdoptiveParents'

const CARD_ID = 'C025_SteamMachine'
const A92 = 'A092_AdoptiveParents'

const setup = (opts: {
  extraTurnNewborns?: number
  food?: number
  opponentWorkers?: number
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  const extraTurnNewborns = opts.extraTurnNewborns ?? 0
  setActiveWorkerCount(player, Math.max(2, extraTurnNewborns + 1))
  setWorkersAtHome(state, player, 1)
  player.minorPlayed.push(CARD_ID)
  player.improvements.push('Major_Fireplace1')
  player.resources = { ...player.resources, grain: 1, food: opts.food ?? 0 }
  if (extraTurnNewborns > 0) {
    player.occupationPlayed.push(A92)
    const parkedIds = new Set(
      state.actionSpaces.flatMap((space) =>
        space.takenBy
          .filter((worker) => worker.playerId === player.id)
          .map((worker) => worker.workerId),
      ),
    )
    for (const worker of player.workers) worker.isNewborn = parkedIds.has(worker.id)
  }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']

  const opponent = state.players[1]!
  const opponentWorkers = opts.opponentWorkers ?? 1
  setActiveWorkerCount(opponent, opponentWorkers)
  setWorkersAtHome(state, opponent, opponentWorkers)
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']

  const forest = state.actionSpaces.find((space) => space.id === 'forest')
  if (forest) forest.resources.wood = 1

  session.loadState(state)
  return session
}

const takeForest = (session: GameSession) => {
  const resp = session.takeAction(0, 'forest')
  expect(resp.ok).toBe(true)
  return resp
}

const reqKind = (resp: SessionResponse): string | undefined =>
  resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : undefined

const placeableSpaces = (session: GameSession) =>
  session
    .getState()
    .state.actionSpaces.filter(
      (space) =>
        space.id !== '__test-worker-sink__' &&
        (!space.takenBy || space.takenBy.length === 0) &&
        (space.roundAvailable ?? 1) <= session.getState().state.round,
    )
    .map((space) => space.id)

const drainConfirms = (session: GameSession, start: SessionResponse): SessionResponse => {
  let resp = start
  let guard = 0
  while (reqKind(resp) === 'confirm-next-player' && guard++ < 8) {
    const owner =
      resp.interaction.stateId === 'wait'
        ? resp.interaction.playerIndex
        : session.getState().state.currentPlayerIndex
    resp = session.resolveChoice(owner, 'confirm')
  }
  return resp
}

const c25ConsumeEvents = (resp: SessionResponse) =>
  resp.state.events.filter(
    (event) =>
      event.type === 'card.triggered' &&
      event.sourceCardId === CARD_ID &&
      !('triggerActionId' in event),
  )

describe('C025_SteamMachine session', () => {
  it('can skip the optional bake after the last worker uses an accumulation space', () => {
    const session = setup()

    let resp = takeForest(session)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option: ActionChoiceOption) => option.value)).toContain('__skip__')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('accepting the optional bake must bake at least one grain', () => {
    const session = setup()

    let resp = takeForest(session)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(resp.interaction.options?.map((option) => option.value)).not.toContain('cancel')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('skipping Bake Bread still consumes a pending extra turn', () => {
    const session = setup({ extraTurnNewborns: 1, food: 1 })
    const before = session.getState()
    expect(hasPendingExtraTurn(before.state, before.state.players[0]!)).toBe(true)

    let resp = takeForest(session)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!._extraTurnConsumedCountsByCard).toEqual({ [A92]: 1 })
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)
    expect(c25ConsumeEvents(resp)).toHaveLength(1)
  })

  it('accepting Bake Bread resolves the bake before consuming the pending extra turn', () => {
    const session = setup({ extraTurnNewborns: 1, food: 1 })

    let resp = takeForest(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!._extraTurnConsumedCountsByCard).toEqual({ [A92]: 1 })
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)
    expect(c25ConsumeEvents(resp)).toHaveLength(1)
  })

  it('consumes all pending extra turns when multiple opportunities remain', () => {
    const session = setup({ extraTurnNewborns: 2, food: 2 })

    let resp = takeForest(session)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!._extraTurnConsumedCountsByCard).toEqual({ [A92]: 2 })
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)
    expect(c25ConsumeEvents(resp)).toHaveLength(1)
  })

  it('does not consume or emit when the extra turn is unaffordable', () => {
    const session = setup({ extraTurnNewborns: 1, food: 0 })
    const before = session.getState()
    expect(hasPendingExtraTurn(before.state, before.state.players[0]!)).toBe(false)

    let resp = takeForest(session)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!._extraTurnConsumedCountsByCard).toBeUndefined()
    expect(c25ConsumeEvents(resp)).toEqual([])
  })

  it('prevents the later extra-turn prompt after the opponent finishes', () => {
    const session = setup({ extraTurnNewborns: 1, food: 1 })

    let resp = takeForest(session)
    resp = session.resolveChoice(0, '__skip__')
    resp = drainConfirms(session, resp)
    expect(session.getState().state.currentPlayerIndex).toBe(1)

    resp = session.takeAction(1, placeableSpaces(session)[0]!)
    expect(resp.ok).toBe(true)
    resp = drainConfirms(session, resp)

    expect(reqKind(resp)).not.toBe('choice')
    expect(resp.state.round).toBe(2)
  })

  it('does not reference A92-specific code in the C25 implementation', () => {
    const source = readFileSync(join(process.cwd(), 'shared/cards/C/C025_SteamMachine.ts'), 'utf8')

    expect(source).not.toMatch(/A92|Adoptive|adoptive|hasAdoptive|cardStates/)
  })
})

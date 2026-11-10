import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { stablesAction } from '../../shared/actions/effects/stables'
import { GameSession } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
const table = (configure: (state: GameState) => void = () => {}) => {
  const session = createWorkSession({ seed: 1627, options: { playerCount: 4, teamConfig: team }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[0]!.resources.wood = 3
    configure(state)
  } })
  sessions.push(session)
  return session
}

describe('Partner Build stables', () => {
  it('chooses a teammate farm before building while the builder pays and keeps the command', () => {
    const session = table()
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', defaultValue: 'target-farm:p1', options: [
      { value: 'target-farm:p1' }, { value: 'target-farm:p3' },
    ] } })
    const chosen = session.resolveChoice(0, 'target-farm:p3')
    expect(chosen.ok, chosen.error).toBe(true)
    expect(chosen.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farmOwnerPlayerId: 'p3', farm: { farmType: 'stable' } } })
    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toEqual([])
    expect(built.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(built.state.players[2]!.resources.wood).toBe(0)
    expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'empty')?.total).toBe(-12)
    expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'empty')?.total).toBe(-13)
    expect(built.state.events).toContainEqual(expect.objectContaining({ type: 'farm.stableBuilt', actorPlayerId: 'p1', targetPlayerId: 'p3' }))
    expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
  })
  it('charges the builder card discount using the target farm third stable, never the teammate card', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 2
      state.players[0]!.occupationPlayed = ['C088_CarpentersApprentice']
      state.players[2]!.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    })
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    const chosen = session.resolveChoice(0, 'target-farm:p3')
    expect(chosen.ok, chosen.error).toBe(true)
    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.stableTiles).toHaveLength(3)
    expect(built.state.players[0]!.stableTiles).toEqual([])
    const other = table(state => {
      state.players[0]!.resources.wood = 2
      state.players[2]!.occupationPlayed = ['C088_CarpentersApprentice']
      state.players[2]!.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    })
    const ownOnly = other.takeAction(0, 'farm-expansion')
    expect(ownOnly.ok, ownOnly.error).toBe(true)
    expect(ownOnly.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
  })

  it('offers a legal teammate even when the builder has no stable pieces left', () => {
    const session = table(state => {
      state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col }))
    })
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', options: [{ value: 'target-farm:p3' }] } })
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p2'))
    assertRejectedUnchanged(session, () => session.resolveChoice(2, 'target-farm:p3'))
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    expect(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }).ok).toBe(true)
    expect(session.state.players[0]!.stableTiles).toHaveLength(4)
    expect(session.state.players[2]!.stableTiles).toHaveLength(1)
  })

  it('keeps the Lazybones reserved stable on its card owner farm with no partner choice', () => {
    const session = table(state => {
      state.currentPlayerIndex = 2
      state.players[0]!.occupationPlayed = ['E148_Lazybones']
      state.players[0]!.resources.wood = 0
      state.players[0]!.cardStates.E148_Lazybones = { extraData: { reservedActionSpaces: ['grain-seeds'] } }
    })
    let response = session.takeAction(2, 'grain-seeds')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(2, { stables: [{ row: 0, col: 2 }] }))
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[2]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces).toEqual([])
  })

  it('restores both the target choice and a locked placement, then undoes the completed partner build', () => {
    const session = table()
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    const restore = (original: GameSession) => {
      const snapshot = original.withCtx(() => serializeSessionSnapshot(original.state, original))
      const next = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
      sessions.push(next)
      return next
    }
    const atChoice = restore(session)
    expect(atChoice.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const atPlacement = restore(atChoice)
    expect(atPlacement.getState().interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { farmOwnerPlayerId: 'p3' } })
    assertRejectedUnchanged(atPlacement, () => atPlacement.resolveChoice(0, 'target-farm:p1'))
    assertRejectedUnchanged(atPlacement, () => atPlacement.commitSelectionChoice(2, { stables: [{ row: 0, col: 2 }] }))
    const result = atPlacement.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.wood).toBe(0)
    expect(result.state.players[2]!.stableTiles).toHaveLength(1)
    const undone = atPlacement.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.wood).toBe(3)
    expect(undone.state.players[2]!.stableTiles).toEqual([])
  })

  it('uses the same target chooser for a card-granted action whose exact price replaces the partner base', () => {
    const session = table(state => {
      state.players[0]!.occupationPlayed = ['C094_StableCleaner']
      state.players[0]!.resources.wood = 1
      state.players[0]!.resources.food = 1
      state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col }))
    })
    const offered = session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(built.state.players[0]!.stableTiles).toHaveLength(4)
    expect(built.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
  })

  it('also chooses a target when a card build is selected directly from an XOR branch', () => {
    const session = table(state => {
      state.currentPlayerIndex = 2
      state.players[0]!.occupationPlayed = ['A150_Stagehand']
      const space = state.actionSpaces.find(candidate => candidate.id === 'traveling-players')
      if (space) space.resources.food = 2
    })
    let response = session.takeAction(2, 'traveling-players')
    for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step += 1) {
      if (response.interaction.request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
        continue
      }
      const stable = response.interaction.request.kind === 'choice'
        ? response.interaction.request.options.find(option => option.labelKey === 'actions.stables.name') : undefined
      if (stable) { response = session.resolveChoice(0, stable.value); break }
      const accept = response.interaction.request.kind === 'choice'
        ? response.interaction.request.options.find(option => option.value !== '__skip__') : undefined
      if (!accept) break
      response = session.resolveChoice(0, accept.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [
      { value: 'target-farm:p1' }, { value: 'target-farm:p3' },
    ] } })
    expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[2]!.stableTiles).toHaveLength(1)
  })

  it('normalizes a card stable price before replacing the partner default price', () => {
    const session = table(state => { state.players[0]!.resources.wood = 1 })
    const available = session.withCtx(() => stablesAction.costPreview?.canExecute?.({
      actionHooks: session.actionHooks, state: session.state, player: session.state.players[0]!,
      actionContext: { targetFarmPlayerId: 'p3', costOverride: { wood: -1 } },
    }))
    expect(available).toBe(true)
    expect(session.state.players[0]!.resources.wood).toBe(1)
    expect(session.state.players[2]!.stableTiles).toEqual([])
  })

  it('skips target selection when no teammate has pieces and keeps the self-build price', () => {
    const session = table(state => {
      state.players[2]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col }))
    })
    const offered = session.takeAction(0, 'farm-expansion')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
    const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(1)
    expect(built.state.players[0]!.stableTiles).toHaveLength(1)
    expect(built.state.players[2]!.stableTiles).toHaveLength(4)
    expect(built.state.log.some(entry => entry.key === 'log.partnerStablesBuilt')).toBe(false)
  })

})

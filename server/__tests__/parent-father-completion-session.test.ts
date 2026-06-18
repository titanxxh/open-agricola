import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FatherParentCardId } from '../../shared/parents'
import type { AnytimeAction, GameState, PlayerState } from '../../shared/contract/types'

const ACTION_ID = 'complete-parent-father'

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

describe('Parent father completion session', () => {
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

  it('does not expose complex father rewards in this slice', () => {
    const session = setup('PS03', (player) => {
      player.pastures = [{
        id: 'p1',
        size: 1,
        tiles: [{ row: 2, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      }]
    })

    expect(anytimeIds(session.getState())).not.toContain(ACTION_ID)
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

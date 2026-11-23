import { afterEach, describe, expect, it } from 'vitest'
import type { ChoiceDescriptionPreview, GameState, InteractionState, PlayerState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'

const TRAPPIST_BEER = 'CFL027_TrappistBeer'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function sheepPasture(player: PlayerState, sheep: number) {
  player.resources.sheep = sheep
  player.pastures = [{ id: 'sheep', animalType: 'sheep', animalCount: sheep, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }]
  player.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
}

/** Round 4 has just been worked out; A owns Trappist Beer, a grain field, two sheep and no food. */
function setup(grain: number) {
  const session = createWorkSession({ seed: 2027, options: { playerCount: 2 }, configure(state: GameState) {
    state.round = 4
    for (const player of state.players) {
      player.occupationHand = [PLACEHOLDER]
      player.minorHand = [PLACEHOLDER]
      player.resources.food = 20
      markAllWorkersUsed(state, player)
    }
    const owner = state.players[0]!
    owner.minorPlayed = [TRAPPIST_BEER]
    owner.resources.food = 0
    owner.resources.grain = grain
    owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    sheepPasture(owner, 2)
  } })
  sessions.push(session)
  return session
}

const labelKeys = (preview?: ChoiceDescriptionPreview): string[] => {
  if (!preview) return []
  if (preview.kind === 'conditional') return labelKeys(preview.body)
  if (preview.kind === 'group') return [...(preview.labelKey ? [preview.labelKey] : []), ...preview.parts.flatMap(labelKeys)]
  const nested = preview.effectPreview?.kind === 'rule' ? labelKeys(preview.effectPreview.description) : []
  return [preview.labelKey, ...nested]
}

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const isTrappistPrompt = (interaction: Wait) =>
  interaction.playerIndex === 0 && interaction.sourceCard === TRAPPIST_BEER

describe('CFL027 Trappist Beer prompt', () => {
  it('names the grain it costs and the harvest it skips, then skips field, feeding and breeding', () => {
    const session = setup(1)
    const owner = session.state.players[0]!.id
    const prompts: Wait[] = []
    const response: SessionResponse = autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (!isTrappistPrompt(interaction)) return undefined
        prompts.push(interaction)
        const accept = interaction.request.kind === 'choice'
          ? interaction.request.options.find(option => option.value !== '__skip__')
          : undefined
        return accept ? current.resolveChoice(0, accept.value) : undefined
      },
    })

    expect(prompts).toHaveLength(1)
    const options = prompts[0]!.request.kind === 'choice' ? prompts[0]!.request.options : []
    const accept = options.find(option => option.value !== '__skip__')!
    // The prompt names the card and spells out its plan: pay 1 grain, then skip this harvest.
    // As the only start-of-Harvest source, the card's own optional plan is the prompt (#2039).
    expect(prompts[0]).toMatchObject({ promptKey: 'ui.interactionOptionalAction', sourceCard: TRAPPIST_BEER })
    expect(accept.descriptionPreview).toMatchObject({
      kind: 'group', optional: true, operator: 'sequence', parts: [
        { kind: 'action', labelKey: 'actions.pay.name', effectPreview: { kind: 'payment', resourcesPaid: { grain: 1 } } },
        { kind: 'action', labelKey: 'ui.timedOperations.skip-harvest' },
      ],
    })
    expect(labelKeys(accept.descriptionPreview)).not.toContain('actions.activate-card-effect.name')

    const after = response.state.players[0]!
    expect(response.state.round).toBe(5)
    expect(after.resources.grain).toBe(0)
    expect(after.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(after.resources).toMatchObject({ food: 0, begging: 0, sheep: 2 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === owner && event.round === 4))
      .toEqual([expect.objectContaining({ resources: { grain: 1 }, sourceCardId: TRAPPIST_BEER })])
  })

  it('does not ask without grain, and the harvest runs as usual', () => {
    const session = setup(0)
    const response = autoAdvanceRoundEnd(session, {
      onChoice: interaction => {
        expect(isTrappistPrompt(interaction)).toBe(false)
        return undefined
      },
    })

    const after = response.state.players[0]!
    expect(response.state.round).toBe(5)
    expect(after.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(after.resources.begging).toBeGreaterThan(0)
    expect(after.resources.sheep).toBe(3)
  })
})

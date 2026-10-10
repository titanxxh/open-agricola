import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import type { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { createWorkSession } from './_helpers/session-fixtures'

/**
 * ADR 0025 fixed behavior tests for the contract's leaf actions and every
 * special-effect kind (future-meeples is covered by the fixed LLM card
 * fixtures). Each scenario is a fresh two-player work-phase game (seed 42)
 * with placeholder hands. Player 0 has already played the custom card, whose
 * listener reacts after that player's own collect action, and takes Forest
 * with 3 wood on it.
 */

const CARD_ID = 'CUSTOM_LeafProbe'

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (flow: string, configure?: (state: GameState) => void) => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Leaf Probe' })
const leaf = (actionId, params) => ({ type: 'leaf', actionId, params, sourceCard: CARD_ID })
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
  handler: () => ({ sourceCard: CARD_ID, flow: ${flow} }) }] }
  `, CARD_ID)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  const card: CustomCardData = {
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Leaf Probe', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
  }
  const session = createWorkSession({
    customCards: [card],
    configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD_ID]
      Object.assign(player.resources, { wood: 0, food: 0, grain: 0 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

describe('Workshop Capability Contract leaf actions', () => {
  it('settles the resource, card-storage and card-state leaves in order', () => {
    const session = start(`{ type: 'seq', children: [
      gainLeaf(CARD_ID, { food: 2 }),
      payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
      leaf('store-on-card', { grain: 2 }),
      leaf('take-from-card', { grain: 1 }),
      leaf('push-to-card-stack', { item: 'first' }),
      leaf('bonus-vp', {}),
      leaf('special-effect', { kind: 'increment-counter', key: 'uses', amount: 2 }),
      leaf('special-effect', { kind: 'set-counter', key: 'cap', value: 5 }),
      leaf('special-effect', { kind: 'set-flag', flag: true }),
      leaf('special-effect', { kind: 'set-infobox', text: 'active' }),
      leaf('special-effect', { kind: 'set-extra-data', key: 'note', value: { a: 1 } }),
      leaf('special-effect', { kind: 'set-private-data', key: 'secret', value: 'owner only' }),
      leaf('special-effect', { kind: 'increment-extra-data', key: 'total', amount: 3 }),
    ] }`)

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(true)
    expect(session.cardWarnings).toEqual([])
    const owner = response.state.players[0]!
    // Forest wood; gain 2 food then pay 1; one of the two stored grain taken back.
    expect(owner.resources).toMatchObject({ wood: 3, food: 1, grain: 1 })
    expect(owner.cardStates[CARD_ID]).toMatchObject({
      counters: { grain: 1, bonusVp: 1, uses: 2, cap: 5 },
      stack: ['first'],
      flagged: true,
      infobox: 'active',
      extraData: { note: { a: 1 }, total: 3 },
      privateData: { secret: 'owner only' },
    })
    const bonus = computeScores(response.state)[0]!.categories.find(category => category.key === 'cardBonusVp')!
    expect(bonus.total).toBe(1)
    expect(bonus.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))

    // The listener has the default player scope: the opponent's collect action does not run it.
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    confirmNextPlayer(session)
    const opponentTurn = session.takeAction(1, 'clay-pit')
    expect(opponentTurn.ok).toBe(true)
    expect(opponentTurn.state.players[0]!.cardStates[CARD_ID]).toEqual(owner.cardStates[CARD_ID])
    expect(opponentTurn.state.players[1]!.cardStates[CARD_ID]).toBeUndefined()
  })

  it('opens the native bake-bread choice and settles the chosen amount', () => {
    const session = start("leaf('bake-bread', {})", (state) => {
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.players[0]!.resources.grain = 2
    })

    const offered = session.takeAction(0, 'forest')

    expect(offered.ok).toBe(true)
    expect(offered.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      promptKey: 'ui.interactionBakeBreadCount',
      request: { kind: 'choice', options: [{ value: 'count-Major_Fireplace1-1' }, { value: 'count-Major_Fireplace1-2' }] },
    })
    expect(offered.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, grain: 2 })

    const baked = session.resolveChoice(0, 'count-Major_Fireplace1-2')

    // A Fireplace turns each grain into 2 food.
    expect(baked.ok).toBe(true)
    expect(session.cardWarnings).toEqual([])
    expect(baked.state.players[0]!.resources).toMatchObject({ wood: 3, food: 4, grain: 0 })
  })

  it('does not offer bake-bread when the player has no baking improvement', () => {
    const session = start("leaf('bake-bread', {})", (state) => { state.players[0]!.resources.grain = 2 })

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, grain: 2 })
  })
})

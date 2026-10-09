import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../shared/contract/types'
import type { SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = '__test_owner_before_placement__'

const gain = (resources: Record<string, number>): ActionFlow => ({
  type: 'leaf', actionId: 'gain', sourceCard: CARD, params: resources,
})

const setup = (flow: (ownerId: string) => ActionFlow) => {
  const session = createWorkSession({ configure: (state) => {
    state.currentPlayerIndex = 1
    state.players[0]!.minorPlayed = [CARD]
    for (const player of state.players) player.resources = { ...player.resources, food: 2, clay: 0, wood: 0 }
  } })
  session.withCtx(() => requireActiveCardRegistry('owner-targeted before placement').registerListener({
    id: `${CARD}:before`,
    cardIds: [CARD],
    phases: ['before'],
    actions: ['place-farmer'],
    scope: 'opponent',
    mandatory: true,
    handler: (context) => ({ sourceCard: CARD, flow: { ...flow(context.ownerPlayer!.id), targetPlayerId: context.ownerPlayer!.id } }),
  }))
  return session
}

/** Confirms player switches and picks the first offered option, recording who was asked. */
const settle = (session: ReturnType<typeof setup>, response: SessionResponse) => {
  const asked: string[] = []
  let current = response
  for (let index = 0; index < 8 && current.interaction.stateId === 'wait'; index++) {
    const { request, playerIndex } = current.interaction
    asked.push(`${request.kind}@${playerIndex}`)
    if (request.kind === 'confirm-player-switch') current = session.resolveChoice(playerIndex, 'confirm')
    else if (request.kind === 'choice') current = session.resolveChoice(playerIndex, request.options[0]!.value)
    else break
  }
  return { response: current, asked }
}

describe('before-placement flows targeted to the card owner', () => {
  it('settles an owner-targeted reward for the owner, not the placing player', () => {
    const session = setup(() => gain({ food: 1 }))

    const { response, asked } = settle(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 2])
    expect(response.state.players.map((player) => player.resources.wood)).toEqual([0, 3])
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', sourceCardId: CARD, resources: { food: 1 },
      to: expect.objectContaining({ playerId: response.state.players[0]!.id }),
    }))
    // No owner decision is needed, so the placing player's turn ends normally.
    expect(asked).toEqual(['confirm-next-player@1'])
  })

  it('asks the owner for an owner-targeted choice and returns to the placing player', () => {
    const session = setup(() => ({ type: 'xor', children: [gain({ food: 1 }), gain({ clay: 1 })] }))

    const { response, asked } = settle(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(asked).toEqual(expect.arrayContaining(['choice@0']))
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 2])
    expect(response.state.players.map((player) => player.resources.wood)).toEqual([0, 3])
  })

  it('keeps an untargeted before-placement reward with the placing player', () => {
    const session = createWorkSession({ configure: (state) => {
      state.players[0]!.minorPlayed = [CARD]
      for (const player of state.players) player.resources = { ...player.resources, food: 2 }
    } })
    session.withCtx(() => requireActiveCardRegistry('own before placement').registerListener({
      id: `${CARD}:own-before`, cardIds: [CARD], phases: ['before'], actions: ['place-farmer'], mandatory: true,
      handler: () => ({ sourceCard: CARD, flow: gain({ food: 1 }) }),
    }))

    const { response, asked } = settle(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 2])
    expect(asked).not.toContain('confirm-player-switch@0')
  })
})

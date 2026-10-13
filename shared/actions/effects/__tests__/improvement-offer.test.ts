import { describe, expect, it } from 'vitest'
import type { ActionExecutionContext } from '../../../contract/types'
import { createInitialState, emptyResources } from '../../../session/state-bootstrap'
import { improvementAction } from '../improvement'

const setup = (): ActionExecutionContext => {
  const state = createInitialState(4242, { playerCount: 2 })
  for (const player of state.players) {
    player.resources = { ...emptyResources }
    player.minorHand = []
    player.minorPlayed = []
    player.improvements = []
    player.occupationPlayed = []
  }
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = ['A050_MilkJug']
  return { state, player, actionContext: { types: ['minor'] } }
}

describe('improvement purchase opportunity', () => {
  it('retains an eligible hand minor without granting an unaffordable purchase', () => {
    const context = setup()
    context.sourceCard = 'A096_TaskArtisan'
    const before = JSON.stringify(context.state)

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)
    expect(JSON.stringify(context.state)).toBe(before)

    context.player.resources.clay = 1
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(true)
    const result = improvementAction.execute(context)
    if (result.type !== 'request' || result.request.kind !== 'choice') throw new Error('Expected improvement choices')
    expect(result.request.options.map(option => option.value)).toEqual(['A050_MilkJug'])
    expect(context.player.resources.clay).toBe(1)
    expect(context.player.minorPlayed).toEqual([])
  })

  it('does not offer a minor owned only by the other player', () => {
    const context = setup()
    context.player.minorHand = []
    context.state.players[1]!.minorHand = ['A050_MilkJug']

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)
  })

  it('requires the printed occupations even when the minor has no resource cost', () => {
    const context = setup()
    context.player.minorHand = ['E024_Ambition']
    context.player.occupationPlayed = ['A096_TaskArtisan']

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)

    context.player.occupationPlayed.push('B070_NewPurchase')
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(true)
  })

  it('preserves the allowed purchase restriction for a hand minor', () => {
    const context = setup()
    context.params = { allowedPurchases: ['A053_Claypipe'] }

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)

    context.params = { allowedPurchases: ['A050_MilkJug'] }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)
  })

  it('only offers Wooden Shed through a true major improvement action in a wooden house', () => {
    const context = setup()
    context.player.minorHand = ['A010_WoodenShed']

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)

    context.actionContext = { types: ['major'] }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)

    context.params = { trueAction: false }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    context.params = undefined
    context.actionContext = { types: ['major'], trueAction: false }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)

    context.actionContext = { types: ['major'] }
    context.player.houseType = 'clay'
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
  })

  it('offers the Blueprint major candidate without bypassing supply, action or purchase restrictions', () => {
    const context = setup()
    context.player.minorHand = []
    context.player.minorPlayed = ['C027_Blueprint']
    context.state.availableMajorImprovements = ['Major_Joinery']

    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)

    context.params = { allowedPurchases: ['Major_Pottery'] }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    context.params = { allowedPurchases: ['Major_Joinery'] }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(true)

    context.actionContext = { types: ['minor'], trueAction: false }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    context.actionContext = { types: ['minor'] }
    context.params = { allowedPurchases: ['Major_Joinery'], trueAction: false }
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)
    context.params = { allowedPurchases: ['Major_Joinery'] }
    context.state.availableMajorImprovements = []
    expect(improvementAction.canBeOfferedByPlayer!(context.state, context.player, context)).toBe(false)

    context.state.availableMajorImprovements = ['Major_Joinery']
    context.player.resources.wood = 2
    context.player.resources.stone = 1
    expect(improvementAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(true)
    const result = improvementAction.execute(context)
    if (result.type !== 'request' || result.request.kind !== 'choice') throw new Error('Expected improvement choices')
    expect(result.request.options.map(option => option.value)).toEqual(['Major_Joinery'])
    expect(context.player.resources.wood).toBe(2)
    expect(context.player.resources.stone).toBe(1)
  })
})

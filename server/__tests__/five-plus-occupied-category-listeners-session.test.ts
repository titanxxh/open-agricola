import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { recordRoundPlacement, resetRoundPlacements } from '../../shared/cards/helpers/round-placement'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

const placeholderHands = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  session.loadState(state)
}

const setupCardOwner = (cardId: string, playerCount = 5) => {
  const session = new GameSession(42, undefined, { playerCount })
  placeholderHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  const owner = state.players[0]!
  owner.resources.food = 5
  owner.occupationPlayed = [cardId]
  owner.occupationHand = ['A123_FrameBuilder']
  session.loadState(state)
  return session
}

const occupySpace = (session: GameSession, spaceId: string, playerId: string) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.takenBy = [{ playerId, workerId: `${playerId}-worker-${spaceId}` }]
  session.loadState(state)
}

const findOptionWithPreview = (resp: ReturnType<GameSession['takeAction']>, text: string) => {
  if (resp.interaction.stateId !== 'wait') return undefined
  const interaction = resp.interaction as typeof resp.interaction & {
    options?: Array<{ value: string; effectPreview?: unknown }>
    request?: { options?: Array<{ value: string; effectPreview?: unknown }> }
  }
  const options = interaction.options ?? interaction.request?.options ?? []
  return options.find((option) => JSON.stringify(option.effectPreview).includes(text))
}

describe('5+ occupied category listener cards', () => {
  it('C175 Village Teacher gives food after the owner uses the first occupied Lessons space', () => {
    const session = setupCardOwner('C175_VillageTeacher')

    const resp = session.takeAction(0, 'lessons')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('C175 Village Teacher rewards the second and third occupied Lessons spaces only by actual occupancy', () => {
    const second = setupCardOwner('C175_VillageTeacher')
    occupySpace(second, 'lessons-56-2f', 'p2')

    const secondResp = second.takeAction(0, 'lessons')

    expect(secondResp.ok).toBe(true)
    expect(secondResp.state.players[0]!.resources.food).toBe(4)
    expect(secondResp.state.players[0]!.resources.grain).toBe(1)
    expect(secondResp.state.players[0]!.resources.vegetable).toBe(0)

    const third = setupCardOwner('C175_VillageTeacher')
    occupySpace(third, 'lessons-56-2f', 'p2')
    occupySpace(third, 'lessons-56-variable', 'p3')

    const thirdResp = third.takeAction(0, 'lessons')

    expect(thirdResp.ok).toBe(true)
    expect(thirdResp.state.players[0]!.resources.food).toBe(4)
    expect(thirdResp.state.players[0]!.resources.grain).toBe(0)
    expect(thirdResp.state.players[0]!.resources.vegetable).toBe(1)

    const blockedLinked = setupCardOwner('C175_VillageTeacher')
    occupySpace(blockedLinked, 'modest-wish-children-56', 'p2')

    const blockedResp = blockedLinked.takeAction(0, 'lessons')

    expect(blockedResp.ok).toBe(true)
    expect(blockedResp.state.players[0]!.resources.food).toBe(5)
    expect(blockedResp.state.players[0]!.resources.grain).toBe(0)
    expect(blockedResp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('D176 Woodshacker gives 1 clay after the owner first uses a wood accumulation space this round', () => {
    const session = setupCardOwner('D176_Woodshacker')

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
  })

  it('D176 Woodshacker gives 2 clay on the second owner wood use and resets when workers return', () => {
    const session = setupCardOwner('D176_Woodshacker')

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    let state = resp.state
    state.currentPlayerIndex = 0
    session.loadState(state)
    resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(3)

    state = resp.state
    state.currentPlayerIndex = 0
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
    })
    resetRoundPlacements(state.players[0]!)
    session.loadState(state)
    resp = session.takeAction(0, 'grove-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(4)
  })

  it('D176 Woodshacker counts repeated wood uses on the same space', () => {
    const session = setupCardOwner('D176_Woodshacker')

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const state = resp.state
    const owner = state.players[0]!
    recordRoundPlacement(owner, 'forest', 'extra-forest-use')
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    const listener = getRegisteredCardListeners().find((entry) => entry.id === 'D176-woodshacker-after-wood')!
    const result = executeCardListener(listener, {
      state,
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: forest,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      actionId: 'gain',
      params: { clay: 2 },
    })
  })

  it('D176 Woodshacker ignores non-wood action spaces', () => {
    const session = setupCardOwner('D176_Woodshacker')

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
  })

  it('C180 Trapper offers sheep for 1 food after the second occupied wood accumulation space', () => {
    const session = setupCardOwner('C180_Trapper')
    occupySpace(session, 'copse-56', 'p2')

    let resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    const accept = findOptionWithPreview(resp, '"sheep":1')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
  })

  it('C180 Trapper offers boar and cattle on the third and fourth occupied wood spaces', () => {
    const third = setupCardOwner('C180_Trapper')
    occupySpace(third, 'copse-56', 'p2')
    occupySpace(third, 'riverbank-forest-56', 'p3')

    let resp = third.takeAction(0, 'forest')
    let accept = findOptionWithPreview(resp, '"boar":1')
    expect(accept).toBeDefined()
    resp = third.resolveChoice(0, accept!.value)

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.boar).toBe(1)

    const fourth = setupCardOwner('C180_Trapper')
    occupySpace(fourth, 'copse-56', 'p2')
    occupySpace(fourth, 'riverbank-forest-56', 'p3')
    occupySpace(fourth, 'grove-56', 'p4')

    resp = fourth.takeAction(0, 'forest')
    accept = findOptionWithPreview(resp, '"cattle":1')
    expect(accept).toBeDefined()
    resp = fourth.resolveChoice(0, accept!.value)

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
  })

  it('C180 Trapper ignores the first wood space, non-wood spaces, and owners without food', () => {
    const first = setupCardOwner('C180_Trapper')
    let resp = first.takeAction(0, 'forest')
    expect(findOptionWithPreview(resp, '"sheep":1')).toBeUndefined()

    const nonWood = setupCardOwner('C180_Trapper')
    resp = nonWood.takeAction(0, 'day-laborer')
    expect(findOptionWithPreview(resp, '"sheep":1')).toBeUndefined()

    const noFood = setupCardOwner('C180_Trapper')
    let state = noFood.getState().state
    state.players[0]!.resources.food = 0
    noFood.loadState(state)
    occupySpace(noFood, 'copse-56', 'p2')

    resp = noFood.takeAction(0, 'forest')

    expect(findOptionWithPreview(resp, '"sheep":1')).toBeUndefined()
    state = resp.state
    expect(state.players[0]!.resources.sheep).toBe(0)
  })

  it('D178 Substitute Teacher action space is usable only after all three Lessons spaces are occupied', () => {
    const session = setupCardOwner('D178_SubstituteTeacher')
    let state = session.getState().state

    expect(state.actionSpaces.find((space) => space.id === 'D178_SubstituteTeacher')).toBeDefined()
    expect(session.takeAction(0, 'D178_SubstituteTeacher').ok).toBe(false)

    occupySpace(session, 'lessons', 'p2')
    occupySpace(session, 'lessons-56-2f', 'p3')
    occupySpace(session, 'lessons-56-variable', 'p4')

    state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'D178_SubstituteTeacher')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('D178 Substitute Teacher ignores linked blocked Lessons spaces and is owner-only', () => {
    const blocked = setupCardOwner('D178_SubstituteTeacher')
    occupySpace(blocked, 'lessons', 'p2')
    occupySpace(blocked, 'lessons-56-2f', 'p3')
    occupySpace(blocked, 'modest-wish-children-56', 'p4')

    expect(blocked.takeAction(0, 'D178_SubstituteTeacher').ok).toBe(false)

    const nonOwner = setupCardOwner('D178_SubstituteTeacher')
    occupySpace(nonOwner, 'lessons', 'p2')
    occupySpace(nonOwner, 'lessons-56-2f', 'p3')
    occupySpace(nonOwner, 'lessons-56-variable', 'p4')
    const state = nonOwner.getState().state
    state.currentPlayerIndex = 1
    nonOwner.loadState(state)

    expect(nonOwner.takeAction(1, 'D178_SubstituteTeacher').ok).toBe(false)
  })

  it('D178 Substitute Teacher can choose the crop pair reward', () => {
    const session = setupCardOwner('D178_SubstituteTeacher')
    occupySpace(session, 'lessons', 'p2')
    occupySpace(session, 'lessons-56-2f', 'p3')
    occupySpace(session, 'lessons-56-variable', 'p4')
    let state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'D178_SubstituteTeacher')
    const crop = findOptionWithPreview(resp, '"vegetable":1')
    expect(crop).toBeDefined()

    resp = session.resolveChoice(0, crop!.value)

    state = resp.state
    expect(state.players[0]!.resources.grain).toBe(1)
    expect(state.players[0]!.resources.vegetable).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { resourceOptions, setupResourceAction } from './_helpers/batch07-resource-ownership'

import '../../shared/cards/E/E038_RodCollection'

describe('E038 Rod Collection through Session', () => {
  it.each([0, 1, 2])('commits the selected %i wood from supply onto the card', (wood) => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 2
    session.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 1
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    const choice = wood === 0
      ? resourceOptions(response).find((option) => option.value === '__skip__')
      : resourceOptions(response).find((option) => option.effectPreview?.resourcesPaid?.wood === wood)
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, choice!.value)
    expect(response.state.players[0]!.resources.wood).toBe(2 - wood)
    expect(readCardExtraData<number>(response.state.players[0]!, 'E038_RodCollection', 'woodCount') ?? 0).toBe(wood)
  })

  it('hides unaffordable choices and atomically rejects a forged choice before a legal retry', () => {
    const session = setupResourceAction('E038_RodCollection', 'fishing')
    session.state.players[0]!.resources.wood = 1
    session.loadState(session.state)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), 'E038_RodCollection')
    expect(resourceOptions(offered).some((option) => option.effectPreview?.resourcesPaid?.wood === 2)).toBe(false)
    const before = JSON.stringify({ player: offered.state.players[0], interaction: offered.interaction })
    const rejected = session.resolveChoice(0, 'forged-two-wood')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify({ player: rejected.state.players[0], interaction: rejected.interaction })).toBe(before)
    const one = resourceOptions(rejected).find((option) => option.effectPreview?.resourcesPaid?.wood === 1)!
    const resolved = session.resolveChoice(0, one.value)
    expect(resolved.ok, resolved.error).toBe(true)
    expect(resolved.state.players[0]!.resources.wood).toBe(0)
    expect(readCardExtraData<number>(resolved.state.players[0]!, 'E038_RodCollection', 'woodCount')).toBe(1)
  })
})

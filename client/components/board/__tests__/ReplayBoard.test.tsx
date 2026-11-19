// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReplayBoard } from '../../../../replay-viewer/src/ReplayBoard'
import { frameForPerspective } from '../../../../replay-viewer/src/model'
import { confirmNextPlayer } from '../../../../server/__tests__/_helpers/pending-confirms'
import { getChoiceOptions } from '../../../../server/__tests__/_helpers/session-assertions'
import { createWorkSession } from '../../../../server/__tests__/_helpers/session-fixtures'
import { registerLanguagePack } from '../../../../shared/i18n'
import { serializeSessionSnapshot, serializeStateForPlayer } from '../../../../shared/session/serialization'

it('shows public Guest markers, count and log through replay frames', () => {
  const locale = 'replay-guest-fixture'
  registerLanguagePack({ version: 1, locale, messages: {
    'cardFaces.CI073_Guest.name': 'Guest',
    'actions.fishing.name': 'Fishing',
    'ui.guest.marker': "{player}'s Guest ({card})",
    'ui.guest.pending': 'Guests available ({count})',
    'log.guestGranted': '{player} receives a Guest from {card} for round {round}',
    'log.guestDispatched': '{player} dispatches a Guest to {space}',
  } })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const session = createWorkSession({ seed: 62, configure(state) {
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.players[0]!.name = 'Alice'
    state.players[0]!.nameIsDefault = false
  } })
  const frame = () => frameForPerspective(serializeSessionSnapshot(session.state, session).frame, 'p1')
  const publicState = () => session.withCtx(() => serializeStateForPlayer(session.state, [], { actionHooks: session.actionHooks }))
  const board = () => <ReplayBoard frame={frame()} locale={locale} perspective="p1" />
  try {
    expect(session.devPlayCard(0, 'CI073').ok).toBe(true)
    const { container, rerender } = render(board())
    const futureMarker = '[data-source-card="CI073_Guest"] .res-icon-guest'
    expect(container.querySelector(futureMarker)).toBeInTheDocument()
    expect(container).toHaveTextContent('Alice receives a Guest from Guest for round 2')
    expect(publicState().players[0]!.scheduledEffects).toMatchObject([{ sourceCard: 'CI073_Guest', round: 2 }])

    for (const [player, space] of [[0, 'forest'], [1, 'day-laborer'], [0, 'clay-pit'], [1, 'reed-bank']] as const) {
      expect(session.takeAction(player, space).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    expect(session.state.round).toBe(2)
    rerender(board())
    expect(container.querySelector(futureMarker)).toBeNull()
    expect(container.querySelector('[data-testid="player-pending-guests"]')).toHaveAccessibleName('Guests available (1)')
    expect(publicState().players[0]!.playerPanelSummary.guests?.pending).toBe(1)

    const option = getChoiceOptions(session.getState()).find(choice => choice.labelParams?.guestCardId === 'CI073_Guest')
    expect(option).toBeDefined()
    expect(session.resolveChoice(0, option!.value).ok).toBe(true)
    expect(session.resolveChoice(0, 'fishing').ok).toBe(true)
    rerender(board())
    expect(container.querySelector('[data-testid="player-pending-guests"]')).toBeNull()
    expect(container.querySelector('[data-action-id="fishing"] [role="img"]')).toHaveAccessibleName("Alice's Guest (Guest)")
    expect(container).toHaveTextContent('Alice dispatches a Guest to Fishing')
    expect(publicState().log).toContainEqual(expect.objectContaining({ key: 'log.guestDispatched' }))

    expect(session.undoAction().ok).toBe(true)
    expect(publicState().log.some(entry => entry.key === 'log.guestDispatched')).toBe(false)
    rerender(board())
    expect(Array.from(container.querySelectorAll('.action-log__text--canceled'), row => row.textContent))
      .toContain('Alice dispatches a Guest to Fishing')
    expect(container.querySelector('.action-log__controls')).toBeNull()
  } finally {
    session.dispose()
    vi.unstubAllGlobals()
  }
})

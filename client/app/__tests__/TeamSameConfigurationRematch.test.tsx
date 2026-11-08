// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TeamSameConfigurationRematch } from '../TeamSameConfigurationRematch'
import { startRoomCreation } from '../../services/room-creation'
import { CommandRejectedError } from '../../services/gameTransport'

vi.mock('../../services/room-creation', () => ({ startRoomCreation: vi.fn(), resumePendingRoomCreation: () => null }))
vi.mock('../../utils/platform-page-url', () => ({ setPage: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

const configuration = { kind: 'team', maxPlayers: 4,
  teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'random', scoring: 'sum' },
  enableCommunityDeck: false, customCardIds: [], officialCardPool: 'default-implemented-A-E',
  enableParentCards: false, draftParents: true, enableThroughTheSeasons: false,
  enableFarmersOfTheMoor: false, enableMoorBalanceRules: false,
  enableSnakeOpening: true, allowIncompleteFarmersOfTheMoorMinorDeal: false,
}
const stubAccount = (available: boolean) => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes('/api/auth/me')
    ? { ok: true, user: { experimentalFeatures: available ? ['team-modes'] : [] } }
    : { ok: true, configuration, issues: [] })))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

it('keeps the completed-team rematch visible and locked for an unqualified participant', async () => {
  stubAccount(false)
  render(<TeamSameConfigurationRematch roomId="finished-team" locale="en" />)
  expect(await screen.findByRole('button', { name: 'Play again with these settings' })).toBeDisabled()
  expect(screen.getByText('Rematching a team game requires beta access. Ask a player who has it to start one.')).toBeVisible()
  expect(startRoomCreation).not.toHaveBeenCalled()
})

it('creates a fresh team room through the original source configuration for a qualified participant', async () => {
  stubAccount(true)
  vi.mocked(startRoomCreation).mockResolvedValue({ roomId: 'fresh-team' })
  render(<TeamSameConfigurationRematch roomId="finished-team" locale="en" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Play again with these settings' }))
  expect(startRoomCreation).toHaveBeenCalledWith({ sourceGameContextId: 'finished-team' })
})

it('shows a failed creation on the form and rereads /me after access was revoked', async () => {
  const fetcher = stubAccount(true)
  const refresh = vi.fn()
  vi.mocked(startRoomCreation).mockRejectedValueOnce(new CommandRejectedError({ ok: false, code: 'experimental_feature_unavailable' }))
  render(<TeamSameConfigurationRematch roomId="finished-team" locale="en" onExperimentalFeatureUnavailable={refresh} />)
  const button = await screen.findByRole('button', { name: 'Play again with these settings' })
  fetcher.mockImplementation(async input => new Response(JSON.stringify(String(input).includes('/api/auth/me')
    ? { ok: true, user: { experimentalFeatures: [] } } : { ok: true, configuration, issues: [] })))
  await userEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Team modes are not available to you. No room was created.')
  await waitFor(() => expect(button).toBeDisabled())
  expect(refresh).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/api/auth/me'))).toHaveLength(2)
})

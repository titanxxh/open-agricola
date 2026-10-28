// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SameConfigurationRematch } from '../SameConfigurationRematch'
import { startRoomCreation } from '../../../services/room-creation'
import { setPage } from '../../../utils/platform-page-url'
import type { SoloCreationConfiguration } from '../../../../shared/contract/game-creation'
import { CommandRejectedError } from '../../../services/gameTransport'

vi.mock('../../../services/room-creation', async importOriginal => ({
  ...await importOriginal<typeof import('../../../services/room-creation')>(),
  startRoomCreation: vi.fn(), resumePendingRoomCreation: () => null,
}))
vi.mock('../../../utils/platform-page-url', () => ({ setPage: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const configuration: SoloCreationConfiguration = { kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'choose-7',
  officialCardPool: 'default-implemented-A-E', enableCommunityDeck: true, customCardIds: ['missing-card'],
  enableParentCards: true, draftParents: false, enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true }

it('keeps public results visible when private qualification is forbidden or fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'not_participant', message: 'Private' }), { status: 403 })))
  const view = render(<><p>Public final score: 5.5</p><SameConfigurationRematch roomId="finished" locale="en" /></>)
  await waitFor(() => expect(screen.queryByText('Checking your saved settings…')).toBeNull())
  expect(screen.getByText('Public final score: 5.5')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Play again with these settings' })).toBeNull()
  view.unmount()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Private read unavailable') }))
  render(<><p>Public final score: 5.5</p><SameConfigurationRematch roomId="finished" locale="en" /></>)
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible()
  expect(screen.getByText('Public final score: 5.5')).toBeVisible()
})

it('starts from the durable source and navigates only after successful creation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, configuration, issues: [] }))))
  let finish: (value: { roomId: string }) => void = () => { throw new Error('Creation not started') }
  vi.mocked(startRoomCreation).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  render(<SameConfigurationRematch roomId="finished" locale="en" displayName="Owner" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play again with these settings' }))
  expect(startRoomCreation).toHaveBeenCalledExactlyOnceWith({ sourceGameContextId: 'finished', name: 'Owner' })
  expect(setPage).not.toHaveBeenCalled()
  finish({ roomId: 'fresh' })
  await waitFor(() => expect(setPage).toHaveBeenCalledExactlyOnceWith('game', { room: 'fresh' }))
  expect(fetch).toHaveBeenCalledWith('/api/v1/game-contexts/finished/creation-configuration', expect.objectContaining({ credentials: 'include', cache: 'no-store' }))
})

it('opens unchanged unavailable settings and submits an adjusted ordinary creation without the source id', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(String(url).includes('creation-configuration')
    ? { ok: true, configuration, issues: [{ workshopCardId: 'missing-card', reason: 'missing' }] }
    : { ok: true, cards: [], hasMore: false }))))
  vi.mocked(startRoomCreation).mockReturnValueOnce(new Promise(() => undefined))
  render(<SameConfigurationRematch roomId="finished" locale="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play again with these settings' }))
  expect(screen.getByText('This selected card no longer exists.')).toBeVisible()
  expect(startRoomCreation).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('checkbox', { name: /missing-card/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(startRoomCreation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ maxPlayers: 1, soloHandMode: 'choose-7', customCardIds: [], enableFarmersOfTheMoor: true, enableMoorBalanceRules: true }))
  expect(vi.mocked(startRoomCreation).mock.calls[0]?.[0]).not.toHaveProperty('sourceGameContextId')
  expect(setPage).not.toHaveBeenCalled()
})

it('uses the full submission-time adjustment when a card changes after successful private preflight', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(String(url).includes('creation-configuration')
    ? { ok: true, configuration, issues: [] } : { ok: true, cards: [], hasMore: false }))))
  vi.mocked(startRoomCreation).mockRejectedValueOnce(new CommandRejectedError({ ok: false, code: 'creation_requires_adjustment',
    creationAdjustment: { configuration, issues: [{ workshopCardId: 'missing-card', reason: 'load-failed' }] } }))
  render(<SameConfigurationRematch roomId="finished" locale="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play again with these settings' }))
  expect(await screen.findByText('This card could not be loaded. You can retry without removing it.')).toBeVisible()
  expect(screen.getByRole('checkbox', { name: /missing-card/ })).toBeChecked()
  expect(setPage).not.toHaveBeenCalled()
  vi.mocked(startRoomCreation).mockReturnValueOnce(new Promise(() => undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('checkbox', { name: /missing-card/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /missing-card/ })).toBeDisabled()
})

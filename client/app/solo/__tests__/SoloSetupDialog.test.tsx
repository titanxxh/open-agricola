// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SoloSetupDialog } from '../SoloSetupDialog'
import type { SoloCreationConfiguration } from '../../../../shared/contract/game-creation'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('submits the optional Moor balance choice and clears it when Moor is unchecked', () => {
  const submit = vi.fn()
  render(<SoloSetupDialog locale="en" creating={false} onClose={vi.fn()} onSubmit={submit} />)
  expect(screen.queryByRole('checkbox', { name: 'Moor balance rules' })).toBeNull()
  const moor = screen.getByRole('checkbox', { name: /Farmers of the Moor expansion/ })
  fireEvent.click(moor)
  expect(screen.getByRole('checkbox', { name: 'Moor balance rules' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Moor balance rules' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ enableFarmersOfTheMoor: true, enableMoorBalanceRules: true }))
  fireEvent.click(moor)
  fireEvent.click(moor)
  expect(screen.getByRole('checkbox', { name: 'Moor balance rules' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ enableFarmersOfTheMoor: true, enableMoorBalanceRules: false }))
})

it('offers a fixed one-player setup and submits both hand modes with independent expansion choices', () => {
  const submit = vi.fn()
  render(<SoloSetupDialog locale="en" creating={false} onClose={vi.fn()} onSubmit={submit} />)
  expect(screen.getByText('1 player')).toBeVisible()
  expect(screen.queryByText('Snake opening')).toBeNull()
  expect(screen.queryByRole('button', { name: '2 Players' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /Choose 7 from 10/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Parent Cards expansion/ }))
  fireEvent.click(screen.getByRole('radio', { name: 'Random parents' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Through the Seasons expansion/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Farmers of the Moor expansion/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenCalledExactlyOnceWith({ kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'choose-7',
    officialCardPool: 'default-implemented-A-E', enableCommunityDeck: false, customCardIds: [],
    enableParentCards: true, draftParents: false, enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: false })
})

it('preserves unavailable explicit choices until the player removes them and then submits adjusted settings', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, cards: [], hasMore: false }))))
  const configuration: SoloCreationConfiguration = { kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'random',
    officialCardPool: 'default-implemented-A-E', enableCommunityDeck: true, customCardIds: ['missing-card'],
    enableParentCards: false, draftParents: true, enableThroughTheSeasons: false, enableFarmersOfTheMoor: false, enableMoorBalanceRules: false }
  const submit = vi.fn()
  render(<SoloSetupDialog locale="en" creating={false} initialConfiguration={configuration}
    issues={[{ workshopCardId: 'missing-card', reason: 'missing' }]} onClose={vi.fn()} onSubmit={submit} />)
  expect(screen.getByText('This selected card no longer exists.')).toBeVisible()
  expect(await screen.findByRole('checkbox', { name: /missing-card/ })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenLastCalledWith(configuration)
  fireEvent.click(screen.getByRole('checkbox', { name: /missing-card/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenLastCalledWith({ ...configuration, customCardIds: [] })
})

it('keeps selected Workshop cards when community is disabled and requires an explicit correction', async () => {
  vi.stubEnv('VITE_ENABLE_COMMUNITY_DECK', 'true')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, cards: [{ id: 'explicit-card', name: 'Explicit card' }], hasMore: false }))))
  const submit = vi.fn()
  render(<SoloSetupDialog locale="en" creating={false} onClose={vi.fn()} onSubmit={submit} />)
  const community = screen.getByRole('checkbox', { name: /Enable community cards/ })
  fireEvent.click(community)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Explicit card' }))
  fireEvent.click(community)
  expect(screen.getByRole('checkbox', { name: 'Explicit card' })).toBeChecked()
  expect(screen.getByText('Enable community cards to use the selected Workshop cards, or deselect them.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Start solo game' })).toBeDisabled()
  fireEvent.click(community)
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ enableCommunityDeck: true, customCardIds: ['explicit-card'] }))
})

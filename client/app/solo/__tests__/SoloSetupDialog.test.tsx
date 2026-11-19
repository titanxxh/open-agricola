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

it('drops a retained Workshop selection: games load only merged cards (ADR 0052)', () => {
  vi.stubEnv('VITE_ENABLE_COMMUNITY_DECK', 'true')
  vi.stubGlobal('fetch', vi.fn())
  const configuration: SoloCreationConfiguration = { kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'random',
    officialCardPool: 'default-implemented-A-E', enableCommunityDeck: true, customCardIds: ['retained-card'],
    enableParentCards: false, draftParents: true, enableThroughTheSeasons: false, enableFarmersOfTheMoor: false, enableMoorBalanceRules: false }
  const submit = vi.fn()
  render(<SoloSetupDialog locale="en" creating={false} initialConfiguration={configuration}
    issues={[{ workshopCardId: 'retained-card', reason: 'missing' }]} onClose={vi.fn()} onSubmit={submit} />)
  expect(screen.queryByText('Reviewed workshop cards')).toBeNull()
  expect(screen.queryByText('This selected card no longer exists.')).toBeNull()
  expect(screen.getByRole('checkbox', { name: /Enable community cards/ })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Start solo game' }))
  expect(submit).toHaveBeenLastCalledWith({ ...configuration, customCardIds: [] })
  expect(fetch).not.toHaveBeenCalled()
})

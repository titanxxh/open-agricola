import { useCallback, useEffect, useState } from 'react'
import type { GameCreationConfigurationResponse } from '../../shared/contract/game-creation'
import { t, type Locale } from '../../shared/i18n'
import { API_BASE } from '../config'
import { readGameCreationConfiguration } from '../services/creation-configuration'
import { CommandRejectedError } from '../services/gameTransport'
import { useRoomCreation } from './solo/useRoomCreation'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

async function readAvailability(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', cache: 'no-store', signal })
  const value: unknown = await response.json()
  return response.ok && object(value) && value.ok === true && object(value.user)
    && Array.isArray(value.user.experimentalFeatures) && value.user.experimentalFeatures.includes('team-modes')
}

type Lookup = { phase: 'loading' } | { phase: 'failed' }
  | { phase: 'resolved'; response: GameCreationConfigurationResponse; available: boolean }

/** Private creation checks never hide the public completed result. */
export function TeamSameConfigurationRematch({ roomId, locale, onExperimentalFeatureUnavailable }: {
  roomId: string
  locale: Locale
  onExperimentalFeatureUnavailable?: () => void
}) {
  const [lookup, setLookup] = useState<Lookup>({ phase: 'loading' })
  const [retry, setRetry] = useState(0)
  const creation = useRoomCreation()
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([readGameCreationConfiguration(roomId, controller.signal), readAvailability(controller.signal)])
      .then(([response, available]) => { if (!controller.signal.aborted) setLookup({ phase: 'resolved', response, available }) })
      .catch(() => { if (!controller.signal.aborted) setLookup({ phase: 'failed' }) })
    return () => controller.abort()
  }, [roomId, retry])
  const failure = creation.state.phase === 'failed' ? creation.state.error : undefined
  const unavailable = failure instanceof CommandRejectedError && failure.code === 'experimental_feature_unavailable'
  const refreshAvailability = useCallback(() => {
    onExperimentalFeatureUnavailable?.()
    const controller = new AbortController()
    void readAvailability(controller.signal).catch(() => false).then(available => {
      if (!controller.signal.aborted) setLookup(previous => previous.phase === 'resolved' ? { ...previous, available } : previous)
    })
    return () => controller.abort()
  }, [onExperimentalFeatureUnavailable])
  useEffect(() => { if (unavailable) return refreshAvailability() }, [unavailable, refreshAvailability])
  if (lookup.phase === 'loading') return <p role="status">{t(locale, 'solo.checking')}</p>
  if (lookup.phase === 'failed') return <p>{t(locale, 'solo.configurationUnavailable')}{' '}
    <button type="button" className="btn-link" onClick={() => { setLookup({ phase: 'loading' }); setRetry(value => value + 1) }}>{t(locale, 'solo.retry')}</button></p>
  if (!lookup.response.ok && (lookup.response.code === 'login_required' || lookup.response.code === 'not_participant')) return null
  if (lookup.response.ok && lookup.response.configuration.kind !== 'team') return null
  return <div className="solo-rematch-actions">
    <button type="button" className="btn-primary" disabled={!lookup.available || !lookup.response.ok || creation.creating}
      onClick={() => creation.create({ sourceGameContextId: roomId })}>{t(locale, creation.creating ? 'solo.creating' : 'solo.rematch')}</button>
    {!lookup.available ? <p className="beta-rematch-reason">{t(locale, 'beta.rematchRequiresAccess')}</p> : null}
    {!lookup.response.ok ? <p>{t(locale, 'solo.configurationUnavailable')}</p> : null}
    {failure ? <p className="form-error" role="alert">{t(locale, unavailable ? 'beta.featureUnavailable' : 'solo.creationFailed')}</p> : null}
  </div>
}

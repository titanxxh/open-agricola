import { useEffect, useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { SoloCreationConfigurationResponse } from '../../../shared/contract/game-creation'
import { readSoloCreationConfiguration } from '../../services/solo-creation-configuration'
import { soloRoomOptions } from '../../services/room-creation'
import { SoloSetupDialog } from './SoloSetupDialog'
import { useRoomCreation } from './useRoomCreation'

type Lookup = { phase: 'loading'; roomId: string } | { phase: 'resolved'; roomId: string; response: SoloCreationConfigurationResponse }
  | { phase: 'failed'; roomId: string }

export function SameConfigurationRematch({ roomId, locale, displayName }: { roomId: string; locale: Locale; displayName?: string }) {
  const [lookup, setLookup] = useState<Lookup>({ phase: 'loading', roomId })
  const [retry, setRetry] = useState(0)
  const [showSetup, setShowSetup] = useState(false)
  const creation = useRoomCreation()
  useEffect(() => {
    const controller = new AbortController()
    void readSoloCreationConfiguration(roomId, controller.signal).then(response => {
      if (!controller.signal.aborted) setLookup({ phase: 'resolved', roomId, response })
    }).catch(() => { if (!controller.signal.aborted) setLookup({ phase: 'failed', roomId }) })
    return () => controller.abort()
  }, [roomId, retry])
  const response = lookup.roomId === roomId && lookup.phase === 'resolved' ? lookup.response : undefined
  if (response && !response.ok && (response.code === 'login_required' || response.code === 'not_participant')) return null
  const saved = response?.ok ? response : undefined
  const configuration = creation.adjustment?.configuration ?? saved?.configuration
  const issues = creation.adjustment?.issues ?? saved?.issues ?? []
  const retryRead = () => { setLookup({ phase: 'loading', roomId }); setRetry(value => value + 1) }
  return (
    <div className="solo-rematch-actions">
      {lookup.roomId !== roomId || lookup.phase === 'loading' ? <p role="status">{t(locale, 'solo.checking')}</p> : null}
      {lookup.phase === 'failed' ? <p>{t(locale, 'solo.creationFailed')} <button type="button" className="btn-link" onClick={retryRead}>{t(locale, 'solo.retry')}</button></p> : null}
      {response && !response.ok ? <p>{t(locale, response.code === 'source_not_completed' ? 'solo.checking' : 'solo.configurationUnavailable')}
        <button type="button" className="btn-link" onClick={retryRead}>{t(locale, 'solo.retry')}</button>
        {response.code === 'creation_configuration_unavailable' ? <button type="button" className="btn-secondary" onClick={() => setShowSetup(true)}>{t(locale, 'solo.entry')}</button> : null}
      </p> : null}
      {saved ? <button type="button" className="btn-primary" disabled={creation.creating} onClick={() => {
        if (issues.length) setShowSetup(true)
        else creation.create({ sourceGameContextId: roomId, name: displayName })
      }}>{t(locale, creation.creating ? 'solo.creating' : 'solo.rematch')}</button> : null}
      {creation.state.phase === 'failed' && !creation.adjustment ? <p role="alert">{t(locale, 'solo.creationFailed')}</p> : null}
      {showSetup || creation.adjustment ? <SoloSetupDialog
        locale={locale} initialConfiguration={configuration} issues={issues} creating={creation.creating}
        error={creation.state.phase === 'failed' && !creation.adjustment ? t(locale, 'solo.creationFailed') : undefined}
        onClose={() => { setShowSetup(false); creation.clearError() }}
        onSubmit={settings => { setShowSetup(true); creation.create(soloRoomOptions(settings, displayName)) }} /> : null}
    </div>
  )
}

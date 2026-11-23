import { useEffect, useState } from 'react'
import type { PlayerPreferences } from '../../shared/contract/types'
import { parsePlayerPreferences } from '../../shared/domain/player-preferences'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { Section } from '../components/common/Section'

const PATH = '/api/account/game-preferences'

const readPreferences = async (response: Response): Promise<PlayerPreferences> => {
  const body: unknown = await response.json()
  const preferences = response.ok && body && typeof body === 'object' && 'preferences' in body
    ? parsePlayerPreferences(body.preferences) : null
  if (!preferences) throw new Error('game_preferences_unavailable')
  return preferences
}

/** Account defaults for seat settings (#2039); each new game copies them when it starts. */
export function GamePreferencesSettings() {
  const { user, apiFetch } = useAuth()
  const { t } = useLocale()
  const [preferences, setPreferences] = useState<PlayerPreferences | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let live = true
    void (async () => {
      try {
        const value = await readPreferences(await apiFetch(PATH))
        if (live) { setPreferences(value); setFailed(false) }
      } catch { if (live) setFailed(true) }
    })()
    return () => { live = false }
  }, [userId, apiFetch])

  if (!userId) return null
  const save = async (autoResolveIndependentReactions: boolean) => {
    setBusy(true); setFailed(false)
    try {
      setPreferences(await readPreferences(await apiFetch(PATH, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoResolveIndependentReactions }),
      })))
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <Section title={t('platform.gamePreferences.title')} variant="parchment">
    <p><label>
      <input type="checkbox" data-testid="account-auto-resolve-reactions"
        checked={preferences?.autoResolveIndependentReactions ?? true}
        disabled={!preferences || busy}
        onChange={(event) => { void save(event.target.checked) }} />
      {' '}{t('platform.gamePreferences.autoResolveReactions')}
    </label></p>
    <p className="settings-hint">{t('platform.gamePreferences.autoResolveReactionsHint')}</p>
    {failed && <p role="alert">{t('platform.gamePreferences.failed')}</p>}
  </Section>
}

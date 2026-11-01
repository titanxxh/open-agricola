import { useEffect, useState } from 'react'
import type { ActionReference, ActionReferenceCatalog } from '../../../shared/contract/action-reference'
import { t, type Locale } from '../../../shared/i18n'
import { isMoorSpecialActionId } from '../../../shared/projections/moor-special-actions'
import { loadActionReferences } from '../../services/action-references'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ActionSpaceFace } from '../board/ActionSpaceFace'
import { SpecialActionCardFace } from '../board/SpecialActionCardFace'

export function StaticActionPreview({ reference, locale, playerCount }: {
  reference: ActionReference; locale: Locale; playerCount?: number
}) {
  const [catalog, setCatalog] = useState<ActionReferenceCatalog>()
  const [failed, setFailed] = useState(false)
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    let active = true
    void loadActionReferences().then(data => { if (active) setCatalog(data) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])

  if (!catalog) return <p role="status">{t(locale, failed ? 'ui.actionReference.unavailable' : 'platform.loading')}</p>
  const candidates = reference.kind === 'space'
    ? catalog.spaces.filter(space => reference.ids.includes(space.id))
    : catalog.moorCards.filter(card => reference.ids.some(id => card.actions.includes(id)))
  const applicable = playerCount ? candidates.filter(entry => entry.players.includes(playerCount)) : candidates
  const entries = applicable.length ? applicable : candidates
  if (!entries.length || reference.ids.some(id => reference.kind === 'space'
    ? !catalog.spaces.some(space => space.id === id)
    : !catalog.moorCards.some(card => card.actions.includes(id)))) {
    return <p role="alert">{t(locale, 'ui.actionReference.invalid')}</p>
  }
  // Identical printed content at several counts appears once, with all applicable counts.
  const groups = new Map<string, { entry: typeof entries[number]; players: number[] }>()
  for (const entry of entries) {
    const { players, ...printed } = entry
    const displayedPlayers = playerCount && players.includes(playerCount) ? [playerCount] : players
    const key = JSON.stringify(printed)
    const existing = groups.get(key)
    if (existing) existing.players.push(...displayedPlayers)
    else groups.set(key, { entry, players: [...displayedPlayers] })
  }
  return <div className="action-reference-preview__entries">
    {[...groups.values()].map(({ entry, players }) => (
      <section key={`${entry.id}:${players.join(',')}`} data-reference-target={entry.id}>
        <p className="action-reference-preview__players">{t(locale, 'moor.specialActions.players', { count: players.join('/') })}</p>
        {'actions' in entry ? <>
          {!failedImages.has(entry.image) && <img src={publicAssetUrl(entry.image)} alt=""
            onError={() => setFailedImages(current => new Set([...current, entry.image]))} />}
          <SpecialActionCardFace locale={locale} players={players} actions={entry.actions.filter(isMoorSpecialActionId)} highlightedActions={reference.ids} />
        </> : <>
          <ActionSpaceFace locale={locale} actionId={entry.id} nameKey={entry.nameKey} preview={entry.preview} gainPerRound={entry.gainPerRound} fallback={t(locale, entry.descriptionKey)} />
          <p>{t(locale, entry.descriptionKey)}</p>
          {entry.rulesKey && <p>{t(locale, entry.rulesKey)}</p>}
        </>}
      </section>
    ))}
  </div>
}

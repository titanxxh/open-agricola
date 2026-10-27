import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SoloCreationConfiguration, SoloCreationIssue } from '../../../shared/contract/game-creation'
import { t, type Locale } from '../../../shared/i18n'
import { API_BASE } from '../../config'
import './solo.css'

const defaultSoloConfiguration: SoloCreationConfiguration = {
  kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'random', officialCardPool: 'default-implemented-A-E',
  enableCommunityDeck: false, customCardIds: [], enableParentCards: false, draftParents: true,
  enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
}
type WorkshopCard = { id: string; name: string }
const isWorkshopCard = (value: unknown): value is WorkshopCard => value !== null && typeof value === 'object'
  && 'id' in value && typeof value.id === 'string' && 'name' in value && typeof value.name === 'string'

export function SoloSetupDialog({ locale, initialConfiguration, issues = [], creating, error, onClose, onSubmit }: {
  locale: Locale
  initialConfiguration?: SoloCreationConfiguration
  issues?: readonly SoloCreationIssue[]
  creating: boolean
  error?: string
  onClose: () => void
  onSubmit: (configuration: SoloCreationConfiguration) => void
}) {
  const showCommunity = import.meta.env.VITE_ENABLE_COMMUNITY_DECK === 'true' || initialConfiguration?.enableCommunityDeck === true
  const showWorkshop = showCommunity || (initialConfiguration?.customCardIds.length ?? 0) > 0
  const [configuration, setConfiguration] = useState(() => initialConfiguration ?? defaultSoloConfiguration)
  const [cards, setCards] = useState<WorkshopCard[]>([])
  const [catalogStatus, setCatalogStatus] = useState<'idle' | 'loading' | 'error'>(showWorkshop ? 'loading' : 'idle')
  const [retry, setRetry] = useState(0)
  const loadWorkshop = configuration.enableCommunityDeck || (initialConfiguration?.customCardIds.length ?? 0) > 0
  useEffect(() => {
    if (!loadWorkshop) return
    const controller = new AbortController()
    void (async () => {
      const loaded: WorkshopCard[] = []
      for (let page = 1; ; page++) {
        const response = await fetch(`${API_BASE}/api/workshop/cards?scope=room&page=${page}`, { credentials: 'include', signal: controller.signal })
        const body: unknown = await response.json()
        if (!response.ok || !body || typeof body !== 'object' || !('ok' in body) || body.ok !== true
          || !('cards' in body) || !Array.isArray(body.cards) || !body.cards.every(isWorkshopCard)) throw new Error('Card source response unavailable')
        loaded.push(...body.cards)
        if (!('hasMore' in body) || body.hasMore !== true) break
      }
      if (!controller.signal.aborted) { setCards(loaded); setCatalogStatus('idle') }
    })().catch(() => { if (!controller.signal.aborted) setCatalogStatus('error') })
    return () => controller.abort()
  }, [loadWorkshop, retry])
  const toggleCard = (id: string) => setConfiguration(current => ({ ...current,
    customCardIds: current.customCardIds.includes(id) ? current.customCardIds.filter(cardId => cardId !== id) : [...current.customCardIds, id],
  }))
  const selectedCards = configuration.customCardIds.filter(id => !cards.some(card => card.id === id)).map(id => ({ id, name: id }))
  const currentIssues = issues.filter(issue => configuration.customCardIds.includes(issue.workshopCardId))
  const requiresCommunity = !configuration.enableCommunityDeck && configuration.customCardIds.length > 0
  return createPortal(
    <div className="solo-dialog-backdrop">
      <section className="solo-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="solo-setup-title">
        <header className="solo-hand-heading">
          <h2 id="solo-setup-title">{t(locale, initialConfiguration ? 'solo.adjustTitle' : 'solo.setupTitle')}</h2>
          <p><strong>{t(locale, 'solo.fixedPlayers')}</strong> · {t(locale, 'solo.setupHint')}</p>
          <p>{t(locale, 'solo.officialPool')}</p>
        </header>
        <div className="solo-setup-body">
          {currentIssues.length ? <div className="solo-creation-issues" role="status">
            <p>{t(locale, 'solo.adjustHint')}</p>
            <ul>{currentIssues.map(issue => <li key={issue.workshopCardId}>
              <span>{t(locale, 'solo.selectedCard', { id: issue.logicalCardId ?? issue.workshopCardId })}</span>
              <p>{t(locale, `solo.issues.${issue.reason}`)}</p>
            </li>)}</ul>
          </div> : null}
          {error ? <p role="alert">{error}</p> : null}
          <fieldset className="solo-setup-fields" disabled={creating}>
            <fieldset><legend>{t(locale, 'solo.handMode')}</legend>
              {(['random', 'choose-7'] as const).map(mode => <label key={mode}>
                <input type="radio" name="solo-hand-mode" checked={configuration.soloHandMode === mode}
                  onChange={() => setConfiguration(current => ({ ...current, soloHandMode: mode }))} />
                <span>{t(locale, mode === 'random' ? 'solo.random' : 'solo.choose7')}<small>{t(locale, mode === 'random' ? 'solo.randomHint' : 'solo.choose7Hint')}</small></span>
              </label>)}
            </fieldset>
            <label><input type="checkbox" checked={configuration.enableParentCards} onChange={event => setConfiguration(current => ({ ...current, enableParentCards: event.target.checked }))} />{t(locale, 'platform.enableParentCards')}</label>
            {configuration.enableParentCards ? <fieldset><legend>{t(locale, 'solo.parentsMode')}</legend>
              <label><input type="radio" name="solo-parent-mode" checked={configuration.draftParents} onChange={() => setConfiguration(current => ({ ...current, draftParents: true }))} />{t(locale, 'solo.parentsChoose')}</label>
              <label><input type="radio" name="solo-parent-mode" checked={!configuration.draftParents} onChange={() => setConfiguration(current => ({ ...current, draftParents: false }))} />{t(locale, 'solo.parentsRandom')}</label>
            </fieldset> : null}
            <label><input type="checkbox" checked={configuration.enableThroughTheSeasons} onChange={event => setConfiguration(current => ({ ...current, enableThroughTheSeasons: event.target.checked }))} />{t(locale, 'platform.enableThroughTheSeasons')}</label>
            <label><input type="checkbox" checked={configuration.enableFarmersOfTheMoor} onChange={event => setConfiguration(current => ({ ...current, enableFarmersOfTheMoor: event.target.checked }))} />{t(locale, 'platform.enableFarmersOfTheMoor')}</label>
            {showCommunity ? <label><input type="checkbox" checked={configuration.enableCommunityDeck}
              onChange={event => setConfiguration(current => ({ ...current, enableCommunityDeck: event.target.checked }))} />
              {t(locale, 'ui.copy.client_app_LobbyPage_tsx.enable_community_cards_community_deck_3250b6')}</label> : null}
            {showWorkshop && (configuration.enableCommunityDeck || configuration.customCardIds.length > 0) ? <fieldset><legend>{t(locale, 'platform.reviewedWorkshopCards')}</legend>
              {requiresCommunity ? <p role="status">{t(locale, 'solo.workshopRequiresCommunity')}</p> : null}
              {catalogStatus === 'loading' ? <p>{t(locale, 'solo.loadingSources')}</p> : null}
              {catalogStatus === 'error' ? <p role="alert">{t(locale, 'solo.sourceLoadFailed')} <button type="button" onClick={() => { setCatalogStatus('loading'); setRetry(value => value + 1) }}>{t(locale, 'solo.retry')}</button></p> : null}
              {catalogStatus === 'idle' && !cards.length && !selectedCards.length ? <p>{t(locale, 'platform.reviewedWorkshopCardsEmpty')}</p> : null}
              {[...selectedCards, ...cards].map(card => <label key={card.id}>
                <input type="checkbox" checked={configuration.customCardIds.includes(card.id)} disabled={!configuration.enableCommunityDeck && !configuration.customCardIds.includes(card.id)} onChange={() => toggleCard(card.id)} />
                <span>{card.name}</span>
              </label>)}
            </fieldset> : null}
          </fieldset>
        </div>
        <footer className="solo-hand-footer solo-setup-footer">
          <button type="button" className="btn-primary" disabled={creating || requiresCommunity} onClick={() => onSubmit(configuration)}>{t(locale, creating ? 'solo.creating' : 'solo.start')}</button>
          <button type="button" className="btn-link" disabled={creating} onClick={onClose}>{t(locale, 'platform.cancel')}</button>
        </footer>
      </section>
    </div>, document.body,
  )
}

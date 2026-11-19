import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { SoloCreationConfiguration, SoloCreationIssue } from '../../../shared/contract/game-creation'
import { isMoorBalanceRulesEnabled } from '../../../shared/contract/game-variants'
import { t, type Locale } from '../../../shared/i18n'
import './solo.css'

const defaultSoloConfiguration: SoloCreationConfiguration = {
  kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'random', officialCardPool: 'default-implemented-A-E',
  enableCommunityDeck: false, customCardIds: [], enableParentCards: false, draftParents: true,
  enableThroughTheSeasons: false, enableFarmersOfTheMoor: false, enableMoorBalanceRules: false,
}

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
  // Games load only merged cards (ADR 0052): a retained Workshop selection is dropped.
  const [configuration, setConfiguration] = useState(() => initialConfiguration
    ? { ...initialConfiguration, customCardIds: [], enableMoorBalanceRules: isMoorBalanceRulesEnabled(initialConfiguration) }
    : defaultSoloConfiguration)
  const currentIssues = issues.filter(issue => configuration.customCardIds.includes(issue.workshopCardId))
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
            <label><input type="checkbox" checked={configuration.enableFarmersOfTheMoor} onChange={event => setConfiguration(current => ({ ...current, enableFarmersOfTheMoor: event.target.checked, enableMoorBalanceRules: false }))} />{t(locale, 'platform.enableFarmersOfTheMoor')}</label>
            {configuration.enableFarmersOfTheMoor ? <label>
              <input type="checkbox" aria-label={t(locale, 'platform.moorBalanceRules')}
                checked={configuration.enableMoorBalanceRules}
                onChange={event => setConfiguration(current => ({ ...current, enableMoorBalanceRules: event.target.checked }))} />
              <span>{t(locale, 'platform.moorBalanceRules')}<small>{t(locale, 'platform.moorBalanceRulesHint')}</small></span>
            </label> : null}
            {showCommunity ? <label><input type="checkbox" checked={configuration.enableCommunityDeck}
              onChange={event => setConfiguration(current => ({ ...current, enableCommunityDeck: event.target.checked }))} />
              {t(locale, 'ui.copy.client_app_LobbyPage_tsx.enable_community_cards_community_deck_3250b6')}</label> : null}
          </fieldset>
        </div>
        <footer className="solo-hand-footer solo-setup-footer">
          <button type="button" className="btn-primary" disabled={creating} onClick={() => onSubmit(configuration)}>{t(locale, creating ? 'solo.creating' : 'solo.start')}</button>
          <button type="button" className="btn-link" disabled={creating} onClick={onClose}>{t(locale, 'platform.cancel')}</button>
        </footer>
      </section>
    </div>, document.body,
  )
}

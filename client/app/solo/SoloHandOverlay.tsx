import { useState, type ReactNode } from 'react'
import type { SoloHandGroupKind, SoloHandSelectionGroup, SoloHandSelectionSubmission } from '../../../shared/contract/solo-hand-selection'
import { t, type Locale } from '../../../shared/i18n'
import { PlayerCard } from '../../components/common/PlayerCard'
import { getCardDisplayName } from '../../components/common/cardText'
import './solo.css'

const groupLabels: Record<SoloHandGroupKind, string> = {
  occupation: 'solo.groups.occupation', minor: 'solo.groups.minor', 'moor-minor': 'solo.groups.moor-minor',
}

export function SoloHandOverlay({ groups, locale, onSubmit, actions }: {
  groups: readonly SoloHandSelectionGroup[]
  locale: Locale
  onSubmit: (selection: SoloHandSelectionSubmission) => void | Promise<void>
  actions?: ReactNode
}) {
  const [selection, setSelection] = useState<SoloHandSelectionSubmission>(() => ({ groups: groups.map(group => ({ kind: group.kind, cardIds: [] })) }))
  const [status, setStatus] = useState<'editing' | 'submitting' | 'error'>('editing')
  const submitting = status === 'submitting'
  const valid = groups.every(group => {
    const selected = selection.groups.find(item => item.kind === group.kind)?.cardIds ?? []
    return selected.length === group.keepCount && selected.every(id => group.cardIds.includes(id))
  })
  const toggle = (kind: SoloHandGroupKind, cardId: string) => {
    if (submitting) return
    setStatus('editing')
    setSelection(current => ({ groups: current.groups.map(group => group.kind === kind
      ? { ...group, cardIds: group.cardIds.includes(cardId) ? group.cardIds.filter(id => id !== cardId) : [...group.cardIds, cardId] }
      : group) }))
  }
  const submit = async () => {
    if (!valid || submitting) return
    setStatus('submitting')
    try { await onSubmit(selection) } catch { setStatus('error') }
  }
  return (
    <section className="solo-hand-overlay" role="dialog" aria-label={t(locale, 'solo.handTitle')}>
      <header className="solo-hand-heading">
        <h2>{t(locale, 'solo.handTitle')}</h2>
        <p>{t(locale, 'solo.handHint')}</p>
      </header>
      <div className="solo-hand-groups">
        {actions}
        {groups.map(group => {
          const selected = selection.groups.find(item => item.kind === group.kind)?.cardIds ?? []
          return (
            <fieldset key={group.kind} className="solo-hand-group" disabled={submitting}>
              <legend>{t(locale, groupLabels[group.kind])} <span aria-live="polite">{t(locale, 'solo.selected', { selected: selected.length, required: group.keepCount })}</span></legend>
              <div className="solo-hand-grid">
                {group.cardIds.map(cardId => (
                  <div key={cardId} className="solo-hand-card">
                    <PlayerCard locale={locale} cardId={cardId} cardType={group.kind === 'occupation' ? 'occupation' : 'minor'}
                      selectable selected={selected.includes(cardId)} disabled={submitting}
                      touchInteraction={{ kind: 'inspect' }} onClick={() => toggle(group.kind, cardId)} />
                    <label className="solo-hand-card-choice">
                      <input type="checkbox" checked={selected.includes(cardId)} onChange={() => toggle(group.kind, cardId)} />
                      {getCardDisplayName(locale, cardId)}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          )
        })}
      </div>
      <footer className="solo-hand-footer">
        {status === 'error' ? <p role="alert">{t(locale, 'solo.selectionFailed')}</p> : null}
        <button type="button" className="btn-primary" disabled={!valid || submitting} onClick={() => { void submit() }}>
          {t(locale, submitting ? 'solo.submitting' : 'solo.confirmHand')}
        </button>
      </footer>
    </section>
  )
}

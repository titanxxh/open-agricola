import { t as translateMessage } from '../../../shared/i18n'
import { useCurrentLocale } from '../../contexts/LocaleContext'
import { useEffect, useState, type ReactNode } from 'react'
import { startPropose, submissionStatus, type ProposeResponse } from '../../services/workshop-pr'

export type ProposeCard = { id: string; card_id: string; name: string; art_url: string | null }

const hints = (locale: string): Record<string,string> => ({
  submission_pending: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.submission_is_processing_you_can_close_this_04f381"),
  github_unavailable: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_is_temporarily_unavailable_your_submission_has_5ba405"),
  github_network_error: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_server_could_not_reach_github_your_377dae"),
  github_timeout: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_timed_out_your_submission_has_been_3252c3"),
  github_invalid_response: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_returned_an_unreadable_response_your_submission_0680f2"),
  submission_internal_error: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.workshop_could_not_process_the_submission_your_1ac047"),
  branch_publish_failed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_could_not_confirm_the_branch_update_869b4d"),
  pr_head_pending: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_received_the_commit_waiting_for_the_3c1723"),
  creation_unknown: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.it_is_not_yet_clear_whether_github_19dfc2"),
  ambiguous_pr: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.multiple_possible_prs_were_found_contact_a_d8fb47"),
  generated_file_changed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.a_maintainer_changed_the_card_source_art_58093e"),
  generated_paths_changed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_card_or_art_paths_changed_contact_6dd1b2"),
  branch_conflict: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_pr_received_another_commit_during_verification_96adda"),
  pr_scope_changed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_original_pr_includes_other_changes_that_a5a41f"),
  pr_rebase_conflict: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_independent_tests_conflict_with_the_latest_60462c"),
  pr_paused: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.a_maintainer_made_the_pr_a_draft_aa632c"),
  pr_closed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_original_pr_was_closed_only_an_786109"),
  pr_open: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_original_pr_was_reopened_resubmitting_will_9a4523"),
  pr_merged: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_pr_was_merged_the_card_will_8b3c5e"),
  legacy_submission: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.this_is_an_older_submission_resubmitting_preserves_33ccde"),
  legacy_review_required: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_older_pr_has_no_verifiable_generation_7e469a"),
  invalid_art: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_art_url_is_unsupported_upload_and_022770"),
  art_unavailable: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_art_file_is_temporarily_unavailable_retry_e53b6a"),
  workshop_app_unavailable: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_workshop_github_app_is_temporarily_unavailable_c2806c"),
  rate_limited: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.too_many_submissions_retry_later_a11b08"),
  github_rate_limited: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.github_requested_a_delay_wait_before_verifying_675180"),
  submission_busy: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_submission_status_changed_verify_the_original_47888f"),
  draft_changed_before_submit: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_draft_changed_during_verification_validate_and_f87b5c"),
  draft_changed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_version_from_the_time_of_submission_c1bb70"),
  handoff_not_ready: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.validate_the_current_version_and_confirm_it_33e69f"),
  localization_not_ready: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.complete_the_chinese_card_name_and_description_b33e45"),
  already_reviewed: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.unpublish_and_edit_the_card_before_submitting_1958fa"),
  network_error: translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_connection_was_interrupted_the_result_is_13579b"),
})

export function ProposeModal({card,onClose,onSuccess}: {
  card: ProposeCard; onClose: () => void; onSuccess?: (prUrl: string) => void
}) {
  const locale = useCurrentLocale()
  const [result,setResult] = useState<ProposeResponse>()
  const [busy,setBusy] = useState(false)
  const [agreed,setAgreed] = useState(false)
  const [retryRestart,setRetryRestart] = useState(false)
  const [clock,setClock] = useState({now:0,retryAt:0})
  useEffect(() => {
    const delay = result && !result.ok ? result.retryAfter ?? 0 : 0
    if (delay <= 0) return
    const retryAt = Date.now() + delay * 1000
    const tick = () => setClock({now:Date.now(),retryAt})
    tick()
    const timer = window.setInterval(() => {
      tick()
      if (Date.now() >= retryAt) window.clearInterval(timer)
    },1000)
    return () => window.clearInterval(timer)
  },[result])
  const remaining = result && !result.ok && result.retryAfter
    ? Math.max(0,Math.ceil((clock.retryAt-clock.now)/1000)) : 0
  useEffect(() => {
    let active = true
    void submissionStatus(card.id).then(value => { if (active) setResult(value) }).catch(() => {
      if (active) setResult({ok:false,code:'network_error'})
    })
    return () => { active = false }
  },[card.id])

  useEffect(() => {
    if (busy || !result || result.ok || result.state !== 'pending' || result.needsAttention) return
    let active = true
    let timer: number
    const poll = () => {
      void submissionStatus(card.id).then(value => { if (active) setResult(value) }).catch(() => {
        if (active) timer = window.setTimeout(poll,15_000)
      })
    }
    timer = window.setTimeout(poll,15_000)
    return () => { active = false; window.clearTimeout(timer) }
  },[card.id,result,busy])

  async function run(action: 'submit' | 'recover' | 'restart') {
    setBusy(true)
    try {
      const value = await startPropose(card.id,action)
      setResult(previous => {
        if (value.ok) return value
        const saved = action === 'recover' && previous && !previous.ok && previous.submissionId
          && !value.submissionId && value.code !== 'no_submission' ? previous : undefined
        return {...saved,...value,retryAfter:value.retryAfter,prUrl:value.prUrl ?? previous?.prUrl}
      })
      setRetryRestart(action === 'restart' && !value.ok && !value.submissionId && !['pr_open','pr_merged'].includes(value.code ?? ''))
      if (value.ok) onSuccess?.(value.prUrl)
    } catch {
      setRetryRestart(false)
      try { setResult(await submissionStatus(card.id)) }
      catch { setResult({ok:false,code:'network_error'}) }
    } finally { setBusy(false) }
  }
  const code = result?.code
  const recover = result && !result.ok && (result.submissionId || code === 'network_error')
  const restart = code === 'pr_closed' || code === 'legacy_submission' || retryRestart
  const paused = result && !result.ok && result.state === 'pending' && result.needsAttention
  return <ModalShell title={translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.submit_a_pr_to_the_main_repository_f0df0d")} onClose={onClose}>
    <div style={{padding:16}}>
      <h3>{card.name}</h3>
      <p>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_workshop_bot_will_submit_your_adopted_545e37")}</p>
      {busy && <p role="status">{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.verifying_and_processing_your_submission_you_can_7f7dec")}</p>}
      {code && code !== 'no_submission' && <p role="status">
        {hints(locale)[code] ?? translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.the_submission_needs_attention_contact_a_maintainer_c2dea0")}
        {paused && translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.automatic_retries_are_paused_select_verify_again_9a46e9")}
        {remaining > 0 && translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.wait_seconds_before_retrying_f8fee8", { value0: remaining })}
      </p>}
      {result?.prUrl && <p><a href={result.prUrl} target="_blank" rel="noreferrer">{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.view_review_pr_280482")}</a>{result.ok && !code && translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.submitted_awaiting_maintainer_review_09e5a8")}</p>}
      {result?.submissionId && <p style={{fontSize:'0.85em'}}>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.submission_id_c83940")}{result.submissionId}</p>}
      {code !== 'pr_merged' && (!recover || restart) && <label style={{display:'flex',gap:8}}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)}/>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.i_agree_to_publish_this_submission_with_08b2ce")}</label>}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
        <button type="button" onClick={onClose}>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.close_6cf4a7")}</button>
        {recover && <button type="button" disabled={busy || remaining > 0} onClick={() => void run('recover')}>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.verify_again_ff7a53")}</button>}
        {restart && <button type="button" disabled={busy || !agreed || remaining > 0} onClick={() => void run('restart')}>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.submit_again_26d672")}</button>}
        {!restart && !recover && code !== 'pr_merged' && <button type="button" disabled={busy || !agreed || !result || remaining > 0} onClick={() => void run('submit')}>{translateMessage(locale, "ui.copy.client_app_workshop_ProposeModal_tsx.open_pr_c49a5b")}</button>}
      </div>
    </div>
  </ModalShell>
}

function ModalShell({
  title, onClose, children,
}: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel-bg, #fff)', color: 'inherit', borderRadius: 8,
          width: 520, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{title}</strong>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}
              aria-label="close"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

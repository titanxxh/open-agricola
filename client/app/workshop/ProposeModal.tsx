import { useEffect, useRef, useState, type ReactNode } from 'react'
import { startPropose, submissionStatus, type ProposeResponse } from '../../services/workshop-pr'

export type ProposeCard = { id: string; card_id: string; name: string; art_url: string | null }

const hints: Record<string,string> = {
  submission_pending: '投稿正在处理，可以关闭窗口，稍后回来查看。',
  github_unavailable: 'GitHub 暂时不可用。原投稿已保留，稍后核实结果。',
  pr_head_pending: 'GitHub 已收到提交，正在等待 PR 状态同步。原投稿会继续核实。',
  creation_unknown: '尚不能确认 GitHub 是否已创建 PR。请再次核实；仍无结果时请联系维护者并提供投稿编号。',
  ambiguous_pr: '找到多个可能的 PR，请联系维护者核实投稿编号。',
  generated_file_changed: '维护者修改了该卡的源码、图片或生成的索引。更新已暂停，请在原 PR 中协作整合；草稿和人工修改均已保留。',
  generated_paths_changed: '卡牌或图片路径发生变化，请联系维护者整合原 PR。',
  branch_conflict: '核查后 PR 又有新提交。更新已暂停，请联系维护者检查原 PR。',
  pr_scope_changed: '原 PR 包含需要维护者整合的其他修改，更新已暂停。',
  pr_rebase_conflict: '独立测试与最新主分支冲突，请先由维护者整合原 PR。',
  pr_paused: '维护者将 PR 设为草稿或修改了目标分支。请处理原 PR 后再次核实。',
  pr_closed: '原 PR 已关闭。只有明确选择重新投稿才会创建新的 PR，旧 PR 将保留。',
  pr_merged: 'PR 已合并，卡牌将随包含它的版本发布。',
  legacy_submission: '这是旧投稿。重新投稿会保留旧 PR 历史，并要求新 PR 重新审核。人工修改需先由维护者整合。',
  legacy_review_required: '旧 PR 缺少可验证的生成基线，请联系维护者核查源码、图片和测试后再迁移。',
  invalid_art: '卡图地址不受支持，请在工坊重新上传并采用图片后再投稿。',
  art_unavailable: '卡图文件暂不可用，请稍后重试；旧投稿图片缺失时，请联系维护者恢复原图。草稿和旧 PR 均已保留。',
  workshop_app_unavailable: '工坊 GitHub App 尚未就绪或授权不可用，请联系维护者。草稿和原投稿已保留。',
  rate_limited: '投稿过于频繁，请稍后再试。',
  github_rate_limited: 'GitHub 要求暂缓请求，请等待后再次核实。',
  submission_busy: '投稿状态已变化，请重新核实原投稿后再试。',
  draft_changed_before_submit: '草稿在核查时发生变化。请校验并确认当前版本后重新投稿。',
  draft_changed: '已提交当时的版本。你后续编辑的草稿已保留，需要另行提交审核。',
  handoff_not_ready: '请先完成当前版本的校验和沙盒确认。',
  localization_not_ready: '请先完成中文卡名和说明。',
  already_reviewed: '请先下架并编辑卡牌，再提交新的审核版本。',
  network_error: '连接中断，尚不能确认投稿结果。请再次核实原投稿。',
}

export function ProposeModal({card,onClose,onSuccess}: {
  card: ProposeCard; onClose: () => void; onSuccess?: (prUrl: string) => void
}) {
  const polls = useRef(0)
  const [result,setResult] = useState<ProposeResponse>()
  const [busy,setBusy] = useState(false)
  const [agreed,setAgreed] = useState(false)
  const [retryRestart,setRetryRestart] = useState(false)
  useEffect(() => {
    let active = true
    void submissionStatus(card.id).then(value => { if (active) setResult(value) }).catch(() => {
      if (active) setResult({ok:false,code:'network_error'})
    })
    return () => { active = false }
  },[card.id])

  useEffect(() => {
    if (!result || result.ok || result.state !== 'pending' || result.needsAttention || polls.current >= 4) return
    const timer = window.setTimeout(() => {
      polls.current++
      void submissionStatus(card.id).then(setResult).catch(() => {})
    },15_000)
    return () => window.clearTimeout(timer)
  },[card.id,result])

  async function run(action: 'submit' | 'recover' | 'restart') {
    setBusy(true)
    polls.current = 0
    try {
      const value = await startPropose(card.id,action)
      setResult(previous => !value.ok && !value.prUrl ? {...value,prUrl:previous?.prUrl} : value)
      setRetryRestart(action === 'restart' && !value.ok && !value.submissionId)
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
  return <ModalShell title="提交 PR 到主仓库" onClose={onClose}>
    <div style={{padding:16}}>
      <h3>{card.name}</h3>
      <p>工坊机器人将把你采用的卡牌内容、图片和设计者署名提交到公开仓库。维护者批准当前版本后即可上架，合并后随游戏版本发布。</p>
      {busy && <p role="status">正在核实并处理投稿… 可以关闭窗口，稍后回来查看。</p>}
      {code && code !== 'no_submission' && <p role="status">{hints[code] ?? '投稿需要处理，请联系维护者。'}{!result?.ok && !!result?.retryAfter && ` 请等待 ${result.retryAfter} 秒。`}</p>}
      {result?.prUrl && <p><a href={result.prUrl} target="_blank" rel="noreferrer">查看审核 PR</a>{result.ok && !code && ' · 已提交，等待维护者审核'}</p>}
      {result?.submissionId && <p style={{fontSize:'0.85em'}}>投稿编号：{result.submissionId}</p>}
      {(!recover || restart) && <label style={{display:'flex',gap:8}}><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)}/>我确认公开投稿，并保留设计者署名</label>}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
        <button type="button" onClick={onClose}>关闭</button>
        {recover && <button type="button" disabled={busy} onClick={() => void run('recover')}>再次核实</button>}
        {restart && <button type="button" disabled={busy || !agreed} onClick={() => void run('restart')}>重新投稿</button>}
        {!restart && !recover && <button type="button" disabled={busy || !agreed || !result} onClick={() => void run('submit')}>发起 PR</button>}
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

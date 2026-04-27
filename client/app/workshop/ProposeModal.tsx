import { useState, type ReactNode } from 'react'
import {
  startPropose,
  completePropose,
  openOAuthPopupAndWait,
  type ProposeFailure,
} from '../../services/workshop-pr'

// Minimal shape needed by this modal. Kept local so this file doesn't
// depend on WorkshopPage's full WorkshopCard definition.
export type ProposeCard = {
  id: string
  card_id: string
  name: string
  art_url: string | null
}

type Stage = 'preview' | 'auth' | 'progress'

type Step = { key: string; label: string; done: boolean; error?: string }
type FailureInfo = { summary: string; detail?: string }

const INITIAL_STEPS: Step[] = [
  { key: 'github', label: '正在连接 GitHub', done: false },
  { key: 'fork', label: '创建 / 更新 fork', done: false },
  { key: 'files', label: '上传文件', done: false },
  { key: 'pr', label: '创建 / 更新 PR', done: false },
]

export function ProposeModal({
  card,
  onClose,
  onSuccess,
}: {
  card: ProposeCard
  onClose: () => void
  onSuccess?: (prUrl: string) => void
}) {
  const [stage, setStage] = useState<Stage>('preview')
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [prUrl, setPrUrl] = useState<string>()
  const [failure, setFailure] = useState<FailureInfo>()
  const [agreed, setAgreed] = useState(false)

  function markStep(key: string, patch: Partial<Step>) {
    setSteps((s) => s.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  async function runFlow() {
    setStage('auth')
    setFailure(undefined)
    setPrUrl(undefined)
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, done: false, error: undefined })))

    // Phase 1: initial propose (no handshakeId yet).
    const phase1 = await startPropose(card.id)
    if (phase1.ok) {
      // Unexpected but harmless: server completed without auth.
      setStage('progress')
      markStep('github', { done: true })
      markStep('fork', { done: true })
      markStep('files', { done: true })
      markStep('pr', { done: true })
      setPrUrl(phase1.prUrl)
      onSuccess?.(phase1.prUrl)
      return
    }
    if (!('needsAuth' in phase1) || !phase1.needsAuth) {
      setStage('progress')
      const failureInfo = describeProposeFailure(phase1)
      markStep('github', { error: failureInfo.summary })
      setFailure(failureInfo)
      return
    }

    const { authUrl, handshakeId } = phase1
    const popupResult = await openOAuthPopupAndWait(authUrl, handshakeId)
    if (!popupResult.ok) {
      setStage('progress')
      const failureInfo = describePopupFailure(popupResult.error)
      markStep('github', { error: failureInfo.summary })
      setFailure(failureInfo)
      return
    }

    setStage('progress')
    markStep('github', { done: true })

    // Phase 2: complete propose — server does fork + files + PR.
    const phase2 = await completePropose(card.id, handshakeId)
    if (phase2.ok) {
      markStep('fork', { done: true })
      markStep('files', { done: true })
      markStep('pr', { done: true })
      setPrUrl(phase2.prUrl)
      onSuccess?.(phase2.prUrl)
    } else if ('needsAuth' in phase2 && phase2.needsAuth) {
      // Token expired between phases — re-loop via OAuth.
      const failureInfo = describePopupFailure('needs_reauth')
      setSteps((s) => {
        const next = [...s]
        const idx = next.findIndex((it) => !it.done)
        if (idx >= 0) next[idx] = { ...next[idx]!, error: failureInfo.summary }
        return next
      })
      setFailure(failureInfo)
    } else {
      const failureInfo = describeProposeFailure(phase2)
      setSteps((s) => {
        const next = [...s]
        const idx = next.findIndex((it) => !it.done)
        if (idx >= 0) next[idx] = { ...next[idx]!, error: failureInfo.summary }
        return next
      })
      setFailure(failureInfo)
    }
  }

  const canCloseViaShell = stage === 'preview' || (stage === 'progress' && (!!prUrl || !!failure))

  return (
    <ModalShell onClose={canCloseViaShell ? onClose : undefined} title="提交 PR 到主仓库">
      {stage === 'preview' && (
        <ProposePreview
          card={card}
          agreed={agreed}
          onAgreedChange={setAgreed}
          onCancel={onClose}
          onConfirm={runFlow}
        />
      )}
      {stage === 'auth' && (
        <div style={{ padding: 16 }}>
          <p>正在等待 GitHub 授权…</p>
          <p style={{ fontSize: '0.9em', opacity: 0.7 }}>
            若弹窗被拦截，请允许弹窗后点击下方按钮重试。
          </p>
          <button type="button" onClick={runFlow}>重试</button>
          <button type="button" style={{ marginLeft: 8 }} onClick={onClose}>取消</button>
        </div>
      )}
      {stage === 'progress' && (
        <ProposeProgress
          steps={steps}
          prUrl={prUrl}
          failure={failure}
          onRetry={runFlow}
          onClose={onClose}
        />
      )}
    </ModalShell>
  )
}

function describeProposeFailure(resp: ProposeFailure): FailureInfo {
  const code = resp.code ?? resp.error ?? 'failed'
  const message = resp.message?.trim()
  const retryAfter = resp.retryAfter ? `可在 ${resp.retryAfter} 秒后重试。` : undefined
  const detail = [message, retryAfter].filter(Boolean).join(' ')
  return {
    summary: message ? `${code}: ${message}` : code,
    detail: detail || undefined,
  }
}

function describePopupFailure(error: string | undefined): FailureInfo {
  const code = error ?? 'oauth_cancelled'
  const details: Record<string, string> = {
    timeout: 'GitHub 授权弹窗超时。请确认弹窗没有被浏览器拦截，然后重试。',
    oauth_cancelled: 'GitHub 授权未完成或已取消。',
    needs_reauth: '授权信息已过期，需要重新连接 GitHub。',
  }
  return { summary: code, detail: details[code] }
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
          minWidth: 480, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto',
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

function ProposePreview({
  card, agreed, onAgreedChange, onCancel, onConfirm,
}: {
  card: ProposeCard
  agreed: boolean
  onAgreedChange: (v: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const hasArt = !!card.art_url
  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>预览 PR 内容</h3>
      <p>
        将在主仓库 fork 上创建 <strong>{hasArt ? 5 : 4}</strong> 个文件的 commit，然后开启 Pull Request。
      </p>
      <ul style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
        <li>shared/cards/community/{card.card_id}.ts</li>
        <li>shared/cards/community/__tests__/{card.card_id}.test.ts</li>
        {hasArt && <li>public/card-art/community/{card.card_id}.&lt;ext&gt;</li>}
        <li>shared/cards/register-all.ts (插入一行 import + 一行 entry)</li>
        <li>docs/community_cards.md (追加一行)</li>
      </ul>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 16 }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
        />
        <span>
          我确认提交此 PR（将以我的 GitHub 账号在主仓库 fork 上创建分支并开 PR）
        </span>
      </label>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" disabled={!agreed} onClick={onConfirm}>发起 PR</button>
      </div>
    </div>
  )
}

function ProposeProgress({
  steps, prUrl, failure, onRetry, onClose,
}: {
  steps: Step[]
  prUrl?: string
  failure?: FailureInfo
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{prUrl ? 'PR 已创建 ✓' : '正在提交 PR'}</h3>
      <ol style={{ listStyle: 'none', padding: 0 }}>
        {steps.map((s) => {
          const icon = s.done ? '✓' : s.error ? '✗' : '…'
          return (
            <li key={s.key} style={{ padding: '4px 0' }}>
              <span style={{ display: 'inline-block', width: '1.5em' }}>{icon}</span>
              {s.label}
              {s.error && (
                <span style={{ color: 'crimson', marginLeft: 8 }}>— {s.error}</span>
              )}
            </li>
          )
        })}
      </ol>
      {prUrl && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,180,0,0.1)', borderRadius: 4 }}>
          <a href={prUrl} target="_blank" rel="noreferrer">{prUrl}</a>
          <button
            type="button"
            style={{ marginLeft: 12 }}
            onClick={() => { void navigator.clipboard?.writeText(prUrl) }}
          >
            复制链接
          </button>
          <p style={{ fontSize: '0.9em', opacity: 0.75, marginTop: 8, marginBottom: 0 }}>
            你的卡已提交 · maintainer 会在 PR 里 review，合并后会以社区卡身份进入主仓库。
          </p>
        </div>
      )}
      {failure && !prUrl && (
        <div style={{ marginTop: 16 }}>
          <div
            role="alert"
            style={{
              padding: 12,
              border: '1px solid rgba(220, 20, 60, 0.35)',
              background: 'rgba(220, 20, 60, 0.08)',
              borderRadius: 4,
              color: 'crimson',
            }}
          >
            <div><strong>提交失败：</strong>{failure.summary}</div>
            {failure.detail && (
              <div style={{ marginTop: 6, fontSize: '0.9em', whiteSpace: 'pre-wrap' }}>
                详细信息：{failure.detail}
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button type="button" onClick={onRetry}>重试</button>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </div>
      )}
      {prUrl && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      )}
    </div>
  )
}

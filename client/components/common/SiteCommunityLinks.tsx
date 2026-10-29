import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../config'
import { useLocale } from '../../contexts/LocaleContext'
import { GitHubRepoLink } from './GitHubRepoLink'
import feishuIcon from './feishu-icon.svg'
import './SiteCommunityLinks.css'

type CommunityPlatform = 'wechat' | 'feishu'

function CommunityGroupDialog({ platform, onClose }: { platform: CommunityPlatform; onClose: () => void }) {
  const { t } = useLocale()
  const copy = platform === 'wechat' ? {
    title: t('ui.wechatCommunity.title'), hint: t('ui.wechatCommunity.hint'),
    imageAlt: t('ui.wechatCommunity.imageAlt'), loading: t('ui.wechatCommunity.loading'),
    unavailable: t('ui.wechatCommunity.unavailable'), retry: t('ui.wechatCommunity.retry'),
  } : {
    title: t('ui.feishuCommunity.title'), hint: t('ui.feishuCommunity.hint'),
    imageAlt: t('ui.feishuCommunity.imageAlt'), loading: t('ui.feishuCommunity.loading'),
    unavailable: t('ui.feishuCommunity.unavailable'), retry: t('ui.feishuCommunity.retry'),
  }
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [requestId, setRequestId] = useState(Date.now)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return createPortal(
    <dialog ref={dialog} className="community-group-dialog" aria-labelledby={titleId}
      onClose={event => { if (!event.currentTarget.open) onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="community-group-dialog__content">
        <header>
          <h2 id={titleId}>{copy.title}</h2>
          <button type="button" className="community-group-dialog__close" onClick={onClose} aria-label={t('ui.close')}>×</button>
        </header>
        <p>{copy.hint}</p>
        {status === 'loading' && <p role="status">{copy.loading}</p>}
        {status === 'error' ? <div role="status">
          <p>{copy.unavailable}</p>
          <button type="button" onClick={() => { setStatus('loading'); setRequestId(Date.now()) }}>
            {copy.retry}
          </button>
        </div> : <img key={requestId} className="community-group-dialog__qr"
          src={`${API_BASE}/api/community/${platform}-qr?request=${requestId}`}
          alt={copy.imageAlt} hidden={status !== 'ready'}
          onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
      </div>
    </dialog>, document.body,
  )
}

export function SiteCommunityLinks() {
  const { t } = useLocale()
  const [open, setOpen] = useState<CommunityPlatform | null>(null)
  const communities: Array<{ platform: CommunityPlatform; label: string }> = [
    { platform: 'wechat', label: t('ui.wechatCommunity.label') },
    { platform: 'feishu', label: t('ui.feishuCommunity.label') },
  ]
  return (
    <div className="site-community-links">
      <GitHubRepoLink />
      {communities.map(({ platform, label }) => <button key={platform} type="button" className="github-repo-link community-group-button"
        aria-label={label} title={label} aria-haspopup="dialog" onClick={() => setOpen(platform)}>
        {platform === 'wechat' ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 3C4.6 3 1 5.9 1 9.5c0 2.1 1.2 4 3.1 5.2L3.3 17l2.8-1.4c.9.3 1.9.4 2.9.4h.5a6.2 6.2 0 0 1-.5-2.5c0-3.8 3.6-6.8 8-6.8h.2C15.9 4.5 12.7 3 9 3ZM6 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          <path d="M17 8c-3.9 0-7 2.5-7 5.5s3.1 5.5 7 5.5c.8 0 1.7-.1 2.4-.4l2.3 1.2-.6-2c1.8-1 2.9-2.6 2.9-4.3C24 10.5 20.9 8 17 8Zm-2.5 3a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm5 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z" />
        </svg> : <img src={feishuIcon} alt="" aria-hidden="true" />}
      </button>)}
      {open && <CommunityGroupDialog platform={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

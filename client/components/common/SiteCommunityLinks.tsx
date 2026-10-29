import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../config'
import { useLocale } from '../../contexts/LocaleContext'
import { GitHubRepoLink } from './GitHubRepoLink'
import './SiteCommunityLinks.css'

function WeChatGroupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLocale()
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
    <dialog ref={dialog} className="wechat-group-dialog" aria-labelledby={titleId}
      onClose={event => { if (!event.currentTarget.open) onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="wechat-group-dialog__content">
        <header>
          <h2 id={titleId}>{t('ui.wechatCommunity.title')}</h2>
          <button type="button" className="wechat-group-dialog__close" onClick={onClose} aria-label={t('ui.close')}>×</button>
        </header>
        <p>{t('ui.wechatCommunity.hint')}</p>
        {status === 'loading' && <p role="status">{t('ui.wechatCommunity.loading')}</p>}
        {status === 'error' ? <div role="status">
          <p>{t('ui.wechatCommunity.unavailable')}</p>
          <button type="button" onClick={() => { setStatus('loading'); setRequestId(Date.now()) }}>
            {t('ui.wechatCommunity.retry')}
          </button>
        </div> : <img key={requestId} className="wechat-group-dialog__qr"
          src={`${API_BASE}/api/community/wechat-qr?request=${requestId}`}
          alt={t('ui.wechatCommunity.imageAlt')} hidden={status !== 'ready'}
          onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
      </div>
    </dialog>, document.body,
  )
}

export function SiteCommunityLinks() {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const label = t('ui.wechatCommunity.label')
  return (
    <div className="site-community-links">
      <GitHubRepoLink />
      <button type="button" className="github-repo-link wechat-group-button"
        aria-label={label} title={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 3C4.6 3 1 5.9 1 9.5c0 2.1 1.2 4 3.1 5.2L3.3 17l2.8-1.4c.9.3 1.9.4 2.9.4h.5a6.2 6.2 0 0 1-.5-2.5c0-3.8 3.6-6.8 8-6.8h.2C15.9 4.5 12.7 3 9 3ZM6 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          <path d="M17 8c-3.9 0-7 2.5-7 5.5s3.1 5.5 7 5.5c.8 0 1.7-.1 2.4-.4l2.3 1.2-.6-2c1.8-1 2.9-2.6 2.9-4.3C24 10.5 20.9 8 17 8Zm-2.5 3a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm5 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z" />
        </svg>
      </button>
      {open && <WeChatGroupDialog onClose={() => setOpen(false)} />}
    </div>
  )
}

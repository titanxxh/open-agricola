import { useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import '../../styles/components/player-account-id.css'

export function PlayerAccountId({ userId }: { userId: string }) {
  const { t } = useLocale()
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null)
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }
  return (
    <div className="player-account-id">
      <span>{t('platform.playerAccountId')}</span>
      <code>{userId}</code>
      <button type="button" className="btn-small" onClick={() => { void copyId() }}>
        {t('platform.copyPlayerId')}
      </button>
      {copyStatus && <span role="status">{t(copyStatus === 'copied' ? 'platform.playerIdCopied' : 'platform.playerIdCopyFailed')}</span>}
    </div>
  )
}

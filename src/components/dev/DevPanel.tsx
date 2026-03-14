import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PlayerState, Resource } from '../../../shared/game/types'

type Props = {
  locale: Locale
  players: PlayerState[]
  devPlayerId: string
  devResource: keyof Resource
  devAmount: number
  devRound: number
  resourceKeys: (keyof Resource)[]
  setDevPlayerId: (value: string) => void
  setDevResource: (value: keyof Resource) => void
  setDevAmount: (value: number) => void
  setDevRound: (value: number) => void
  applyDevResource: () => void
  applyDevRound: () => void
  devCardId: string
  setDevCardId: (value: string) => void
  playDevCard: () => void
  drawDevCard: () => void
  saveDevState: () => void
  loadDevState: (file: File) => void
  createDevPasture?: () => void
  isInteractive: boolean
  seedValue: string
  onSeedChange: (value: string) => void
  onResetGame: () => void
}

export const DevPanel = ({
  locale,
  players,
  devPlayerId,
  devResource,
  devAmount,
  devRound,
  resourceKeys,
  setDevPlayerId,
  setDevResource,
  setDevAmount,
  setDevRound,
  applyDevResource,
  applyDevRound,
  devCardId,
  setDevCardId,
  playDevCard,
  drawDevCard,
  saveDevState,
  loadDevState,
  createDevPasture,
  isInteractive,
  seedValue,
  onSeedChange,
  onResetGame,
}: Props) => (
  <div className="dev-panel">
    <h3>{t(locale, 'ui.devPanelTitle')}</h3>
    <div className="dev-row dev-player-row">
      <div className="dev-field">
        <span>{t(locale, 'ui.devPlayer')}</span>
        <select value={devPlayerId} onChange={(event) => setDevPlayerId(event.target.value)}>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      <span className="dev-target-hint">{t(locale, 'ui.devTargetHint')}</span>
    </div>
    <div className="dev-section">
      <div className="dev-row">
        <div className="dev-field">
          <span>{t(locale, 'ui.devResource')}</span>
          <select
            value={devResource}
            onChange={(event) => setDevResource(event.target.value as keyof Resource)}
          >
            {resourceKeys.map((key) => (
              <option key={key} value={key}>
                {t(locale, `resources.${key}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="dev-field">
          <span>{t(locale, 'ui.devAmount')}</span>
          <input
            type="number"
            value={devAmount}
            onChange={(event) => setDevAmount(Number(event.target.value))}
          />
        </div>
        <button className="dev-apply" onClick={applyDevResource}>
          {t(locale, 'ui.devApply')}
        </button>
      </div>
      <div className="dev-row">
        <div className="dev-field">
          <span>{t(locale, 'ui.devRound')}</span>
          <input
            type="number"
            min={1}
            max={14}
            value={devRound}
            onChange={(event) => setDevRound(Number(event.target.value))}
          />
        </div>
        <button className="dev-apply" onClick={applyDevRound}>
          {t(locale, 'ui.devAdvanceRound')}
        </button>
      </div>
      <div className="dev-row">
        <div className="dev-field">
          <span>{t(locale, 'ui.devCardId')}</span>
          <input
            type="text"
            value={devCardId}
            onChange={(event) => setDevCardId(event.target.value)}
            placeholder={t(locale, 'ui.devCardPlaceholder')}
          />
        </div>
        <button className="dev-apply" onClick={playDevCard}>
          {t(locale, 'ui.devPlayCard')}
        </button>
        <button className="dev-apply" onClick={drawDevCard}>
          {t(locale, 'ui.devDrawCard')}
        </button>
      </div>
      <div className="dev-row">
        <button className="dev-apply" onClick={createDevPasture} style={{ width: '100%' }}>
          {t(locale, 'ui.devCreatePasture')}
        </button>
      </div>
      <div className="dev-row">
        <label className="seed-input">
          {t(locale, 'ui.resetSeed')}
          <input
            type="number"
            value={seedValue}
            placeholder={t(locale, 'ui.resetSeedPlaceholder')}
            onChange={(event) => onSeedChange(event.target.value)}
            disabled={!isInteractive}
          />
        </label>
        <button className="dev-apply" onClick={onResetGame} disabled={!isInteractive}>
          {t(locale, 'ui.resetGame')}
        </button>
      </div>
    </div>
    <DevStateActions locale={locale} saveDevState={saveDevState} loadDevState={loadDevState} />
  </div>
)

const DevStateActions = ({
  locale,
  saveDevState,
  loadDevState,
}: {
  locale: Locale
  saveDevState: () => void
  loadDevState: (file: File) => void
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const handlePickFile = () => {
    inputRef.current?.click()
  }
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    loadDevState(file)
    event.target.value = ''
  }
  return (
    <div className="dev-row">
      <button className="dev-apply" onClick={saveDevState}>
        {t(locale, 'ui.devSave')}
      </button>
      <button className="dev-apply" onClick={handlePickFile}>
        {t(locale, 'ui.devLoad')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

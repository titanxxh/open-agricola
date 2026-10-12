import { t } from '../../shared/i18n'
import { positionKey } from '../../shared/domain/farm'
import type { ClientGameState } from '../services/rehydrate'
import { PlayerFarmPanel, type PlayerFarmPanelProps } from '../components/board/PlayerFarmPanel'
import { buildFarmBoardProjection } from './farm-board-projection'

type Props = Pick<PlayerFarmPanelProps, 'view' | 'actions'> & {
  state: ClientGameState
  viewedPlayerId: string
  pastureCapacities: Record<string, Record<string, number>>
}

export function DesktopPublicFarms({ state, viewedPlayerId, pastureCapacities, view, actions }: Props) {
  return (
    <section className="desktop-public-farms">
      <h2>{t(view.locale, 'ui.publicFarms')}</h2>
      <div className="desktop-public-farms__grid">
        {state.players.filter(player => player.id !== viewedPlayerId).map(player => (
          <div key={player.id} className="desktop-public-farm" data-player-id={player.id}>
            <PlayerFarmPanel
              state={state}
              viewedPlayerId={player.id}
              showHand={false}
              view={{
                ...view,
                ...buildFarmBoardProjection({ displayPlayer: player, interaction: { stateId: 'idle', allowedCommands: [], anytimeActions: [] }, selectionInteraction: null, players: state.players, state, pastureCapacities }),
                fieldPositions: new Set(player.fields.map(positionKey)),
                maxStableSelections: 0,
                plowSelectableSet: new Set(),
                pendingPlowTile: null,
                pendingPositionSelections: new Set(),
                pendingSowSelections: {},
                sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 0 },
                pendingFenceSet: new Set(),
                pendingFenceSourceMap: undefined,
                pendingPalisadeSet: new Set(),
                fencePlacementMode: undefined,
                isReorgActive: false,
                hasReorgOverflow: false,
                animalReorg: null,
                isSelectingMinor: false,
                isSelectingOccupation: false,
                isSelectingImprovementAny: false,
                selectableMinorIds: new Set(),
                selectableOccupationIds: new Set(),
                cardAvailability: {},
                devMode: false,
                isInteractive: false,
                occupationHandSelection: undefined,
                highlightedHandCardId: undefined,
                highlightedFarmTileKeys: new Set(),
                highlightedFenceEdgeIds: new Set(),
              }}
              actions={actions}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

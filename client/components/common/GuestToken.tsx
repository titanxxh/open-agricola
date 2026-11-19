import type { PlayerState } from '../../../shared/contract/types'
import guestIcon from './guest-icon.svg'

/**
 * A Guest standing on an action space: the Guest portrait in a round token
 * ringed in its owner's colour. It takes a family meeple's place in the same
 * holder, so the two are told apart by shape.
 */
export function GuestToken({ color }: { color: PlayerState['color'] }) {
  return (
    <span className={`action-guest action-farmer-${color}`}>
      <img className="action-guest-icon" src={guestIcon} alt="" draggable={false} />
    </span>
  )
}

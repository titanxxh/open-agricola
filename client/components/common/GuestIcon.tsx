import guestIcon from './guest-icon.svg'

/** The Guest portrait as an inline icon. It is sized like a resource icon, by the font size its context gives `.res-icon`. */
export function GuestIcon() {
  return <img className="res-icon res-icon-guest" src={guestIcon} alt="" draggable={false} />
}

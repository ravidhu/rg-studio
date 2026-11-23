/**
 * State of the help cards. Only one card is open at a time. A card opened by
 * hovering closes when the pointer leaves, a card opened by a click or a key
 * is pinned and stays until it is dismissed.
 */
export interface HelpState {
  /** Identifier of the trigger whose card is open, `null` when none is. */
  openId: string | null
  pinned: boolean
}

export type HelpAction =
  | { type: 'hover'; id: string }
  | { type: 'leave'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'dismiss' }

export const HELP_CLOSED: HelpState = { openId: null, pinned: false }

export function helpReducer(state: HelpState, action: HelpAction): HelpState {
  switch (action.type) {
    case 'hover':
      // Hovering never takes over from a pinned card.
      return state.pinned ? state : { openId: action.id, pinned: false }
    case 'leave':
      return state.openId === action.id && !state.pinned ? HELP_CLOSED : state
    case 'toggle':
      // A click pins the card, a second click on the same pinned trigger closes it.
      return state.openId === action.id && state.pinned ? HELP_CLOSED : { openId: action.id, pinned: true }
    case 'dismiss':
      return HELP_CLOSED
  }
}

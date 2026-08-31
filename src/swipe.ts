import { useMemo, useRef } from "react";
import { GestureResponderEvent, PanResponder, PanResponderGestureState, PanResponderInstance } from "react-native";

/**
 * A drag must start beyond this to count. Android reserves the strip along the
 * left edge for its own back gesture and wins every time, so starting there
 * closes the app instead of opening the drawer — the swipe has to begin just
 * inside of it.
 */
const EDGE_MIN = 60;
/** Horizontal travel before the gesture counts as a swipe. */
const DISTANCE = 48;
/** How much more horizontal than vertical the drag has to be to claim it. */
const DIRECTION_RATIO = 1.8;

/**
 * A single-direction edge swipe: drag right to go back, the same iOS-style
 * gesture as the header's own back button. Kept separate from
 * `useDrawerSwipe` below because that one models a two-state open/closed
 * drawer (swipe direction depends on which state you're in); this models a
 * plain "there's one thing behind this, swipe to reach it" navigation stack
 * step, e.g. Settings' own sub-pages.
 *
 * Same EDGE_MIN caveat as the drawer swipe below, and the same fix: require
 * the touch to have *started* past the OS-reserved strip, not within it —
 * starting inside that strip hands the gesture to Android's own back
 * navigation before this responder ever sees it.
 *
 * Screens that use this (Settings) mount *inside* ChatScreen's own root
 * View, which also carries `useDrawerSwipe`'s panHandlers — and that hook's
 * condition for opening the drawer is nearly the same gesture as this
 * one's. Two nested PanResponders both willing to claim the same touch is
 * not a well-defined fight (measured: the ancestor won, invisibly opening
 * the drawer behind Settings' own higher-zIndex overlay while this
 * responder never fired) — ChatScreen disables its own panHandlers while
 * Settings is open, so there is no competing claim to lose. This hook
 * still opts into the capture phase too, for whatever it's worth as a
 * second line of defense if it ever gets nested under something else.
 */
export function useSwipeBack(onBack: () => void): PanResponderInstance {
  const cb = useRef(onBack);
  cb.current = onBack;

  return useMemo(() => {
    const shouldClaim = (evt: GestureResponderEvent, gesture: PanResponderGestureState): boolean => {
      const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * DIRECTION_RATIO;
      if (!horizontal || gesture.dx < DISTANCE) return false;
      return gesture.dx > 0 && evt.nativeEvent.pageX - gesture.dx >= EDGE_MIN;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: shouldClaim,
      onMoveShouldSetPanResponder: shouldClaim,
      onPanResponderRelease: () => cb.current(),
    });
  }, []);
}

/**
 * Edge swipes for the sessions drawer: pull right from the left edge to open
 * it, push left to close it again.
 *
 * Built on PanResponder rather than react-native-gesture-handler on purpose —
 * gesture-handler is a native module, and adding one means running
 * `expo prebuild`, which wipes the hand-edited android/ directory.
 *
 * The responder only claims a touch once the drag is clearly horizontal, so
 * scrolling the message list and the composer keep working untouched.
 */
export function useDrawerSwipe({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}): PanResponderInstance {
  // The responder is created once, so it reads live values through a ref.
  const state = useRef({ open, onOpen, onClose });
  state.current = { open, onOpen, onClose };

  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (evt, gesture) => {
          const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * DIRECTION_RATIO;
          if (!horizontal || Math.abs(gesture.dx) < DISTANCE) return false;
          if (state.current.open) return gesture.dx < 0;
          return gesture.dx > 0 && evt.nativeEvent.pageX - gesture.dx >= EDGE_MIN;
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (state.current.open) {
            if (gesture.dx < 0) state.current.onClose();
          } else if (gesture.dx > 0) {
            state.current.onOpen();
          }
        },
      }),
    [],
  );
}

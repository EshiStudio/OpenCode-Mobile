import { useMemo, useRef } from "react";
import { PanResponder, PanResponderInstance } from "react-native";

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

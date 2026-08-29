import { useEffect, useRef } from "react";
import { Animated, Keyboard, KeyboardEvent, Platform } from "react-native";

/**
 * Height the keyboard currently covers, as an animated value.
 *
 * `adjustResize` in the manifest used to shrink the window for us, so the
 * composer only had to sit at the bottom of a smaller window. Android 15
 * forces edge-to-edge for apps built against SDK 35+, and an edge-to-edge
 * window is never resized — the keyboard simply draws over it. Without this
 * the input ends up underneath the keyboard as soon as it is focused.
 *
 * The value drives layout (padding/height), so it cannot use the native
 * driver; the animation is short enough that the JS-driven interpolation is
 * not noticeable.
 */
export function useKeyboardOffset(): Animated.Value {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // iOS reports the keyboard before it animates, Android only once it is up.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const animate = (to: number, event?: KeyboardEvent) =>
      Animated.timing(offset, {
        toValue: to,
        // Matching the system duration keeps the input glued to the keyboard.
        duration: event?.duration || 180,
        useNativeDriver: false,
      }).start();

    const show = Keyboard.addListener(showEvent, (e) => animate(e.endCoordinates.height, e));
    const hide = Keyboard.addListener(hideEvent, (e) => animate(0, e));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [offset]);

  return offset;
}

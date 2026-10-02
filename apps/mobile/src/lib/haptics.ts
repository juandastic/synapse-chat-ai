import * as Haptics from "expo-haptics";

// Optional feedback must never block sending, editing, or navigating.
const ignoreUnavailableHaptics = () => {};

export function impactFeedback(style: "light" | "medium") {
  Haptics.impactAsync(
    style === "light"
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  ).catch(ignoreUnavailableHaptics);
}

export function successFeedback() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    ignoreUnavailableHaptics,
  );
}

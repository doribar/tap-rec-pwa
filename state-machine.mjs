// ユーザーのタップでのみ起こる操作を、状態ごとに明示的に定義します。
export const TAP_ACTIONS = Object.freeze({
  idle: "start",
  recording: "stop",
  ready: "play",
  playing: "pause",
  paused: "resume",
  ended: "replace",
});

export function nextTapAction(state) {
  return TAP_ACTIONS[state] ?? null;
}

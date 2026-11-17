import type { Artwork } from "../../../shared/types";
export function captionAt(a: Artwork, elapsed: number): string {
  return a.transcript[
    Math.min(
      a.transcript.length - 1,
      Math.floor((elapsed / a.duration) * a.transcript.length),
    )
  ];
}
// 语义进度：把播放位置锚定到「第几段文稿 + 段内进度」，
// 作品时长调整后仍能回到同一句话，而不是拼接旧秒数。
export function semanticAt(
  a: Artwork,
  elapsed: number,
): { segment: number; segmentProgress: number } {
  const count = a.transcript.length;
  const segment = Math.min(
    count - 1,
    Math.max(0, Math.floor((elapsed / a.duration) * count)),
  );
  const segmentLength = a.duration / count;
  const segmentStart = segment * segmentLength;
  return {
    segment,
    segmentProgress: Math.min(
      0.999,
      Math.max(0, (elapsed - segmentStart) / segmentLength),
    ),
  };
}
export function elapsedAt(
  a: Artwork,
  segment: number,
  segmentProgress: number,
): number {
  const count = a.transcript.length;
  const safeSegment = Math.min(count - 1, Math.max(0, Math.floor(segment)));
  const safeProgress = Math.min(0.999, Math.max(0, segmentProgress));
  return ((safeSegment + safeProgress) / count) * a.duration;
}
export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

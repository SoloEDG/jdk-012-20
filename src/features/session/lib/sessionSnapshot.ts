import type {
  Point,
  SessionSnapshot,
  TourState,
} from "../../../shared/types";
import { artworkById, routes } from "../../../shared/catalog";
import { sanitizePoint } from "../../space/lib/motion";
import { elapsedAt } from "../../narration/lib/timeline";
export type RestoreStageId =
  | "collection"
  | "space"
  | "catalog"
  | "tour"
  | "narration";
export const RESTORE_STAGES: { id: RestoreStageId; label: string }[] = [
  { id: "collection", label: "收藏与感想" },
  { id: "space", label: "位置与镜头" },
  { id: "catalog", label: "选中的作品" },
  { id: "tour", label: "导览检查点" },
  { id: "narration", label: "讲解进度" },
];
export type RestorePlan = {
  space: { position: Point; yaw: number } | null;
  activeId: string | null;
  tour: TourState | null;
  narration: {
    artworkId: string;
    elapsed: number;
    segment: number;
    rate: number;
  } | null;
};
export type SessionSummary = {
  title: string;
  lines: string[];
  savedAt: number;
};
const emptyPlan = (): RestorePlan => ({
  space: null,
  activeId: null,
  tour: null,
  narration: null,
});
const PHASES: TourState["phase"][] = [
  "idle",
  "walking",
  "listening",
  "paused",
  "done",
];
// 逐模块校验快照：身份仍有效的内容保留并重解引用，
// 失效的模块单独丢弃（记入 issues），不影响其余模块恢复。
export function validateSessionSnapshot(raw: unknown): {
  plan: RestorePlan;
  issues: string[];
  savedAt: number;
} {
  const plan = emptyPlan();
  const issues: string[] = [];
  if (!raw || typeof raw !== "object")
    return { plan, issues, savedAt: 0 };
  const s = raw as Partial<SessionSnapshot>;
  if (s.version !== 1) return { plan, issues, savedAt: 0 };
  const savedAt =
    typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : 0;
  if (s.space && typeof s.space === "object") {
    const position = sanitizePoint(s.space.position);
    const yaw =
      typeof s.space.yaw === "number" && Number.isFinite(s.space.yaw)
        ? normalizeAngle(s.space.yaw)
        : null;
    if (position && yaw !== null) plan.space = { position, yaw };
    else issues.push("上次的展厅位置已失效");
  }
  if (typeof s.activeId === "string") {
    if (artworkById(s.activeId)) plan.activeId = s.activeId;
    else issues.push("上次选中的作品已不在当前展览中");
  }
  if (s.tour && typeof s.tour === "object") {
    const route = routes.find((r) => r.id === s.tour!.routeId);
    if (!route) {
      issues.push("导览路线已更新，上次进度无法接续");
    } else {
      // 站序号不可信：按站点作品身份在当前路线中重新定位
      const step = route.stops.indexOf(s.tour.stopId);
      if (step < 0) {
        issues.push("导览站点已调整，上次检查点已失效");
      } else {
        const phase = PHASES.includes(s.tour.phase) ? s.tour.phase : "paused";
        if (phase !== "idle")
          plan.tour = { routeId: route.id, step, phase };
      }
    }
  }
  if (s.narration && typeof s.narration === "object") {
    const n = s.narration;
    const a = artworkById(typeof n.artworkId === "string" ? n.artworkId : null);
    if (!a) {
      issues.push("上次收听的作品讲解已下架");
    } else {
      const segment =
        typeof n.segment === "number" && Number.isFinite(n.segment)
          ? Math.min(a.transcript.length - 1, Math.max(0, Math.floor(n.segment)))
          : 0;
      const segmentProgress =
        typeof n.segmentProgress === "number" &&
        Number.isFinite(n.segmentProgress)
          ? n.segmentProgress
          : 0;
      const rate =
        typeof n.rate === "number" && n.rate >= 0.5 && n.rate <= 2
          ? n.rate
          : 1;
      plan.narration = {
        artworkId: a.id,
        elapsed: elapsedAt(a, segment, segmentProgress),
        segment,
        rate,
      };
    }
  }
  return { plan, issues, savedAt };
}
export function hasRestorableContent(plan: RestorePlan): boolean {
  return Boolean(
    plan.space || plan.activeId || plan.tour || plan.narration,
  );
}
export function summarizePlan(
  plan: RestorePlan,
  savedAt: number,
): SessionSummary {
  const lines: string[] = [];
  let title = "自由探索";
  if (plan.tour) {
    const route = routes.find((r) => r.id === plan.tour!.routeId);
    const stop = route?.stops[plan.tour.step];
    const a = artworkById(stop ?? null);
    title = `「${route?.name ?? "主题导览"}」`;
    const phaseText =
      plan.tour.phase === "walking"
        ? "步行前往中"
        : plan.tour.phase === "listening"
          ? "讲解中"
          : plan.tour.phase === "done"
            ? "已完成"
            : "已暂停";
    lines.push(
      `导览至第 ${plan.tour.step + 1} 站 · ${a?.title ?? "未知作品"}（${phaseText}）`,
    );
  }
  if (plan.narration) {
    const a = artworkById(plan.narration.artworkId);
    if (a)
      lines.push(
        `讲解《${a.title}》· 第 ${plan.narration.segment + 1} 段，待继续收听`,
      );
  }
  if (!plan.tour && plan.activeId) {
    const a = artworkById(plan.activeId);
    if (a) lines.push(`正在了解《${a.title}》`);
  }
  if (plan.space) lines.push("展厅位置与镜头视角已记录");
  return { title, lines, savedAt };
}
function normalizeAngle(yaw: number): number {
  let a = yaw % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../../../shared/types";
import {
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "../../../shared/storage";
import {
  hasRestorableContent,
  summarizePlan,
  validateSessionSnapshot,
  RESTORE_STAGES,
  type RestorePlan,
  type RestoreStageId,
} from "../lib/sessionSnapshot";
export type SessionStatus = "prompt" | "restoring" | "settled";
const STAGE_MS = 320;
// 恢复编排：prompt（询问）→ restoring（分阶段应用，界面可见不可操作）→ settled。
// 关键约束：settled 且产生真实操作（dirty）之前不写快照，
// 因此半恢复状态永远不会覆盖存储中的完整记录。
export function useSessionRestore({
  collect,
  apply,
}: {
  collect: () => SessionSnapshot;
  apply: (stage: RestoreStageId, plan: RestorePlan) => void;
}) {
  const [snapshot] = useState(() => {
    const v = validateSessionSnapshot(loadSessionSnapshot());
    return hasRestorableContent(v.plan) ? v : null;
  });
  const [status, setStatus] = useState<SessionStatus>(
    snapshot ? "prompt" : "settled",
  );
  const [stageIndex, setStageIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const applyingRef = useRef(false);
  const dirtyRef = useRef(false);
  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fns = useRef({ collect, apply });
  fns.current = { collect, apply };
  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };
  const resume = () => {
    if (statusRef.current !== "prompt" || !snapshot) return;
    applyingRef.current = true;
    setStatus("restoring");
    setStageIndex(0);
    const gen = ++genRef.current;
    let i = 0;
    const step = () => {
      if (genRef.current !== gen) return;
      if (i >= RESTORE_STAGES.length) {
        applyingRef.current = false;
        // 恢复完成：写一份完整且已校验的快照（规范化，幂等）
        markDirty();
        setStatus("settled");
        return;
      }
      fns.current.apply(RESTORE_STAGES[i].id, snapshot.plan);
      i += 1;
      setStageIndex(i);
      timerRef.current = setTimeout(step, STAGE_MS);
    };
    step();
  };
  // 重新开始 / 取消恢复：停止应用后续阶段，不定脏 ——
  // 旧快照保留，直到新会话产生真实操作后才被完整替换。
  const settleFresh = () => {
    genRef.current += 1;
    clearTimer();
    applyingRef.current = false;
    setStatus("settled");
  };
  const reopen = () => {
    if (dirtyRef.current || !snapshot || statusRef.current !== "settled")
      return;
    setStatus("prompt");
  };
  const noteUserAction = () => {
    if (
      statusRef.current === "settled" &&
      !applyingRef.current &&
      !dirtyRef.current
    )
      markDirty();
  };
  useEffect(() => {
    const save = () => {
      if (
        statusRef.current !== "settled" ||
        applyingRef.current ||
        !dirtyRef.current
      )
        return;
      saveSessionSnapshot(fns.current.collect());
    };
    const t = setInterval(save, 2000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, []);
  return {
    status,
    stageIndex,
    stages: RESTORE_STAGES,
    summary: snapshot ? summarizePlan(snapshot.plan, snapshot.savedAt) : null,
    issues: snapshot?.issues ?? [],
    canReopen: Boolean(snapshot && status === "settled" && !dirty),
    resume,
    settleFresh,
    reopen,
    noteUserAction,
  };
}

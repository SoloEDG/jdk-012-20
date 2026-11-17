import { useEffect, useRef, useState } from "react";
import { useWalker, distance, viewingPoint } from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour, tourTarget } from "../features/tours";
import { useCollection } from "../features/collection";
import { useSessionRestore } from "../features/session";
import type {
  RestorePlan,
  RestoreStageId,
} from "../features/session";
import { artworkById } from "../shared/catalog";
import { semanticAt } from "../features/narration/lib/timeline";
import type { SessionSnapshot } from "../shared/types";
export function useGallery() {
  const catalog = useCatalog();
  const tour = useTour();
  const collection = useCollection();
  const inputEnabled = useRef(true);
  // 用户真实操作的回调入口：恢复完成前/恢复期间的操作不计入
  const userInputRef = useRef<() => void>(() => {});
  const walker = useWalker(catalog.observe, inputEnabled, () =>
    userInputRef.current(),
  );
  const narration = useNarration(() => {
    if (tour.state.phase === "listening") tour.next();
  });
  const [viewportReady, setViewportReady] = useState(false);
  // 快照采集：只记录身份（作品/路线/站点 ID）与语义锚点，
  // 坐标、站序号、播放秒数在恢复时按当前展览数据重新推导。
  const collectRef = useRef<() => SessionSnapshot>(() => ({
    version: 1,
    savedAt: 0,
    space: null,
    activeId: null,
    tour: null,
    narration: null,
  }));
  collectRef.current = () => {
    const t = tour.state;
    const n = narration.state;
    const stopId = tourTarget(t);
    const narrationArtwork = artworkById(n.artworkId);
    return {
      version: 1,
      savedAt: Date.now(),
      space: { position: walker.positionRef.current, yaw: walker.yaw.current },
      activeId: catalog.active,
      tour:
        t.routeId && stopId
          ? { routeId: t.routeId, stopId, phase: t.phase }
          : null,
      narration:
        n.artworkId && narrationArtwork
          ? {
              artworkId: n.artworkId,
              ...semanticAt(narrationArtwork, n.elapsed),
              rate: n.rate,
            }
          : null,
    };
  };
  const applyRef = useRef<(stage: RestoreStageId, plan: RestorePlan) => void>(
    () => {},
  );
  applyRef.current = (stage, plan) => {
    switch (stage) {
      case "collection":
        break; // 收藏与感想由 useCollection 从存储恢复并跨标签合并
      case "space":
        if (plan.space) walker.place(plan.space.position, plan.space.yaw);
        break;
      case "catalog":
        if (plan.activeId) catalog.select(plan.activeId);
        break;
      case "tour":
        if (plan.tour) tour.restore(plan.tour);
        break;
      case "narration":
        if (plan.narration) narration.restore(plan.narration);
        break;
    }
  };
  const session = useSessionRestore({
    collect: () => collectRef.current(),
    apply: (stage, plan) => applyRef.current(stage, plan),
  });
  userInputRef.current = session.noteUserAction;
  const settled = session.status === "settled";
  useEffect(() => {
    inputEnabled.current = settled;
  }, [settled]);
  // 可达性与资源就绪后才继续导航：恢复完成 + 三维场景已渲染（或已降级）
  const ready = settled && viewportReady;
  const go = (id: string) => {
    const a = artworkById(id);
    if (a) {
      catalog.select(id);
      walker.go(viewingPoint(a.position, a.facing));
      walker.yaw.current = a.facing;
    }
  };
  useEffect(() => {
    if (ready && tour.state.phase === "walking" && tour.target)
      go(tour.target);
  }, [ready, tour.state.phase, tour.target]);
  useEffect(() => {
    if (!ready || tour.state.phase !== "walking" || !tour.target) return;
    const a = artworkById(tour.target)!;
    if (distance(walker.position, viewingPoint(a.position, a.facing)) < 0.15) {
      tour.arrive();
      narration.play(a.id);
    }
  }, [ready, walker.position, tour.state.phase, tour.target]);
  const current = useRef({
    nearby: catalog.nearby,
    record: collection.record,
    settled: false,
  });
  current.current = {
    nearby: catalog.nearby,
    record: collection.record,
    settled,
  };
  useEffect(() => {
    const t = setInterval(() => {
      if (current.current.settled && current.current.nearby)
        current.current.record(current.current.nearby, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const userAction = () => session.noteUserAction();
  return {
    catalog,
    tour,
    collection,
    walker,
    narration,
    go,
    session,
    onViewportReady: () => setViewportReady(true),
    // 用户意图入口：定脏并执行；恢复流程内部一律走未包装的原始方法
    goUser: (id: string) => {
      userAction();
      go(id);
    },
    tourStart: (id: string) => {
      userAction();
      tour.start(id);
    },
    tourResume: () => {
      userAction();
      tour.resume();
    },
    narrationPlay: (id: string) => {
      userAction();
      narration.play(id);
    },
    narrationToggle: () => {
      userAction();
      narration.toggle();
    },
    narrationSeek: (n: number) => {
      userAction();
      narration.seek(n);
    },
    narrationRate: (n: number) => {
      userAction();
      narration.rate(n);
    },
    onSceneInput: () => userAction(),
    // 取消恢复：停止应用后续阶段，并中和会自动继续的导航，
    // 不定脏 —— 旧快照保留，仍有可辨认的恢复入口
    cancelRestore: () => {
      session.settleFresh();
      if (tour.state.phase === "walking") tour.pause();
    },
    pauseTour: () => {
      userAction();
      tour.pause();
      walker.stop();
      narration.pause();
    },
    stopTour: () => {
      userAction();
      tour.stop();
      walker.stop();
      narration.pause();
    },
    nextTour: () => {
      userAction();
      walker.stop();
      narration.pause();
      tour.next();
    },
  };
}

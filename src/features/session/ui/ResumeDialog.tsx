import {
  Check,
  History,
  Loader2,
  RotateCcw,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type { SessionStatus } from "../model/useSessionRestore";
import type { SessionSummary } from "../lib/sessionSnapshot";
export function ResumeDialog({
  status,
  stages,
  stageIndex,
  summary,
  issues,
  onResume,
  onFresh,
  onSkip,
}: {
  status: SessionStatus;
  stages: { id: string; label: string }[];
  stageIndex: number;
  summary: SessionSummary | null;
  issues: string[];
  onResume: () => void;
  onFresh: () => void;
  onSkip: () => void;
}) {
  if (status === "settled" || !summary) return null;
  return (
    <div className="session-gate" role="dialog" aria-modal="true" aria-label="恢复上次参观">
      <div className="session-card">
        <div className="eyebrow">
          WELCOME BACK <span>恢复参观</span>
        </div>
        {status === "prompt" ? (
          <>
            <h2>
              继续上次的
              <br />
              {summary.title}？
            </h2>
            <ul className="session-summary">
              {summary.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {summary.savedAt > 0 && (
              <p className="session-time">
                <History size={13} />
                记录于{relativeTime(summary.savedAt)}
              </p>
            )}
            {issues.length > 0 && (
              <div className="session-issues">
                <p>
                  <AlertCircle size={13} />
                  展览已有更新，部分内容无法接续：
                </p>
                <ul>
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="session-actions">
              <button className="primary" onClick={onResume}>
                继续上次参观
                <ArrowRight size={15} />
              </button>
              <button className="session-ghost" onClick={onFresh}>
                <RotateCcw size={14} />
                重新开始
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>正在恢复参观…</h2>
            <ol className="session-stages">
              {stages.map((stage, i) => (
                <li
                  key={stage.id}
                  className={
                    i < stageIndex ? "done" : i === stageIndex ? "active" : ""
                  }
                >
                  {i < stageIndex ? (
                    <Check size={14} />
                  ) : i === stageIndex ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <span className="stage-dot" />
                  )}
                  {stage.label}
                </li>
              ))}
            </ol>
            <progress
              className="session-progress"
              value={stageIndex}
              max={stages.length}
            />
            <p className="session-note">
              恢复完成前，上次的参观记录不会被覆盖。
            </p>
            <div className="session-actions">
              <button className="session-ghost" onClick={onSkip}>
                跳过恢复，直接开始
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function relativeTime(at: number): string {
  const diff = Date.now() - at;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return ` ${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ` ${hours} 小时前`;
  return ` ${new Date(at).toLocaleDateString("zh-CN")}`;
}

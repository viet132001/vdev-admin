import React, { useEffect, useState } from 'react';
import { GitMerge, GitPullRequest, GitPullRequestClosed, CircleAlert } from 'lucide-react';
import { PR_STATE, REVIEW_DECISION, RUN_TYPE } from './agent';

// Git flow UI (task-agent-mcp.md section 15): pull request chips and the "Claude is working" animations

const PR_ICON: Record<string, React.FC<{ size?: number }>> = { OPEN: GitPullRequest, MERGED: GitMerge, CLOSED: GitPullRequestClosed };

/** One chip per repo PR: "vdev-be #12", colored by state, links to GitHub. */
export const PrChips: React.FC<{ prs: any[]; showRepo?: boolean; compact?: boolean }> = ({ prs, showRepo = true, compact = false }) => {
  if (!prs?.length) return null;
  return (
    <>
      {prs.map((pr) => {
        const meta = PR_STATE[pr.state] || PR_STATE.OPEN;
        const Icon = pr.error ? CircleAlert : PR_ICON[pr.state] || GitPullRequest;
        const label = `${showRepo ? `${pr.repo} ` : ''}${pr.number ? `#${pr.number}` : 'chưa có PR'}`;
        const title = [meta.label, pr.reviewDecision && REVIEW_DECISION[pr.reviewDecision], pr.error && `Lỗi: ${pr.error}`].filter(Boolean).join(' · ');
        const content = (<><Icon size={compact ? 10 : 12} />{label}</>);
        return pr.url ? (
          <a key={pr.id || pr.repo} className={`tw-pr-chip s-${pr.state}${pr.error ? ' has-error' : ''}`} style={{ color: pr.error ? 'var(--danger)' : meta.color }} href={pr.url} target="_blank" rel="noopener noreferrer" title={title} onClick={(e) => e.stopPropagation()}>
            {content}
          </a>
        ) : (
          <span key={pr.id || pr.repo} className="tw-pr-chip has-error" style={{ color: 'var(--danger)' }} title={title}>{content}</span>
        );
      })}
    </>
  );
};

// A little personality while Claude works; real progress lives in the run log
const WORKING_LINES = [
  'Đang đọc code…',
  'Đang gõ phím lạch cạch…',
  'Đang nghĩ thật sâu…',
  'Đang soi từng dòng…',
  'Đang chạy thử trong đầu…',
  'Đang pha thêm ly cà phê ☕',
  'Đang đặt tên biến cho đẹp…',
  'Đang dọn dẹp import…'
];

const usePhrase = (lines: string[], seed: string, every = 2600) => {
  // Each card starts at its own line so a column of busy cards does not read in unison
  const offset = [...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % lines.length;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), every);
    return () => clearInterval(timer);
  }, [every]);
  return lines[(offset + tick) % lines.length];
};

/** Small robot that bobs and blinks; pure CSS so it costs nothing while idle. */
export const AgentBot: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <span className="tw-bot" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <line x1="12" y1="2.5" x2="12" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle className="tw-bot-antenna" cx="12" cy="2.5" r="1.6" fill="currentColor" />
      <rect x="3.5" y="6" width="17" height="13" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g className="tw-bot-eyes">
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      </g>
      <path className="tw-bot-mouth" d="M9.5 15.5 Q12 17 14.5 15.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  </span>
);

/** Row on a board card while Claude works on that task. */
export const AgentWorking: React.FC<{ taskId: string }> = ({ taskId }) => {
  const line = usePhrase(WORKING_LINES, taskId);
  return (
    <div className="tw-agent-working" role="status" aria-live="off">
      <AgentBot size={16} />
      <span key={line} className="tw-agent-working-text">{line}</span>
      <span className="tw-typing" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
};

/**
 * Header pill while a run of the project is going: what Claude does right now (last log line).
 * Clicking it opens the plan / task the run belongs to.
 */
export const AgentActivityPill: React.FC<{ run: any; lastLog?: string | null; onClick?: () => void }> = ({ run, lastLog, onClick }) => {
  const fallback = usePhrase(WORKING_LINES, run.id, 3200);
  const what = run.task?.title || run.plan?.title || '';
  return (
    <button type="button" className="tw-activity-pill" onClick={onClick} title={lastLog || undefined}>
      <AgentBot size={18} />
      <span className="tw-activity-text">
        <b>Claude · {RUN_TYPE[run.type] || run.type}{what ? `: ${what}` : ''}</b>
        <span key={lastLog || fallback} className="tw-activity-log">{lastLog || fallback}</span>
      </span>
      <span className="tw-typing" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
};

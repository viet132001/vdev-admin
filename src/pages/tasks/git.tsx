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

/**
 * Small robot typing on a keyboard: hands tap in turn, keys light up under them, eyes read
 * across the line, head nods with the rhythm. Pure CSS so it costs nothing while idle.
 */
export const AgentBot: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <span className="tw-bot" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <g className="tw-bot-head">
        <line x1="12" y1="1.6" x2="12" y2="3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle className="tw-bot-antenna" cx="12" cy="1.5" r="1.2" fill="currentColor" />
        <rect x="6.5" y="3.6" width="11" height="8.2" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        {/* Eyes low in the face: looking down at the keys */}
        <g className="tw-bot-eyes">
          <circle cx="10" cy="8.4" r="1.15" fill="currentColor" />
          <circle cx="14" cy="8.4" r="1.15" fill="currentColor" />
        </g>
      </g>
      <rect x="9.6" y="11.8" width="4.8" height="3.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* Arms reach down to the keyboard; each hand taps in turn */}
      <g className="tw-bot-hand tw-bot-hand-l">
        <path d="M9.6 13 Q6.6 13.6 7 16.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="7" cy="17" r="1.05" fill="currentColor" />
      </g>
      <g className="tw-bot-hand tw-bot-hand-r">
        <path d="M14.4 13 Q17.4 13.6 17 16.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="17" cy="17" r="1.05" fill="currentColor" />
      </g>
      {/* Keyboard */}
      <rect x="2.5" y="18" width="19" height="4.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect className="tw-bot-key tw-bot-key-1" x="5.4" y="19.5" width="2.6" height="1.2" rx="0.4" fill="currentColor" />
      <rect className="tw-bot-key tw-bot-key-2" x="10.7" y="19.5" width="2.6" height="1.2" rx="0.4" fill="currentColor" />
      <rect className="tw-bot-key tw-bot-key-3" x="16" y="19.5" width="2.6" height="1.2" rx="0.4" fill="currentColor" />
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

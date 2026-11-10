import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, RotateCw, Trash2, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useBusy } from '../tasks/agent';
import { ConfirmDialog, formatDate, type ConfirmState } from '../tasks/shared';
import { Avatar, TEAM_ROLES, copyText, roleAtLeast, roleLabel, type ProjectTabProps } from './shared';

const RANK: Record<string, number> = { OWNER: 4, MANAGER: 3, MEMBER: 2, VIEWER: 1 };

// Mirrors canManageMember in vdev-be team-rules.util.ts
const canManage = (actor: string, current: string) =>
  actor === 'OWNER' || (actor === 'MANAGER' && RANK[current] < RANK.MANAGER);

export const ProjectMembers: React.FC<ProjectTabProps> = ({ project, reloadProject }) => {
  const { user } = useAuth();
  const [invites, setInvites] = useState<any[]>([]);
  const [form, setForm] = useState({ email: '', role: 'MEMBER' });
  // Link of the invite just created: the raw token is only returned once
  const [lastInvite, setLastInvite] = useState<any>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { busy, run } = useBusy();
  const myRole = project.myRole;
  const isManager = roleAtLeast(myRole, 'MANAGER');
  const invitableRoles = TEAM_ROLES.filter((r) => r.value !== 'OWNER' && RANK[r.value] <= RANK[myRole]);

  const loadInvites = useCallback(async () => {
    if (!isManager) return;
    try {
      setInvites(await api.get(`/api/team-projects/${project.id}/invites`, { noCache: true }));
    } catch (err) {
      alert(getErrorMessage(err, 'Không tải được lời mời'));
    }
  }, [project.id, isManager]);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    run('invite', async () => {
      try {
        const result = await api.post(`/api/team-projects/${project.id}/invites`, { email: form.email.trim(), role: form.role });
        setLastInvite(result);
        setForm({ ...form, email: '' });
        loadInvites();
      } catch (err) {
        alert(getErrorMessage(err, 'Không gửi được lời mời'));
      }
    });
  };

  const resend = (inv: any) =>
    run(inv.id, async () => {
      try {
        setLastInvite(await api.post(`/api/team-projects/${project.id}/invites/${inv.id}/resend`, {}));
        loadInvites();
      } catch (err) {
        alert(getErrorMessage(err, 'Không gửi lại được'));
      }
    });

  const changeRole = (member: any, role: string) =>
    run(member.userId, async () => {
      try {
        await api.patch(`/api/team-projects/${project.id}/members/${member.userId}`, { role });
        reloadProject();
      } catch (err) {
        alert(getErrorMessage(err, 'Không đổi được vai trò'));
      }
    });

  const remove = (member: any) => {
    const self = member.userId === user?.id;
    setConfirm({
      title: self ? 'Rời dự án?' : `Xoá ${member.fullName} khỏi dự án?`,
      message: self
        ? 'Bạn sẽ không thấy dự án này nữa cho tới khi được mời lại. Task đang mở của bạn trở về "Chưa giao".'
        : 'Người này mất quyền truy cập ngay (cả qua MCP). Task đang mở của họ trở về "Chưa giao".',
      confirmLabel: self ? 'Rời dự án' : 'Xoá thành viên',
      action: async () => {
        try {
          await api.delete(`/api/team-projects/${project.id}/members/${member.userId}`);
          if (self) window.location.assign(`${import.meta.env.BASE_URL}projects`);
          else reloadProject();
        } catch (err) {
          alert(getErrorMessage(err, 'Không xoá được thành viên'));
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {isManager && (
        <form className="card flex flex-col gap-2" onSubmit={invite}>
          <b className="flex align-center gap-2"><Mail size={16} /> Mời thành viên qua email</b>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Người được mời nhận mail có link, đăng nhập bằng đúng tài khoản Google của email đó để tham gia. Link hết hạn sau 7 ngày.</span>
          <div className="pj-form-row">
            <input className="form-input" style={{ flex: 1, minWidth: 200 }} type="email" required placeholder="dev@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className="form-input" style={{ width: 'auto' }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {invitableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button className="btn btn-primary" type="submit" disabled={busy === 'invite'}>{busy === 'invite' ? 'Đang gửi...' : 'Gửi lời mời'}</button>
          </div>
          {lastInvite && (
            <div className={`alert-banner ${lastInvite.emailSent ? 'alert-banner-success' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <span>
                {lastInvite.emailSent
                  ? `Đã gửi mail mời tới ${lastInvite.email}.`
                  : `Chưa gửi được mail tới ${lastInvite.email}${lastInvite.emailError ? ` (${lastInvite.emailError})` : ''}. Gửi link này cho họ:`}
              </span>
              <div className="flex align-center gap-2">
                <input className="form-input pj-mono" readOnly value={lastInvite.inviteUrl} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyText(lastInvite.inviteUrl)}><Copy size={14} /> Copy</button>
                <button type="button" className="icon-btn" onClick={() => setLastInvite(null)}><X size={14} /></button>
              </div>
            </div>
          )}
        </form>
      )}

      <div className="card flex flex-col gap-2">
        <b>Thành viên ({project.members.length})</b>
        {project.members.map((m: any) => {
          const manageable = m.userId !== user?.id && canManage(myRole, m.role);
          const roleChoices = TEAM_ROLES.filter((r) => myRole === 'OWNER' || r.value !== 'OWNER');
          return (
            <div key={m.userId} className="pj-row">
              <Avatar name={m.fullName} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.fullName}{m.userId === user?.id && <span style={{ color: 'var(--text-muted)' }}> (bạn)</span>}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email} · tham gia {formatDate(m.joinedAt)}</div>
              </div>
              {manageable ? (
                <select className="form-input" style={{ width: 'auto' }} value={m.role} disabled={busy === m.userId} onChange={(e) => changeRole(m, e.target.value)}>
                  {roleChoices.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              ) : (
                <span className="badge">{roleLabel(m.role)}</span>
              )}
              {(manageable || m.userId === user?.id) && (
                <button className="icon-btn danger" title={m.userId === user?.id ? 'Rời dự án' : 'Xoá khỏi dự án'} onClick={() => remove(m)}><Trash2 size={16} /></button>
              )}
            </div>
          );
        })}
        <div className="pj-legend" style={{ marginTop: 4 }}>
          {TEAM_ROLES.map((r) => <span key={r.value}><b>{r.label}</b>: {r.hint}</span>)}
        </div>
      </div>

      {isManager && invites.length > 0 && (
        <div className="card flex flex-col gap-2">
          <b>Lời mời chưa nhận ({invites.length})</b>
          {invites.map((inv) => (
            <div key={inv.id} className="pj-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem' }}>{inv.email} <span className="badge">{roleLabel(inv.role)}</span></div>
                <div style={{ fontSize: '0.75rem', color: inv.state === 'EXPIRED' || inv.emailError ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {inv.state === 'EXPIRED' ? 'Đã hết hạn' : `Hết hạn ${formatDate(inv.expiresAt)}`}
                  {' · '}{inv.emailSentAt ? `đã gửi mail ${formatDate(inv.emailSentAt)}` : `chưa gửi được mail${inv.emailError ? `: ${inv.emailError}` : ''}`}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" disabled={busy === inv.id} onClick={() => resend(inv)}><RotateCw size={14} /> Gửi lại</button>
              <button className="icon-btn danger" title="Thu hồi" onClick={() => setConfirm({
                title: `Thu hồi lời mời ${inv.email}?`, message: 'Link trong mail sẽ không dùng được nữa.', confirmLabel: 'Thu hồi',
                action: async () => {
                  try { await api.delete(`/api/team-projects/${project.id}/invites/${inv.id}`); loadInvites(); }
                  catch (err) { alert(getErrorMessage(err, 'Không thu hồi được')); }
                }
              })}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldBan } from 'lucide-react';
import { ConfirmDialog, type ConfirmState } from '../tasks/shared';
import { useBusy } from '../tasks/agent';
import { blockErrorMessage, createBlock, listBlocks, removeBlock, type BlockType } from './blocks';

const TYPE_LABELS: Record<BlockType, string> = { EMAIL: 'Email', IP: 'IP' };

export const BlockList: React.FC = () => {
  const { busy, run } = useBusy();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [type, setType] = useState<BlockType>('EMAIL');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setBlocks(await listBlocks());
    } catch (err) {
      setLoadError(blockErrorMessage(err, 'Không tải được danh sách chặn.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    run('add', async () => {
      try {
        await createBlock(type, value.trim(), reason.trim());
        setValue('');
        setReason('');
        await load();
      } catch (err) {
        setFormError(blockErrorMessage(err, 'Không chặn được.'));
      }
    });
  };

  const askRemove = (block: any) => {
    setConfirm({
      title: 'Bỏ chặn?',
      message: `${block.value} sẽ truy cập lại được hệ thống.`,
      confirmLabel: 'Bỏ chặn',
      action: async () => {
        try {
          await removeBlock(block.id);
          await load();
        } catch (err) {
          alert(blockErrorMessage(err, 'Không bỏ chặn được.'));
        }
      },
    });
  };

  return (
    <div>
      <form onSubmit={handleAdd} className="block-form card">
        <select className="form-input" aria-label="Loại chặn" value={type} onChange={(e) => setType(e.target.value as BlockType)}>
          <option value="EMAIL">Email</option>
          <option value="IP">IP</option>
        </select>
        <input
          className="form-input"
          aria-label="Giá trị chặn"
          placeholder={type === 'EMAIL' ? 'name@example.com' : '203.0.113.10'}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <input
          className="form-input"
          aria-label="Lý do"
          placeholder="Lý do (không bắt buộc)"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          {busy === 'add' ? 'Đang chặn...' : 'Chặn'}
        </button>
      </form>
      {formError && <div className="alert-banner alert-banner-danger"><span>{formError}</span></div>}

      {loadError ? (
        <div className="alert-banner alert-banner-danger">
          <span>{loadError}</span>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Thử lại</button>
        </div>
      ) : loading ? (
        <div className="loading-container card">
          <span className="spinner"></span>
          <span>Đang tải danh sách chặn...</span>
        </div>
      ) : blocks.length === 0 ? (
        <div className="empty-state">
          <ShieldBan className="empty-state-icon" size={32} />
          <p>Chưa chặn email hay IP nào.</p>
        </div>
      ) : (
        <div className="table-container table-responsive-card">
          <table>
            <thead>
              <tr>
                <th>Loại</th>
                <th>Giá trị</th>
                <th>Lý do</th>
                <th>Thời gian</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blocks.map(block => (
                <tr key={block.id}>
                  <td data-label="Loại"><span className="badge badge-info">{TYPE_LABELS[block.type as BlockType]}</span></td>
                  <td data-label="Giá trị" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{block.value}</td>
                  <td data-label="Lý do" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{block.reason || '-'}</td>
                  <td data-label="Thời gian" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(block.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td data-label="Thao tác">
                    <button className="btn btn-secondary btn-sm" onClick={() => askRemove(block)}>Bỏ chặn</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
};

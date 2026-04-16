// frontend/src/pages/RegistrarDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const RegistrarDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [allGrievances, setAllGrievances] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => Promise.all([
    api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {}),
    api.get('/grievances').then(r => setAllGrievances(r.data)).catch(() => {}),
    api.get('/grievances/pending-approvals').then(r => setPendingApprovals(r.data)).catch(() => {}),
  ]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [user?.id]);  // eslint-disable-line

  const handleApprove = async (id) => {
    setApprovingId(id);
    try {
      await api.patch(`/grievances/${id}/approve`);
      toast.success('Grievance approved and marked resolved');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    } finally {
      setApprovingId(null);
    }
  };

  const downloadCSV = () => {
    const rows = allGrievances;
    if (!rows.length) return;
    const headers = ['Ticket ID','Title','Category','Status','Campus','School','Department','SLA Deadline','SLA Breached','Submitted'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...rows.map(g => [
        g.ticket_id, g.title, g.category, g.status, g.campus || '',
        g.school || '', g.department || '',
        g.sla_deadline ? new Date(g.sla_deadline).toLocaleDateString() : '',
        g.sla_breached ? 'Yes' : 'No',
        new Date(g.created_at).toLocaleDateString(),
      ].map(escape).join(',')),
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `grievances-registrar-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="app-layout"><Sidebar /><main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading...</p></main></div>
  );

  const s = stats?.summary || {};
  const statusBadge = (st) => <span className={`badge badge-${st}`}>{st?.replace(/_/g, ' ')}</span>;
  const pending = allGrievances.filter(g => g.status === 'submitted');
  const resolved = allGrievances.filter(g => ['resolved','final_resolved'].includes(g.status));

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        {/* Header */}
        <div className="page-header" style={{ borderBottom: '2px solid var(--gray-200)', paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <h1 className="page-title" style={{ fontSize: 26, marginBottom: 2 }}>Registrar Dashboard</h1>
                <p className="page-sub" style={{ fontSize: 15 }}>
                  {user?.name} &nbsp;&middot;&nbsp; <strong>Registrar</strong>
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* KPI cards */}
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          {[
            { label: 'Total Cases', value: s.total || 0, cls: 'blue' },
            { label: 'Pending Review', value: pending.length, cls: 'amber' },
            { label: 'Resolved', value: resolved.length, cls: 'green' },
            { label: 'SLA Breached', value: s.sla_breached || 0, cls: 'red' },
            { label: 'Pending Approval', value: pendingApprovals.length, cls: 'purple' },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`stat-card ${cls}`} style={{ borderRadius: 14 }}>
              <div className="stat-label" style={{ fontSize: 13 }}>{label}</div>
              <div className="stat-value" style={{ fontSize: 32 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Pending Approvals */}
        <div className="card" style={{ marginBottom: 24, borderTop: '4px solid var(--success)' }}>
          <div className="card-header">
            <div>
              <span className="card-title" style={{ fontSize: 17 }}>Approvals Queue</span>
              <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--gray-400)' }}>
                Non-academic grievances resolved by Dean/Committee — awaiting your approval
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', background: '#dcfce7', padding: '4px 12px', borderRadius: 20 }}>
              {pendingApprovals.length} pending
            </span>
          </div>
          {pendingApprovals.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>No grievances awaiting approval. All clear!</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th>Ticket</th><th>Title</th><th>Category</th><th>Campus</th><th>Resolution by Dean</th><th>Action</th>
                </tr></thead>
                <tbody>
                  {pendingApprovals.map(g => (
                    <tr key={g.id}>
                      <td><code style={{ fontSize: 13, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{g.title}</td>
                      <td><span className="badge badge-assigned" style={{ textTransform: 'capitalize', fontSize: 13 }}>{g.category?.replace(/_/g, ' ')}</span></td>
                      <td style={{ fontSize: 13 }}><span style={{ textTransform: 'capitalize' }}>{g.campus || '—'}</span></td>
                      <td style={{ maxWidth: 220, fontSize: 13 }}>
                        {g.resolution_confidential
                          ? <span style={{ color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 8, fontSize: 12 }}>🔒 Confidential</span>
                          : <span title={g.resolution_note}>{(g.resolution_note || '—').slice(0, 60)}{(g.resolution_note?.length > 60) ? '...' : ''}</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-sm btn-success"
                            disabled={approvingId === g.id}
                            onClick={() => handleApprove(g.id)}
                            style={{ fontSize: 13 }}
                          >
                            {approvingId === g.id ? 'Approving...' : '✓ Approve'}
                          </button>
                          <button className="btn btn-sm btn-outline" onClick={() => navigate(`/grievances/${g.id}`)} style={{ fontSize: 13 }}>
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* All Grievances overview */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title" style={{ fontSize: 17 }}>All Grievances</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={downloadCSV} disabled={!allGrievances.length}>Export CSV</button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/grievances')}>Browse</button>
            </div>
          </div>
          {allGrievances.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>No grievances found.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th>Ticket</th><th>Title</th><th>Category</th><th>Campus</th><th>Status</th><th>Submitted</th><th>Action</th>
                </tr></thead>
                <tbody>
                  {allGrievances.slice(0, 12).map(g => (
                    <tr key={g.id} style={{ background: g.sla_breached ? 'var(--danger-lt)' : undefined }}>
                      <td><code style={{ fontSize: 13, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{g.title}</td>
                      <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{g.category?.replace(/_/g, ' ')}</td>
                      <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{g.campus || '—'}</td>
                      <td>{statusBadge(g.status)}</td>
                      <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => navigate(`/grievances/${g.id}`)} style={{ fontSize: 13 }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending - submitted & not yet assigned */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title" style={{ fontSize: 17 }}>Pending Grievances</span>
            <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>{pending.length} unassigned</span>
          </div>
          {pending.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>No unassigned grievances.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th>Ticket</th><th>Title</th><th>Category</th><th>Campus</th><th>Submitted</th><th>SLA</th>
                </tr></thead>
                <tbody>
                  {pending.slice(0, 10).map(g => (
                    <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/grievances/${g.id}`)}>
                      <td><code style={{ fontSize: 13, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{g.title}</td>
                      <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{g.category?.replace(/_/g, ' ')}</td>
                      <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{g.campus || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                      <td style={{ fontSize: 13, color: g.sla_breached ? 'var(--danger)' : 'var(--gray-400)' }}>
                        {g.sla_deadline ? new Date(g.sla_deadline).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default RegistrarDashboard;

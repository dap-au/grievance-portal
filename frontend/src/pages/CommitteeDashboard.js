// frontend/src/pages/CommitteeDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const CommitteeDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]   = useState(null);
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Inline resolve panel state
  const [activePanel, setActivePanel] = useState(null); // grievance id or null
  const [resolveNote, setResolveNote] = useState('');
  const [resolveComment, setResolveComment] = useState('');
  const [resolveConfidential, setResolveConfidential] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {}),
      api.get('/grievances').then(r => setCases(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const reload = () =>
    Promise.all([
      api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {}),
      api.get('/grievances').then(r => setCases(r.data)).catch(() => {}),
    ]);

  const openPanel = (grievanceId) => {
    if (activePanel === grievanceId) {
      setActivePanel(null);
    } else {
      setActivePanel(grievanceId);
      setResolveNote('');
      setResolveComment('');
      setResolveConfidential(false);
    }
  };

  const handleResolve = async (grievanceId) => {
    if (!resolveNote.trim()) {
      toast.error('Resolution note is required');
      return;
    }
    setSubmittingAction(true);
    try {
      const payload = {
        resolution_note: resolveNote.trim(),
        resolution_confidential: resolveConfidential,
      };
      if (resolveComment.trim()) payload.comment = resolveComment.trim();
      await api.patch(`/grievances/${grievanceId}/resolve`, payload);
      toast.success('Grievance resolved successfully');
      setActivePanel(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resolve grievance');
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading…</p></main>
    </div>
  );

  const s = stats?.summary || {};
  const statusBadge = (s) => <span className={`badge badge-${s}`}>{s?.replace(/_/g, ' ')}</span>;

  const activeCases = cases.filter(g =>
    !['resolved', 'final_resolved', 'withdrawn'].includes(g.status)
  );
  const resolvedCases = cases.filter(g =>
    ['resolved', 'final_resolved'].includes(g.status)
  );

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            Committee Dashboard
            {user?.campus && (
              <span style={{
                marginLeft: 12,
                fontSize: 14,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
                background: user.campus === 'uppal' ? 'var(--primary)' : 'var(--accent)',
                color: 'white',
                verticalAlign: 'middle',
                textTransform: 'capitalize',
              }}>
                {user.campus} Campus
              </span>
            )}
          </h1>
          <p className="page-sub">
            Grievance committee · {user?.campus ? `${user.campus} campus` : 'Your campus'} · Cases assigned to you by the Dean
          </p>
        </div>

        {/* Key metrics */}
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-label">Assigned to me</div>
            <div className="stat-value">{cases.length}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">Active cases</div>
            <div className="stat-value">{activeCases.length}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{resolvedCases.length}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">SLA at risk</div>
            <div className="stat-value">{s.sla_breached || 0}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Ragging (24hr)</div>
            <div className="stat-value">{s.ragging || 0}</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-label">Escalated</div>
            <div className="stat-value">{s.escalated || 0}</div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ cursor: 'pointer', background: 'var(--primary)', color: 'white' }}
            onClick={() => navigate('/grievances?status=assigned')}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Active cases</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>Under committee review</div>
          </div>
          <div className="card" style={{ cursor: 'pointer', background: '#d97706', color: 'white' }}
            onClick={() => navigate('/grievances?category=ragging_harassment')}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Ragging cases</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>24-hour SLA critical</div>
          </div>
          <div className="card" style={{ cursor: 'pointer', background: 'var(--accent)', color: 'white' }}
            onClick={() => navigate('/grievances')}>            
            <div style={{ fontSize: 28, marginBottom: 8 }}>≡</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>All my cases</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>Cases assigned to me</div>
          </div>
        </div>

        {/* Active cases table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cases assigned to me</span>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/grievances')}>View all</button>
          </div>
          {activeCases.length === 0
            ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No cases assigned to you yet. The Dean assigns cases from their dashboard.</p>
            : (
              <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th>Ticket</th><th>Title</th><th>Category</th><th>Status</th><th>SLA deadline</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {activeCases.slice(0, 10).map(g => {
                      const showResolvePanel = activePanel === g.id;
                      return (
                        <React.Fragment key={g.id}>
                          <tr>
                            <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</td>
                            <td>
                              <span className="badge badge-assigned" style={{ textTransform: 'capitalize' }}>
                                {g.category?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td>{statusBadge(g.status)}</td>
                            <td style={{ fontSize: 13, color: g.sla_breached ? 'var(--danger)' : 'var(--gray-400)' }}>
                              {g.sla_deadline ? new Date(g.sla_deadline).toLocaleDateString() : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 5 }}>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    background: showResolvePanel ? '#16a34a' : '#dcfce7',
                                    color: showResolvePanel ? 'white' : '#16a34a',
                                    border: 'none', fontWeight: 600,
                                  }}
                                  onClick={() => openPanel(g.id)}
                                >
                                  ✓ Resolve
                                </button>
                                <button className="btn btn-sm btn-outline"
                                  onClick={() => navigate(`/grievances/${g.id}`)}>Review</button>
                              </div>
                            </td>
                          </tr>

                          {/* ── Resolve inline panel */}
                          {showResolvePanel && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: 'transparent' }}>
                                <div style={{ padding: '18px 20px', background: '#f0fdf4', borderLeft: '4px solid #16a34a', margin: '0 0 4px 0' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 14, color: '#16a34a', fontSize: 14 }}>
                                    Resolve — <code style={{ fontSize: 12 }}>{g.ticket_id}</code>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                                    <div>
                                      <label className="form-label">
                                        Resolution note <span style={{ color: 'var(--danger)' }}>*</span>
                                      </label>
                                      <textarea
                                        className="form-textarea"
                                        rows={4}
                                        value={resolveNote}
                                        onChange={e => setResolveNote(e.target.value)}
                                        placeholder="Describe the resolution and action taken…"
                                        style={{ resize: 'vertical' }}
                                      />
                                    </div>
                                    <div>
                                      <label className="form-label">
                                        Internal comment{' '}
                                        <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>
                                          (optional — visible to VC / Registrar / Director only)
                                        </span>
                                      </label>
                                      <textarea
                                        className="form-textarea"
                                        rows={4}
                                        value={resolveComment}
                                        onChange={e => setResolveComment(e.target.value)}
                                        placeholder="Internal note for oversight roles; not shown to student"
                                        style={{ resize: 'vertical' }}
                                      />
                                    </div>
                                  </div>
                                  <div style={{ marginBottom: 16 }}>
                                    <label className="form-label" style={{ marginBottom: 8 }}>Resolution visibility</label>
                                    <div style={{ display: 'flex', gap: 32 }}>
                                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                                        <input
                                          type="radio"
                                          name={`vis-${g.id}`}
                                          style={{ marginTop: 3 }}
                                          checked={!resolveConfidential}
                                          onChange={() => setResolveConfidential(false)}
                                        />
                                        <span>
                                          <strong>Visible to student</strong>
                                          <span style={{ display: 'block', fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                                            Student can read the full resolution note
                                          </span>
                                        </span>
                                      </label>
                                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                                        <input
                                          type="radio"
                                          name={`vis-${g.id}`}
                                          style={{ marginTop: 3 }}
                                          checked={resolveConfidential}
                                          onChange={() => setResolveConfidential(true)}
                                        />
                                        <span>
                                          <strong>Confidential 🔒</strong>
                                          <span style={{ display: 'block', fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                                            Student sees a locked banner; VC / Registrar / Director see full note
                                          </span>
                                        </span>
                                      </label>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <button
                                      className="btn btn-success"
                                      disabled={submittingAction || !resolveNote.trim()}
                                      onClick={() => handleResolve(g.id)}
                                    >
                                      {submittingAction ? 'Resolving…' : 'Submit Resolution'}
                                    </button>
                                    <button className="btn btn-outline btn-sm" onClick={() => setActivePanel(null)}>Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>

        {/* Recently resolved */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <span className="card-title">Recently resolved</span>
          </div>
          {resolvedCases.length === 0
            ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No resolved cases yet.</p>
            : (
              <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th>Ticket</th><th>Title</th><th>Category</th><th>Resolved</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {resolvedCases.slice(0, 5).map(g => (
                      <tr key={g.id}>
                        <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</td>
                        <td>
                          <span className="badge badge-submitted" style={{ textTransform: 'capitalize' }}>
                            {g.category?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                          {g.resolved_at ? new Date(g.resolved_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline"
                            onClick={() => navigate(`/grievances/${g.id}`)}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>

      </main>
    </div>
  );
};

export default CommitteeDashboard;

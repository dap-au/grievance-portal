// frontend/src/pages/DeanDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const DeanDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [allGrievances, setAllGrievances] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  // Committee list — used for assign-to-committee dropdown
  const [committee, setCommittee] = useState([]);

  // Inline action panel state
  const [activePanel, setActivePanel] = useState(null); // { id, type: 'resolve'|'assign' }
  const [resolveNote, setResolveNote] = useState('');
  const [resolveComment, setResolveComment] = useState('');
  const [resolveConfidential, setResolveConfidential] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadCommittee = () =>
    api.get('/auth/committee').then(r => setCommittee(r.data || [])).catch(() => {});

  // ── CSV Download ──────────────────────────────────────────────
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
    a.href = url; a.download = `grievances-${user?.campus || 'campus'}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  useEffect(() => {
    Promise.all([
      api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {}),
      api.get('/grievances').then(r => setAllGrievances(r.data)).catch(() => {}),
      api.get('/grievances?status=submitted').then(r => setPending(r.data)).catch(() => {}),
      loadCommittee(),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line
  }, [user?.id]);

  const reload = () =>
    Promise.all([
      api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {}),
      api.get('/grievances').then(r => setAllGrievances(r.data)).catch(() => {}),
      api.get('/grievances?status=submitted').then(r => setPending(r.data)).catch(() => {}),
      loadCommittee(),
    ]);

  const openPanel = (grievanceId, type) => {
    if (activePanel?.id === grievanceId && activePanel?.type === type) {
      setActivePanel(null);
    } else {
      setActivePanel({ id: grievanceId, type });
      setResolveNote('');
      setResolveComment('');
      setResolveConfidential(false);
      setAssignEmail('');
      setAssignNote('');
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

  const handleAssignToCommittee = async (grievanceId) => {
    if (!assignEmail) {
      toast.error('Please select a committee member');
      return;
    }
    setSubmittingAction(true);
    try {
      await api.patch(`/grievances/${grievanceId}/assign`, {
        assignee_email: assignEmail,
        ...(assignNote.trim() && { note: assignNote.trim() }),
      });
      toast.success('Assigned to committee member');
      setActivePanel(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign grievance');
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
  const statusBadge = (st) => <span className={`badge badge-${st}`}>{st?.replace(/_/g, ' ')}</span>;

  const activeGrievances = allGrievances.filter(g => !['resolved','final_resolved','withdrawn'].includes(g.status));
  const resolvedGrievances = allGrievances.filter(g => ['resolved','final_resolved'].includes(g.status));
  const fasttackGrievances = allGrievances.filter(g => g.status === 'fast_track' || g.category === 'ragging_harassment');

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        {/* ── Page Header ──────────────────────────────────────── */}
        <div className="page-header" style={{ borderBottom: '2px solid var(--gray-200)', paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: 'white', flexShrink: 0,
              }}>◈</div>
              <div>
                <h1 className="page-title" style={{ marginBottom: 2, fontSize: 26 }}>
                  Dean's Dashboard
                  {user?.campus && (
                    <span style={{
                      marginLeft: 12, fontSize: 13, fontWeight: 700,
                      padding: '3px 12px', borderRadius: 20,
                      background: user.campus === 'uppal' ? 'var(--primary)' : 'var(--accent)',
                      color: 'white', verticalAlign: 'middle', textTransform: 'capitalize',
                      letterSpacing: '0.03em',
                    }}>
                      {user.campus} Campus
                    </span>
                  )}
                </h1>
                <p className="page-sub" style={{ marginBottom: 0, fontSize: 15 }}>
                  {user?.name} &nbsp;·&nbsp; <strong>Dean of Student Affairs</strong> &nbsp;·&nbsp;
                  {user?.campus ? `${user.campus.charAt(0).toUpperCase() + user.campus.slice(1)} Campus` : 'Campus'}
                </p>
              </div>
            </div>
            <button
              className="btn btn-outline"
              onClick={downloadCSV}
              style={{ fontSize: 14, gap: 6, flexShrink: 0 }}
            >
              ⬇ Download CSV
            </button>
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Assigned', value: activeGrievances.length, color: '#2563eb', bg: '#eff6ff', icon: '◈' },
            { label: 'Pending / Unreviewed', value: pending.length, color: '#d97706', bg: '#fffbeb', icon: '⏳' },
            { label: 'Resolved', value: resolvedGrievances.length, color: '#16a34a', bg: '#f0fdf4', icon: '✓' },
            { label: 'SLA at Risk', value: allGrievances.filter(g => g.sla_breached).length, color: '#dc2626', bg: '#fef2f2', icon: '⚠' },
            { label: 'Fast-track (Ragging)', value: fasttackGrievances.length, color: '#7c3aed', bg: '#f5f3ff', icon: '⚡' },
          ].map(({ label, value, color, bg, icon }) => (
            <div key={label} style={{
              background: 'white', borderRadius: 14, padding: '20px 22px',
              border: `1px solid ${bg}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              borderTop: `4px solid ${color}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                <span style={{ fontSize: 18, opacity: 0.5, color }}>{icon}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Quick Navigation ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e40af, #2563eb)',
            borderRadius: 14, padding: '18px 20px', cursor: 'pointer', color: 'white',
            boxShadow: '0 4px 14px rgba(37,99,235,0.3)', transition: 'transform 0.15s',
          }}
            onClick={() => navigate('/grievances?status=submitted')}
            onMouseOver={e => e.currentTarget.style.transform='translateY(-2px)'}
            onMouseOut={e => e.currentTarget.style.transform='translateY(0)'}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>✦</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Unassigned Cases</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>Awaiting your action</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #0f766e, #0d9488)',
            borderRadius: 14, padding: '18px 20px', cursor: 'pointer', color: 'white',
            boxShadow: '0 4px 14px rgba(13,148,136,0.3)', transition: 'transform 0.15s',
          }}
            onClick={() => navigate('/grievances?status=assigned')}
            onMouseOver={e => e.currentTarget.style.transform='translateY(-2px)'}
            onMouseOut={e => e.currentTarget.style.transform='translateY(0)'}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Active Cases</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>Under review</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #b45309, #d97706)',
            borderRadius: 14, padding: '18px 20px', cursor: 'pointer', color: 'white',
            boxShadow: '0 4px 14px rgba(217,119,6,0.3)', transition: 'transform 0.15s',
          }}
            onClick={() => navigate('/grievances?category=ragging_harassment')}
            onMouseOver={e => e.currentTarget.style.transform='translateY(-2px)'}
            onMouseOut={e => e.currentTarget.style.transform='translateY(0)'}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>⚠</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Ragging / Fast-track</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>24-hour SLA critical</div>
          </div>
        </div>

        {/* ── All Grievances ────────────────────────────────────── */}
        <div className="card" style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid var(--gray-200)', marginBottom: 24 }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: 14, marginBottom: 16 }}>
            <div>
              <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>All Grievances</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>
                {user?.campus ? `${user.campus} campus` : ''} · {allGrievances.length} total
              </span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/grievances')}>Browse all</button>
          </div>
          {activeGrievances.length === 0
            ? <p style={{ color: 'var(--gray-400)', fontSize: 14, padding: '8px 0' }}>No active grievances for your campus.</p>
            : <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th>Ticket ID</th><th>Title</th><th>Category</th><th>Status</th><th>SLA Deadline</th>
                  </tr></thead>
                  <tbody>
                    {activeGrievances.slice(0, 10).map(g => (
                      <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/grievances/${g.id}`)}>
                        <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</td>
                        <td><span className="badge badge-assigned" style={{ textTransform: 'capitalize' }}>{g.category?.replace(/_/g, ' ')}</span></td>
                        <td>{statusBadge(g.status)}</td>
                        <td style={{ fontSize: 13, color: g.sla_breached ? 'var(--danger)' : 'var(--gray-400)' }}>
                          {new Date(g.sla_deadline).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

        {/* ── Pending Grievances ────────────────────────────── */}
        <div className="card" style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid var(--gray-200)', marginBottom: 24 }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: 14, marginBottom: 16 }}>
            <div>
              <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>Pending Grievances</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>Newly submitted · awaiting action</span>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/grievances')}>Browse all</button>
          </div>
          {pending.length === 0
            ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No unassigned cases.</p>
            : <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th>Ticket</th><th>Title</th><th>Category</th><th>Submitted</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {pending.slice(0, 8).map(g => {
                      const showResolvePanel = activePanel?.id === g.id && activePanel?.type === 'resolve';
                      const showAssignPanel  = activePanel?.id === g.id && activePanel?.type === 'assign';
                      return (
                        <React.Fragment key={g.id}>
                          <tr>
                            <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</td>
                            <td><span className="badge badge-submitted" style={{ textTransform: 'capitalize' }}>{g.category?.replace(/_/g, ' ')}</span></td>
                            <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                            <td>
                              <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <button
                                  onClick={() => openPanel(g.id, 'resolve')}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: 12, fontWeight: 700,
                                    background: showResolvePanel ? '#15803d' : '#f0fdf4',
                                    color: showResolvePanel ? 'white' : '#15803d',
                                    border: 'none',
                                    borderRight: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    letterSpacing: '0.03em',
                                    transition: 'background 0.15s, color 0.15s',
                                  }}
                                >
                                  Resolve
                                </button>
                                <button
                                  onClick={() => openPanel(g.id, 'assign')}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: 12, fontWeight: 700,
                                    background: showAssignPanel ? '#1d4ed8' : '#eff6ff',
                                    color: showAssignPanel ? 'white' : '#1d4ed8',
                                    border: 'none',
                                    cursor: 'pointer',
                                    letterSpacing: '0.03em',
                                    transition: 'background 0.15s, color 0.15s',
                                  }}
                                >
                                  Committee
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Resolve inline panel */}
                          {showResolvePanel && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0, background: 'transparent' }}>
                                <div style={{ padding: '18px 20px', background: '#f0fdf4', borderLeft: '4px solid #16a34a', margin: '0 0 4px 0' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 14, color: '#16a34a', fontSize: 14 }}>
                                    Resolve — <code style={{ fontSize: 12 }}>{g.ticket_id}</code>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                                    <div>
                                      <label className="form-label">Resolution note <span style={{ color: 'var(--danger)' }}>*</span></label>
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
                                      <label className="form-label">Internal comment <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
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
                                        <input type="radio" name={`vis-p-${g.id}`} style={{ marginTop: 3 }} checked={!resolveConfidential} onChange={() => setResolveConfidential(false)} />
                                        <span><strong>Visible to student</strong></span>
                                      </label>
                                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                                        <input type="radio" name={`vis-p-${g.id}`} style={{ marginTop: 3 }} checked={resolveConfidential} onChange={() => setResolveConfidential(true)} />
                                        <span><strong>Confidential 🔒</strong></span>
                                      </label>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <button className="btn btn-success" disabled={submittingAction || !resolveNote.trim()} onClick={() => handleResolve(g.id)}>
                                      {submittingAction ? 'Resolving…' : 'Submit Resolution'}
                                    </button>
                                    <button className="btn btn-outline btn-sm" onClick={() => setActivePanel(null)}>Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Assign to Committee inline panel */}
                          {showAssignPanel && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0, background: 'transparent' }}>
                                <div style={{ padding: '18px 20px', background: '#eff6ff', borderLeft: '4px solid var(--primary)', margin: '0 0 4px 0' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 14, color: 'var(--primary)', fontSize: 14 }}>
                                    Assign to Committee — <code style={{ fontSize: 12 }}>{g.ticket_id}</code>
                                  </div>
                                  {committee.length === 0 ? (
                                    <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
                                      No committee members yet. Add members via Committee Members in the sidebar.
                                    </p>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                                      <div>
                                        <label className="form-label">Committee member <span style={{ color: 'var(--danger)' }}>*</span></label>
                                        <select className="form-input" value={assignEmail} onChange={e => setAssignEmail(e.target.value)}>
                                          <option value="">— Select member —</option>
                                          {committee.map(m => (
                                            <option key={m.id} value={m.email}>{m.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="form-label">Note <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
                                        <textarea className="form-textarea" rows={3} value={assignNote} onChange={e => setAssignNote(e.target.value)} placeholder="Instructions for the committee member…" />
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: 10 }}>
                                    <button className="btn btn-primary" disabled={submittingAction || !assignEmail} onClick={() => handleAssignToCommittee(g.id)}>
                                      {submittingAction ? 'Assigning…' : 'Assign to Committee'}
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
          }
        </div>

      </main>
    </div>
  );
};

export default DeanDashboard;

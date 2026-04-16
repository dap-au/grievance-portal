// frontend/src/pages/AllGrievances.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';

const STATUSES = ['all','submitted','assigned','in_progress','pending_approval','pending_director_approval','resolved','final_resolved','escalation_1','escalation_2','escalation_3','fast_track','withdrawn'];
const CATEGORIES = ['all','academic','ragging_harassment','financial','infrastructure','faculty_conduct','administrative','other'];

const AllGrievances = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading]       = useState(true);

  // Initialise filters from URL query params (e.g. ?status=submitted&category=ragging_harassment)
  const qp = new URLSearchParams(location.search);
  const [status, setStatus]     = useState(qp.get('status')   || 'all');
  const [category, setCategory] = useState(qp.get('category') || 'all');
  const [search, setSearch]     = useState('');

  // Sync filter state whenever URL search params change (e.g. sidebar nav links)
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setStatus(p.get('status') || 'all');
    setCategory(p.get('category') || 'all');
  }, [location.search]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status   !== 'all') params.append('status', status);
    if (category !== 'all') params.append('category', category);
    api.get(`/grievances?${params}`)
      .then(r => setGrievances(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, category]);

  const filtered = grievances.filter(g =>
    !search ||
    g.ticket_id?.toLowerCase().includes(search.toLowerCase()) ||
    g.title?.toLowerCase().includes(search.toLowerCase()) ||
    g.student_name?.toLowerCase().includes(search.toLowerCase())
  );

  const downloadCSV = () => {
    if (!filtered.length) return;
    const headers = ['Ticket ID','Title','Student','Category','Status','Assigned To','SLA Deadline','SLA Breached','Submitted'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      headers.join(','),
      ...filtered.map(g => [
        g.ticket_id,
        g.title,
        g.student_name || '',
        g.category?.replace(/_/g, ' ') || '',
        g.status?.replace(/_/g, ' ') || '',
        g.assigned_to_name || '',
        g.sla_deadline ? new Date(g.sla_deadline).toLocaleDateString() : '',
        g.sla_breached ? 'Yes' : 'No',
        new Date(g.created_at).toLocaleDateString(),
      ].map(escape).join(',')),
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grievances-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slaColor = (g) => {
    if (!g.sla_deadline) return {};
    const diff = new Date(g.sla_deadline) - new Date();
    if (diff < 0) return { background: 'var(--danger-lt)' };
    if (diff < 2 * 86400000) return { background: 'var(--warning-lt)' };
    return {};
  };

  const pageTitleMap = {
    submitted: 'Pending Grievances',
    resolved: 'Resolved Grievances',
    final_resolved: 'Resolved Grievances',
    assigned: 'Assigned Grievances',
    in_progress: 'In-Progress Grievances',
    pending_approval: 'Pending Approval',
    pending_director_approval: 'Pending Director Approval',
    escalation_1: 'Escalated Grievances',
    escalation_2: 'Escalated Grievances',
    withdrawn: 'Withdrawn Grievances',
    fast_track: 'Fast-Track Grievances',
  };
  const pageTitle = status !== 'all' ? (pageTitleMap[status] || `${status.replace(/_/g, ' ')} Grievances`) : 'All Grievances';
  const pageSub = status !== 'all' ? `Showing grievances with status: ${status.replace(/_/g, ' ')}` : 'View and manage all submitted cases';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-sub">{pageSub}</p>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Search</label>
              <input className="form-input" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ticket, title, student name…" />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => (
                  <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Category</label>
              <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c} style={{ textTransform: 'capitalize' }}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>
            Showing {filtered.length} grievance{filtered.length !== 1 ? 's' : ''}
          </span>
          <button className="btn btn-outline btn-sm" onClick={downloadCSV} disabled={!filtered.length}>
            Export CSV
          </button>
        </div>

        {loading
          ? <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
          : <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Title</th>
                    <th>Student</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Assigned to</th>
                    <th>SLA deadline</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 32 }}>No grievances found</td></tr>
                    : filtered.map(g => (
                        <tr key={g.id} style={{ cursor: 'pointer', ...slaColor(g) }}
                          onClick={() => navigate(`/grievances/${g.id}`)}>
                          <td>
                            <code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code>
                            {g.is_confidential && (
                              <span className="badge" style={{ marginLeft: 6, background: 'var(--purple-lt)', color: 'var(--purple)', fontSize: 11 }}>
                                Conf.
                              </span>
                            )}
                            {g.proof_url && (
                              <span className="badge" style={{ marginLeft: 6, background: 'var(--success-lt)', color: 'var(--success)', fontSize: 11 }}>
                                Proof
                              </span>
                            )}
                          </td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.title}
                          </td>
                          <td style={{ fontSize: 13 }}>{g.student_name || '—'}</td>
                          <td style={{ fontSize: 13, textTransform: 'capitalize' }}>
                            {g.category?.replace(/_/g, ' ')}
                          </td>
                          <td>
                            <span className={`badge badge-${g.status}`}>
                              {g.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{g.assigned_to_name || '—'}</td>
                          <td style={{ fontSize: 13 }}>
                            {g.sla_deadline
                              ? new Date(g.sla_deadline).toLocaleDateString()
                              : '—'}
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                            {new Date(g.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
        }
      </main>
    </div>
  );
};

export default AllGrievances;
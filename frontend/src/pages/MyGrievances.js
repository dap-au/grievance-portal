// frontend/src/pages/MyGrievances.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';

const MyGrievances = () => {
  const navigate = useNavigate();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');

  useEffect(() => {
    api.get('/grievances/my')
      .then(r => setGrievances(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? grievances
    : filter === 'assigned'
      ? grievances.filter(g => ['assigned','in_progress','escalation_1','escalation_2','fast_track','pending_approval','pending_director_approval'].includes(g.status))
      : grievances.filter(g => g.status === filter);

  const statusLabel = (status) => {
    if (status === 'pending_approval' || status === 'pending_director_approval') return 'Pending Approval';
    return status?.replace(/_/g, ' ');
  };

  const slaStatus = (g) => {
    if (!g.sla_deadline) return null;
    const diff = new Date(g.sla_deadline) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (diff < 0) return <span style={{ color: 'var(--danger)', fontSize: 12 }}>SLA breached</span>;
    if (days <= 2) return <span style={{ color: 'var(--warning)', fontSize: 12 }}>{days}d remaining</span>;
    return <span style={{ color: 'var(--success)', fontSize: 12 }}>{days}d remaining</span>;
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="page-title">My Grievances</h1>
              <p className="page-sub">Track and manage your submissions</p>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/submit')}>
              + New grievance
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {['all','submitted','assigned','resolved','withdrawn'].map(s => (
            <button key={s}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(s)}
              style={{ textTransform: 'capitalize', fontSize: 14 }}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {loading
          ? <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
          : filtered.length === 0
            ? <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                <p style={{ color: 'var(--gray-400)' }}>No grievances found.</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }}
                  onClick={() => navigate('/submit')}>Raise your first grievance</button>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(g => (
                  <div key={g.id} className="card"
                    style={{ transition: 'box-shadow 0.15s' }}
                    >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                      onClick={() => navigate(`/grievances/${g.id}`)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <code style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--primary-lt)', padding: '2px 8px', borderRadius: 4 }}>
                            {g.ticket_id}
                          </code>
                          <span className={`badge badge-${g.status}`}>
                            {statusLabel(g.status)}
                          </span>
                          {g.is_confidential && (
                            <span className="badge" style={{ background: 'var(--purple-lt)', color: 'var(--purple)' }}>
                              Confidential
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>{g.title}</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                          {g.category?.replace(/_/g, ' ')}
                          {g.school ? ` · ${g.school}` : ''}
                          {g.assigned_to_name ? ` · Assigned to: ${g.assigned_to_name}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
                            {new Date(g.created_at).toLocaleDateString()}
                          </div>
                          <div style={{ marginTop: 4 }}>{slaStatus(g)}</div>
                        </div>
                        {g.status === 'submitted' && (
                          <button
                            className="btn btn-sm btn-outline"
                            style={{ flexShrink: 0 }}
                            onClick={e => { e.stopPropagation(); navigate(`/grievances/${g.id}`, { state: { openEdit: true } }); }}
                          >
                            ✎ Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {g.resolution_note && (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--success-lt)',
                        borderRadius: 8, fontSize: 13, color: 'var(--success)', borderLeft: '3px solid var(--success)' }}>
                        <strong>Resolution:</strong> {g.resolution_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
        }
      </main>
    </div>
  );
};

export default MyGrievances;
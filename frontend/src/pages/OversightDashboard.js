// frontend/src/pages/OversightDashboard.js
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';

const COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777'];

const OversightDashboard = () => {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/grievances/dashboard')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading dashboard…</p></main>
    </div>
  );

  const s = stats?.summary || {};
  const resolutionRate = s.total > 0
    ? Math.round((parseInt(s.resolved) / parseInt(s.total)) * 100)
    : 0;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Oversight Dashboard</h1>
          <p className="page-sub">Read-only analytics — view all grievance trends and SLA compliance</p>
        </div>

        {/* Summary stats */}
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-label">Total cases</div>
            <div className="stat-value">{s.total || 0}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">In progress</div>
            <div className="stat-value">{s.in_progress || 0}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{s.resolved || 0}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Escalated</div>
            <div className="stat-value">{s.escalated || 0}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">SLA breached</div>
            <div className="stat-value">{s.sla_breached || 0}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Ragging cases</div>
            <div className="stat-value">{s.ragging || 0}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Resolution rate</div>
            <div className="stat-value">{resolutionRate}%</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">Withdrawn</div>
            <div className="stat-value">{s.withdrawn || 0}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* Category distribution pie */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Cases by category</div>
            {stats?.byCategory?.length > 0
              ? <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={stats.byCategory} dataKey="count" nameKey="category"
                      cx="50%" cy="50%" outerRadius={90} label={({ category, percent }) =>
                        `${category?.replace(/_/g,' ')} ${(percent * 100).toFixed(0)}%`
                      } labelLine={false}>
                      {stats.byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n?.replace(/_/g,' ')]} />
                  </PieChart>
                </ResponsiveContainer>
              : <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No data yet</p>
            }
          </div>

          {/* Cases by school bar */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Cases by school</div>
            {stats?.bySchool?.length > 0
              ? <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.bySchool} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="school" tick={{ fontSize: 12 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              : <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No school data yet</p>
            }
          </div>
        </div>

        {/* SLA breach table */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16, color: 'var(--danger)' }}>
            SLA breached — action required
          </div>
          {!stats?.recentBreaches?.length
            ? <p style={{ color: 'var(--success)', fontSize: 14 }}>No SLA breaches. All cases on track.</p>
            : <div className="table-container">
                <table className="table">
                  <thead><tr>
                    <th>Ticket</th><th>Title</th><th>Category</th><th>Status</th><th>SLA deadline</th>
                  </tr></thead>
                  <tbody>
                    {stats.recentBreaches.map((g, i) => (
                      <tr key={i} style={{ background: 'var(--danger-lt)' }}>
                        <td><code style={{ fontSize: 12, color: 'var(--danger)' }}>{g.ticket_id}</code></td>
                        <td>{g.title}</td>
                        <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{g.category?.replace(/_/g, ' ')}</td>
                        <td><span className={`badge badge-${g.status}`}>{g.status?.replace(/_/g, ' ')}</span></td>
                        <td style={{ fontSize: 13, color: 'var(--danger)' }}>
                          {new Date(g.sla_deadline).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>
      </main>
    </div>
  );
};

export default OversightDashboard;
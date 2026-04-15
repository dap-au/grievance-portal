// frontend/src/pages/Dashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';

const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty',
  dean: 'Dean',
  registrar: 'Registrar',
  vc: 'Vice Chancellor',
};

const getStudentId = (user) => user?.student_id ?? user?.studentId ?? 'N/A';
const getSchool = (user) => user?.school ?? 'Not specified';
const getDepartment = (user) => user?.department ?? 'Not specified';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [stats, setStats]   = useState(null);
  const [recent, setRecent] = useState([]);
  const isStudent = user?.role === 'student';

  useEffect(() => {
    if (!isStudent) {
      api.get('/grievances/dashboard').then(r => setStats(r.data)).catch(() => {});
      api.get('/grievances?status=submitted').then(r => setRecent(r.data.slice(0, 5))).catch(() => {});
    } else {
      api.get('/grievances/my').then(r => setRecent(r.data.slice(0, 5))).catch(() => {});
    }
  }, [isStudent]);

  const statusBadge = (s) => <span className={`badge badge-${s}`}>{s?.replace(/_/g, ' ')}</span>;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Welcome, {user?.name}</h1>
          <p className="page-sub">{ROLE_LABELS[user?.role]} — Student Grievance Management System</p>
        </div>

        {/* Student dashboard */}
        {isStudent && (
          <>
            {/* Student Profile Info */}
            <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: 'white' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>FULL NAME</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{user?.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>SCHOOL</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{getSchool(user)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>DEPARTMENT</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{getDepartment(user)}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 13, opacity: 0.9 }}>
                Student ID: <strong>{getStudentId(user)}</strong> • Email: <strong>{user?.email}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div className="card" style={{ background: 'var(--primary)', color: 'white', cursor: 'pointer' }}
                onClick={() => navigate('/submit')}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Raise a Grievance</div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                  Submit a new complaint or concern
                </div>
              </div>
              <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/my')}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>◎</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>My Grievances</div>
                <div style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
                  Track status of your submissions
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Recent submissions</span>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/my')}>View all</button>
              </div>
              {recent.length === 0
                ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No grievances submitted yet.</p>
                : <div className="table-container">
                    <table className="table">
                      <thead><tr>
                        <th>Ticket</th><th>Title</th><th>Category</th><th>Status</th><th>Date</th>
                      </tr></thead>
                      <tbody>
                        {recent.map(g => (
                          <tr key={g.id} style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/grievances/${g.id}`)}>
                            <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</td>
                            <td><span className="badge badge-assigned" style={{ textTransform: 'capitalize' }}>{g.category?.replace(/_/g, ' ')}</span></td>
                            <td>{statusBadge(g.status)}</td>
                            <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          </>
        )}

        {/* Admin dashboard */}
        {!isStudent && stats && (
          <>
            <div className="stats-grid">
              <div className="stat-card blue">
                <div className="stat-label">Total</div>
                <div className="stat-value">{stats.summary.total}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Pending</div>
                <div className="stat-value">{stats.summary.in_progress}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Resolved</div>
                <div className="stat-value">{stats.summary.resolved}</div>
              </div>
              <div className="stat-card red">
                <div className="stat-label">Escalated</div>
                <div className="stat-value">{stats.summary.escalated}</div>
              </div>
              <div className="stat-card red">
                <div className="stat-label">SLA Breached</div>
                <div className="stat-value">{stats.summary.sla_breached}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Ragging Cases</div>
                <div className="stat-value">{stats.summary.ragging}</div>
              </div>
            </div>

            {/* Recent pending */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Newly submitted</span>
                <button className="btn btn-outline btn-sm" onClick={() => navigate('/grievances')}>View all</button>
              </div>
              {recent.length === 0
                ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No new submissions.</p>
                : <div className="table-container">
                    <table className="table">
                      <thead><tr>
                        <th>Ticket</th><th>Title</th><th>Category</th><th>School</th><th>Submitted</th>
                      </tr></thead>
                      <tbody>
                        {recent.map(g => (
                          <tr key={g.id} style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/grievances/${g.id}`)}>
                            <td><code style={{ fontSize: 12, color: 'var(--accent)' }}>{g.ticket_id}</code></td>
                            <td>{g.title}</td>
                            <td><span style={{ textTransform: 'capitalize', fontSize: 13 }}>{g.category?.replace(/_/g, ' ')}</span></td>
                            <td>{g.school || '—'}</td>
                            <td style={{ fontSize: 13, color: 'var(--gray-400)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const PIE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#334155'];

const chartCardStyle = {
  background: 'white',
  borderRadius: 14,
  border: '1px solid var(--gray-200)',
  padding: 16,
};

const toTitle = (text = '') => text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const toNumber = (value) => Number(value || 0);

const kpiStatus = (label, value) => {
  if (label === 'resolution') return value >= 85 ? 'Good' : 'Needs attention';
  if (label === 'avg_days') return value <= 5 ? 'Good' : 'Needs attention';
  if (label === 'satisfaction') return value >= 90 ? 'Good' : 'Needs attention';
  return 'Live';
};

export default function ViceChancellorDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const isSLATab = new URLSearchParams(location.search).get('tab') === 'sla';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slaConfig, setSlaConfig] = useState({ sla_days: 5, updated_at: null });
  const [slaInput, setSlaInput] = useState(5);
  const [slasSaving, setSlasSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/grievances/analytics/dashboard')
        .then((res) => { if (active) setAnalytics(res.data); })
        .catch(() => { if (active) setError('Unable to load analytics right now.'); }),
      api.get('/grievances/sla-config')
        .then((res) => { if (active) { setSlaConfig(res.data); setSlaInput(res.data.sla_days); } })
        .catch(() => {}),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const kpis = analytics?.kpis || {
    total: 0,
    resolution_rate: 0,
    avg_resolution_days: 0,
    satisfaction_rate: 0,
  };

  const monthlyTrendData = useMemo(() => {
    const rows = analytics?.charts?.monthly_trend || [];
    return {
      labels: rows.map((r) => r.month),
      datasets: [
        {
          label: 'Submissions',
          data: rows.map((r) => toNumber(r.submissions)),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.2)',
          tension: 0.35,
          fill: false,
          pointRadius: 3,
        },
        {
          label: 'Resolutions',
          data: rows.map((r) => toNumber(r.resolutions)),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.2)',
          tension: 0.35,
          fill: false,
          pointRadius: 3,
        },
      ],
    };
  }, [analytics]);

  const categoryBarData = useMemo(() => {
    const rows = analytics?.charts?.by_category || [];
    return {
      labels: rows.map((r) => toTitle(r.label)),
      datasets: [{
        label: 'Grievances',
        data: rows.map((r) => toNumber(r.value)),
        backgroundColor: rows.map((_, idx) => PIE_COLORS[idx % PIE_COLORS.length]),
        borderRadius: 8,
      }],
    };
  }, [analytics]);

  const statusDoughnutData = useMemo(() => {
    const rows = analytics?.charts?.status_distribution || [];
    return {
      labels: rows.map((r) => toTitle(r.label)),
      datasets: [{
        data: rows.map((r) => toNumber(r.value)),
        backgroundColor: rows.map((_, idx) => PIE_COLORS[idx % PIE_COLORS.length]),
      }],
    };
  }, [analytics]);

  const priorityPieData = useMemo(() => {
    const rows = analytics?.charts?.priority_breakdown || [];
    return {
      labels: rows.map((r) => toTitle(r.label)),
      datasets: [{
        data: rows.map((r) => toNumber(r.value)),
        backgroundColor: ['#dc2626', '#d97706', '#16a34a'],
      }],
    };
  }, [analytics]);

  const topDepartmentsData = useMemo(() => {
    const rows = analytics?.charts?.top_departments || [];
    return {
      labels: rows.map((r) => r.label),
      datasets: [{
        label: 'Cases',
        data: rows.map((r) => toNumber(r.value)),
        backgroundColor: '#0891b2',
        borderRadius: 6,
      }],
    };
  }, [analytics]);

  const campusBreakdownData = useMemo(() => {
    const rows = analytics?.charts?.campus_breakdown || [];
    return {
      labels: rows.map((r) => r.campus.charAt(0).toUpperCase() + r.campus.slice(1)),
      datasets: [
        {
          label: 'Total',
          data: rows.map((r) => toNumber(r.total)),
          backgroundColor: '#2563eb',
          borderRadius: 6,
        },
        {
          label: 'Resolved',
          data: rows.map((r) => toNumber(r.resolved)),
          backgroundColor: '#16a34a',
          borderRadius: 6,
        },
        {
          label: 'Open',
          data: rows.map((r) => toNumber(r.open)),
          backgroundColor: '#d97706',
          borderRadius: 6,
        },
        {
          label: 'SLA Breached',
          data: rows.map((r) => toNumber(r.sla_breached)),
          backgroundColor: '#dc2626',
          borderRadius: 6,
        },
      ],
    };
  }, [analytics]);

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { enabled: true },
    },
  };

  const handleSaveSLA = async () => {
    if (slaInput < 5) { toast.error('Minimum SLA is 5 days'); return; }
    setSlasSaving(true);
    try {
      const res = await api.post('/grievances/sla-config', { sla_days: slaInput });
      setSlaConfig(res.data);
      toast.success(`SLA updated to ${slaInput} days`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update SLA');
    } finally {
      setSlasSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading analytics...</p></main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content"><p style={{ color: 'var(--danger)' }}>{error}</p></main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Header */}
        <div className="page-header" style={{ borderBottom: '2px solid var(--gray-200)', paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <h1 className="page-title" style={{ fontSize: 28, marginBottom: 2 }}>
                  {isSLATab ? 'SLA Configuration' : 'Analytics Dashboard'}
                </h1>
                <p className="page-sub" style={{ fontSize: 15 }}>
                  {user?.name} <span style={{ margin: '0 6px', color: 'var(--gray-300)' }}>|</span> <strong>Vice Chancellor</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SLA Config - only shown when ?tab=sla */}
        {isSLATab && (
          <div className="card" style={{ marginBottom: 28, borderTop: '4px solid #4f46e5' }}>
            <div className="card-header">
              <div>
                <span className="card-title" style={{ fontSize: 17 }}>SLA Configuration</span>
                <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--gray-400)' }}>
                  Current: <strong>{slaConfig.sla_days} days</strong>
                  {slaConfig.updated_at && ` · Last updated ${new Date(slaConfig.updated_at).toLocaleDateString()}`}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 4 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6 }}>Resolution SLA (days)</label>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 8 }}>Minimum: 5 days. Maximum: your choice.</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={5}
                    value={slaInput}
                    onChange={(e) => setSlaInput(Number(e.target.value))}
                    style={{
                      width: 90, padding: '8px 12px', borderRadius: 8,
                      border: '1.5px solid var(--gray-200)', fontSize: 15,
                      fontWeight: 600, textAlign: 'center',
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSLA}
                    disabled={slasSaving || slaInput < 5}
                    style={{ fontSize: 14 }}
                  >
                    {slasSaving ? 'Saving...' : 'Update SLA'}
                  </button>
                  {slaInput < 5 && (
                    <span style={{ fontSize: 13, color: 'var(--danger)' }}>Must be at least 5 days</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics - hidden on SLA tab */}
        {!isSLATab && (<>

        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card blue">
            <div className="stat-label">Total Grievances</div>
            <div className="stat-value">{toNumber(kpis.total)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{kpiStatus('total', toNumber(kpis.total))}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Resolution Rate</div>
            <div className="stat-value">{toNumber(kpis.resolution_rate)}%</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{kpiStatus('resolution', toNumber(kpis.resolution_rate))}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">Avg Resolution Days</div>
            <div className="stat-value">{toNumber(kpis.avg_resolution_days)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{kpiStatus('avg_days', toNumber(kpis.avg_resolution_days))}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Satisfaction Rate</div>
            <div className="stat-value">{toNumber(kpis.satisfaction_rate)}%</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{kpiStatus('satisfaction', toNumber(kpis.satisfaction_rate))}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={chartCardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Monthly Grievance Trend</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Submissions vs resolutions over the last 12 months</p>
            <div style={{ height: 320 }}>
              <Line data={monthlyTrendData} options={baseOptions} />
            </div>
          </div>
          <div style={chartCardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Grievances by Category</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Distribution of cases across all grievance types</p>
            <div style={{ height: 320 }}>
              <Bar
                data={categoryBarData}
                options={{
                  ...baseOptions,
                  plugins: {
                    ...baseOptions.plugins,
                    legend: { display: false },
                  },
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={chartCardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Status Distribution</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Current status breakdown of all grievances</p>
            <div style={{ height: 320 }}>
              <Doughnut data={statusDoughnutData} options={baseOptions} />
            </div>
          </div>
          <div style={chartCardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Priority Breakdown</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>High, Medium and Low priority cases</p>
            <div style={{ height: 320 }}>
              <Pie data={priorityPieData} options={baseOptions} />
            </div>
          </div>
        </div>

        <div style={chartCardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Top Departments by Case Volume</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Departments with the highest number of grievances filed</p>
          <div style={{ height: 320 }}>
            <Bar
              data={topDepartmentsData}
              options={{
                ...baseOptions,
                indexAxis: 'y',
                plugins: {
                  ...baseOptions.plugins,
                  legend: { display: false },
                },
              }}
            />
          </div>
        </div>

        <div style={{ ...chartCardStyle, marginTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Campus-wise Grievance Overview</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Comparison of Total, Resolved, Open and SLA-Breached grievances per campus</p>
          <div style={{ height: 320 }}>
            <Bar
              data={campusBreakdownData}
              options={{
                ...baseOptions,
                plugins: {
                  ...baseOptions.plugins,
                  legend: { position: 'top' },
                  tooltip: {
                    callbacks: {
                      afterBody: (items) => {
                        const rowIdx = items[0]?.dataIndex;
                        const rows = analytics?.charts?.campus_breakdown || [];
                        const row = rows[rowIdx];
                        if (!row) return [];
                        return [`Avg Resolution: ${row.avg_days ?? 'N/A'} days`];
                      },
                    },
                  },
                },
                scales: {
                  x: { stacked: false },
                  y: { beginAtZero: true, ticks: { precision: 0 } },
                },
              }}
            />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">Department Summary Table</span>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Satisfaction rate is SLA-on-time resolution percentage</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total</th>
                  <th>Resolved</th>
                  <th>Resolution Rate %</th>
                  <th>Avg Resolution Days</th>
                  <th>Satisfaction Rate %</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.summary_table || []).map((row) => (
                  <tr key={row.department}>
                    <td>{row.department}</td>
                    <td>{toNumber(row.total)}</td>
                    <td>{toNumber(row.resolved)}</td>
                    <td>{toNumber(row.resolution_rate)}</td>
                    <td>{toNumber(row.avg_resolution_days)}</td>
                    <td>{toNumber(row.satisfaction_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>)}
      </main>
    </div>
  );
}

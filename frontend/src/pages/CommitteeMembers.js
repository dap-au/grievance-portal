// frontend/src/pages/CommitteeMembers.js
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const CommitteeMembers = () => {
  const { user } = useAuth();
  const [committee, setCommittee] = useState([]);
  const [newMember, setNewMember] = useState({ name: '', email: '' });
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [newMemberPassword, setNewMemberPassword] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCommittee = () =>
    api.get('/auth/committee').then(r => setCommittee(r.data || [])).catch(() => {});

  useEffect(() => {
    loadCommittee().finally(() => setLoading(false));
  // eslint-disable-next-line
  }, [user?.id]);

  const handleAddMember = async () => {
    if (!newMember.name.trim() || !newMember.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setAddingMember(true);
    try {
      const res = await api.post('/auth/committee', newMember);
      toast.success('Committee member added');
      setNewMemberPassword(res.data.tempPassword || 'Committee@123');
      setNewMember({ name: '', email: '' });
      loadCommittee();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this committee member?')) return;
    setRemovingId(memberId);
    try {
      await api.delete(`/auth/committee/${memberId}`);
      toast.success('Member removed');
      loadCommittee();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading…</p></main>
    </div>
  );

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        {/* ── Page Header ── */}
        <div className="page-header" style={{ borderBottom: '2px solid var(--gray-200)', paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: 'white', flexShrink: 0,
            }}>◈</div>
            <div>
              <h1 className="page-title" style={{ marginBottom: 2 }}>
                Committee Members
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
              <p className="page-sub" style={{ marginBottom: 0 }}>
                Manage grievance committee members for your campus
              </p>
            </div>
          </div>
        </div>

        {/* ── Add Member Form ── */}
        <div className="card" style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid var(--gray-200)', marginBottom: 24 }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: 14, marginBottom: 16 }}>
            <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>Add New Member</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 12,
            padding: '4px 0',
          }}>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>Full Name</label>
              <input
                className="form-input"
                value={newMember.name}
                onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                placeholder="e.g. Dr. Priya Sharma"
              />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: 4 }}>Institutional Email</label>
              <input
                className="form-input"
                value={newMember.email}
                onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                placeholder={`name@${user?.campus}.aurora.edu.in`}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-primary"
                disabled={addingMember}
                onClick={handleAddMember}
                style={{ height: 40, whiteSpace: 'nowrap', fontWeight: 600 }}
              >
                {addingMember ? 'Adding…' : '+ Add Member'}
              </button>
            </div>
          </div>

          {/* Temp password notice */}
          {newMemberPassword && (
            <div style={{
              padding: '12px 16px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              marginTop: 16,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>✓</span>
              <span>
                <strong>Member added successfully.</strong> Temporary password:{' '}
                <code style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>{newMemberPassword}</code>
              </span>
              <button
                style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setNewMemberPassword(null)}
              >✕</button>
            </div>
          )}
        </div>

        {/* ── Members Table ── */}
        <div className="card" style={{ borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid var(--gray-200)' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: 14, marginBottom: 16 }}>
            <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>Current Members</span>
            <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>{committee.length} member{committee.length !== 1 ? 's' : ''}</span>
          </div>
          {committee.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 14, padding: '8px 0' }}>
              No committee members for your campus yet. Add members above.
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr>
                  <th>Name</th><th>Email</th><th>Status</th><th>Date Added</th><th>Action</th>
                </tr></thead>
                <tbody>
                  {committee.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{m.email}</td>
                      <td>
                        <span className={`badge badge-${m.isVerified ? 'resolved' : 'submitted'}`}>
                          {m.isVerified ? 'Active' : 'Pending login'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--danger-lt)', color: 'var(--danger)', border: 'none', fontWeight: 600 }}
                          disabled={removingId === m.id}
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          {removingId === m.id ? '…' : 'Remove'}
                        </button>
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

export default CommitteeMembers;

// frontend/src/pages/GrievanceDetail.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const GrievanceDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [users, setUsers]         = useState([]);

  // Form states
  const [assignData, setAssignData]   = useState({ assigned_to: '', school: '', department: '', conflict_of_interest: false, note: '' });
  const [resolveNote, setResolveNote] = useState('');
  const [resolveConfidential, setResolveConfidential] = useState(false);
  const [escalateNote, setEscalateNote] = useState('');
  const [comment, setComment]         = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [submitting, setSubmitting]   = useState('');

  // Edit state
  const [editMode, setEditMode]     = useState(false);
  const [editData, setEditData]     = useState({});
  const [editFile, setEditFile]     = useState(null);

  const isStudent    = user?.role === 'student';
  const isDean       = user?.role === 'dean';
  const canEdit      = (g) => isStudent && g?.status === 'submitted';
  const isCommittee  = user?.role === 'committee';
  const isHandler    = ['faculty', 'dean', 'committee', 'registrar', 'vc'].includes(user?.role);
  const isOversight  = ['registrar', 'vc', 'faculty'].includes(user?.role);
  const isCampusHandler = isDean || isCommittee;

  const load = () => {
    setLoading(true);
    api.get(`/grievances/${id}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load grievance'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (isDean || isCommittee) {
      // Load assignable users for dean
      if (isDean) api.get('/auth/users').then(r => setUsers(r.data)).catch(() => {});
    }
  // eslint-disable-next-line
  }, [id]);

  // Auto-open edit mode when navigated from MyGrievances with openEdit flag
  useEffect(() => {
    if (location.state?.openEdit && data?.grievance?.status === 'submitted') {
      const g = data.grievance;
      setEditData({
        title: g.title,
        description: g.description,
        category: g.category,
        school: g.school || '',
        department: g.department || '',
        is_confidential: g.is_confidential || false,
      });
      setEditMode(true);
    }
  // eslint-disable-next-line
  }, [data]);

  const action = async (type, payload) => {
    setSubmitting(type);
    try {
      if (type === 'assign')    await api.patch(`/grievances/${id}/assign`, payload);
      if (type === 'resolve')   await api.patch(`/grievances/${id}/resolve`, payload);
      if (type === 'escalate')  await api.patch(`/grievances/${id}/escalate`, payload);
      if (type === 'comment')   await api.post(`/grievances/${id}/comment`, payload);
      if (type === 'withdraw')  await api.patch(`/grievances/${id}/withdraw`, payload);
      toast.success('Action completed successfully');
      load();
      setComment(''); setResolveNote(''); setResolveConfidential(false); setEscalateNote(''); setWithdrawReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting('');
    }
  };

  const handleEdit = async () => {
    setSubmitting('edit');
    try {
      const form = new FormData();
      if (editData.title)       form.append('title',       editData.title);
      if (editData.description) form.append('description', editData.description);
      if (editData.category)    form.append('category',    editData.category);
      form.append('school',          editData.school       ?? '');
      form.append('department',      editData.department   ?? '');
      form.append('is_confidential', editData.is_confidential ? 'true' : 'false');
      if (editFile) form.append('proof', editFile);
      await api.patch(`/grievances/${id}/edit`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Grievance updated');
      setEditMode(false);
      setEditFile(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSubmitting('');
    }
  };

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content"><p style={{ color: 'var(--gray-400)' }}>Loading…</p></main>
    </div>
  );

  if (!data) return null;

  const { grievance: g, history, comments } = data;
  const isTerminal  = ['resolved','final_resolved','withdrawn'].includes(g.status);
  const canResolve  = isHandler && !isTerminal;
  const canEscalate = isHandler && g.escalation_level < 3 && !isTerminal;
  const canWithdraw = isStudent && !isTerminal;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← Back</button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <code style={{ fontSize: 13, color: 'var(--accent)', background: 'var(--primary-lt)', padding: '3px 10px', borderRadius: 4 }}>
                  {g.ticket_id}
                </code>
                <span className={`badge badge-${g.status}`}>{g.status?.replace(/_/g, ' ')}</span>
                {g.sla_breached && <span className="badge" style={{ background: 'var(--danger-lt)', color: 'var(--danger)' }}>SLA Breached</span>}
                {g.is_confidential && <span className="badge" style={{ background: 'var(--purple-lt)', color: 'var(--purple)' }}>Confidential</span>}
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{g.title}</h1>
            </div>
          </div>
          {canEdit(g) && (
            <button
              className={`btn btn-sm ${editMode ? 'btn-outline' : 'btn-primary'}`}
              onClick={() => {
                if (!editMode) {
                  setEditData({
                    title: g.title,
                    description: g.description,
                    category: g.category,
                    school: g.school || '',
                    department: g.department || '',
                    is_confidential: g.is_confidential || false,
                  });
                }
                setEditMode(e => !e);
                setEditFile(null);
              }}
            >
              {editMode ? '✕ Cancel Edit' : '✏ Edit'}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Grievance details */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Grievance details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  ['Category', g.category?.replace(/_/g, ' ')],
                  ['School', g.school || '—'],
                  ['Department', g.department || '—'],
                  ['Submitted', new Date(g.created_at).toLocaleString()],
                  ['SLA deadline', g.sla_deadline ? new Date(g.sla_deadline).toLocaleDateString() : '—'],
                  ['Escalation level', g.escalation_level || 0],
                  ['Assigned to', g.assigned_to_name || 'Unassigned'],
                  ['Anonymous', g.is_anonymous ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 6 }}>Description</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{g.description}</p>

              {g.proof_url && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--gray-200)' }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 6 }}>Proof upload</div>
                  <a
                    href={g.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ width: 'fit-content' }}
                  >
                    Open proof{g.proof_original_name ? `: ${g.proof_original_name}` : ''}
                  </a>
                  {g.proof_mime_type && (
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
                      Type: {g.proof_mime_type}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Resolution */}
            {(g.resolution_note || g.resolution_hidden) && (
              <div className="card" style={{ borderLeft: `3px solid ${g.resolution_hidden ? 'var(--warning)' : 'var(--success)'}` }}>
                <div className="card-title" style={{ marginBottom: 8, color: g.resolution_hidden ? 'var(--warning)' : 'var(--success)' }}>
                  Resolution
                  {g.resolution_confidential && !isStudent && (
                    <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>Confidential</span>
                  )}
                </div>
                {g.resolution_hidden ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef9e7', borderRadius: 8, color: '#92400e', fontSize: 13 }}>
                    <span style={{ fontSize: 18 }}>🔒</span>
                    <span>This resolution has been marked confidential by the committee and is not visible to you.</span>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 14 }}>{g.resolution_note}</p>
                    {g.resolved_at && (
                      <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
                        Resolved on {new Date(g.resolved_at).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Activity timeline</div>
              <div className="timeline">
                {history.map((h, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-time">{new Date(h.created_at).toLocaleString()}</div>
                    <div className="timeline-action">{h.action}</div>
                    {h.new_status && (
                      <span className={`badge badge-${h.new_status}`} style={{ marginTop: 4 }}>
                        {h.new_status.replace(/_/g, ' ')}
                      </span>
                    )}
                    {h.note && <div className="timeline-note">{h.note}</div>}
                    {h.changed_by_name && (
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>by {h.changed_by_name}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Comments */}
            {comments.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  {isStudent ? 'Updates from admin' : 'Comments'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.map((c, i) => (
                    <div key={i} style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 14 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{c.author}</div>
                      <p>{c.message}</p>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                        {new Date(c.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column — actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Assign — dean SA only */}
            {isDean && g.status === 'submitted' && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Assign grievance</div>
                <div className="form-group">
                  <label className="form-label">School</label>
                  <input className="form-input" value={assignData.school}
                    onChange={e => setAssignData({...assignData, school: e.target.value})}
                    placeholder="School name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" value={assignData.department}
                    onChange={e => setAssignData({...assignData, department: e.target.value})}
                    placeholder="Department name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Assign to (User ID)</label>
                  <input className="form-input" value={assignData.assigned_to}
                    onChange={e => setAssignData({...assignData, assigned_to: e.target.value})}
                    placeholder="UUID of assignee" />
                </div>
                <label className="form-check" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={assignData.conflict_of_interest}
                    onChange={e => setAssignData({...assignData, conflict_of_interest: e.target.checked})} />
                  Conflict of interest — Dean SA handles directly
                </label>
                <div className="form-group">
                  <label className="form-label">Note</label>
                  <textarea className="form-textarea" rows={2} value={assignData.note}
                    onChange={e => setAssignData({...assignData, note: e.target.value})}
                    placeholder="Optional internal note" />
                </div>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  disabled={submitting === 'assign'}
                  onClick={() => action('assign', assignData)}>
                  {submitting === 'assign' ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            )}

            {/* Resolve */}
            {canResolve && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Resolve grievance</div>
                <div className="form-group">
                  <label className="form-label">Resolution note</label>
                  <textarea className="form-textarea" rows={3} value={resolveNote}
                    onChange={e => setResolveNote(e.target.value)}
                    placeholder="Describe the action taken and outcome…" />
                </div>
                {isCampusHandler && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={resolveConfidential}
                      onChange={e => setResolveConfidential(e.target.checked)}
                    />
                    <span>
                      Mark resolution <strong>confidential</strong>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>Student will not be able to see the resolution note</span>
                    </span>
                  </label>
                )}
                <button className="btn btn-success" style={{ width: '100%', justifyContent: 'center' }}
                  disabled={submitting === 'resolve' || !resolveNote}
                  onClick={() => action('resolve', { resolution_note: resolveNote, resolution_confidential: resolveConfidential })}>
                  {submitting === 'resolve' ? 'Resolving…' : 'Mark resolved'}
                </button>
              </div>
            )}

            {/* Escalate */}
            {canEscalate && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14, color: 'var(--warning)' }}>
                  Escalate (Level {(g.escalation_level || 0) + 1})
                </div>
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
                  {g.escalation_level === 0 && 'Escalates to Dean SA for review (3-day SLA)'}
                  {g.escalation_level === 1 && 'Escalates to Registrar for policy review (5-day SLA)'}
                  {g.escalation_level === 2 && `Escalates to ${g.category === 'academic' ? 'Director Academics' : 'Vice Chancellor'} — final authority`}
                </p>
                <div className="form-group">
                  <label className="form-label">Reason for escalation</label>
                  <textarea className="form-textarea" rows={2} value={escalateNote}
                    onChange={e => setEscalateNote(e.target.value)}
                    placeholder="Why is this being escalated?" />
                </div>
                <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                  disabled={submitting === 'escalate'}
                  onClick={() => action('escalate', { note: escalateNote })}>
                  {submitting === 'escalate' ? 'Escalating…' : 'Escalate'}
                </button>
              </div>
            )}

            {/* Internal comment (handlers only) */}
            {isHandler && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Add comment</div>
                <textarea className="form-textarea" rows={3} value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Internal note or update…" />
                <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  disabled={submitting === 'comment' || !comment}
                  onClick={() => action('comment', { message: comment, is_internal: true })}>
                  {submitting === 'comment' ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            )}

            {/* Edit grievance (student, submitted status only) */}
            {editMode && canEdit(g) && (
              <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="card-title" style={{ marginBottom: 14, color: 'var(--primary)' }}>Edit Grievance</div>
                <div className="form-group">
                  <label className="form-label">Title <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={editData.title || ''}
                    onChange={e => setEditData({ ...editData, title: e.target.value })}
                    placeholder="Grievance title" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <textarea className="form-textarea" rows={4} value={editData.description || ''}
                    onChange={e => setEditData({ ...editData, description: e.target.value })}
                    placeholder="Describe the issue…" style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={editData.category || ''}
                    onChange={e => setEditData({ ...editData, category: e.target.value })}>
                    {['academic','ragging_harassment','financial','infrastructure','faculty_conduct','administrative','other']
                      .map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">School</label>
                    <input className="form-input" value={editData.school || ''}
                      onChange={e => setEditData({ ...editData, school: e.target.value })}
                      placeholder="School name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <input className="form-input" value={editData.department || ''}
                      onChange={e => setEditData({ ...editData, department: e.target.value })}
                      placeholder="Department" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Replace Proof (optional)</label>
                  <input type="file" className="form-input" style={{ padding: '6px 10px', cursor: 'pointer' }}
                    onChange={e => setEditFile(e.target.files[0] || null)} />
                  {editFile && <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>New file: {editFile.name}</p>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editData.is_confidential || false}
                    onChange={e => setEditData({ ...editData, is_confidential: e.target.checked })} />
                  Keep submission confidential
                </label>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  disabled={submitting === 'edit' || !editData.title?.trim() || !editData.description?.trim()}
                  onClick={handleEdit}>
                  {submitting === 'edit' ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}

            {/* Withdraw (student) */}
            {canWithdraw && (
              <div className="card" style={{ borderColor: 'var(--danger-lt)' }}>
                <div className="card-title" style={{ marginBottom: 14, color: 'var(--danger)' }}>
                  Withdraw grievance
                </div>
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>
                  Once withdrawn, this grievance cannot be reopened.
                </p>
                <textarea className="form-textarea" rows={2} value={withdrawReason}
                  onChange={e => setWithdrawReason(e.target.value)}
                  placeholder="Reason for withdrawal (required)" />
                <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  disabled={submitting === 'withdraw' || !withdrawReason}
                  onClick={() => {
                    if (window.confirm('Are you sure you want to withdraw this grievance? This cannot be undone.')) {
                      action('withdraw', { reason: withdrawReason });
                    }
                  }}>
                  {submitting === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default GrievanceDetail;
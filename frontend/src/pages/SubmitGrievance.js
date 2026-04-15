// frontend/src/pages/SubmitGrievance.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/shared/Sidebar';
import api from '../utils/api';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { value: 'academic',           label: 'Academic (grades, exams, evaluation)' },
  { value: 'ragging_harassment', label: 'Ragging / Harassment — Fast track 24hr' },
  { value: 'faculty_conduct',    label: 'Faculty conduct' },
  { value: 'financial',          label: 'Financial / Fee related' },
  { value: 'infrastructure',     label: 'Infrastructure / Facilities' },
  { value: 'administrative',     label: 'Administrative / Office related' },
  { value: 'other',              label: 'Other' },
];

const SubmitGrievance = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', category: '',
    school: user?.school || '', department: user?.department || '',
    is_confidential: false,
  });
  const [proofFile, setProofFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.category) return setError('Please select a category');
    if (form.description.length < 30)
      return setError('Please describe your grievance in at least 30 characters');
    if (!proofFile) return setError('Please upload proof (image, video, audio, or PDF)');

    setLoading(true);
    try {
      const payload = new FormData();
      payload.append('title', form.title);
      payload.append('description', form.description);
      payload.append('category', form.category);
      payload.append('school', form.school || '');
      payload.append('department', form.department || '');
      payload.append('is_confidential', String(form.is_confidential));
      payload.append('is_anonymous', 'false');
      payload.append('proof', proofFile);

      const res = await api.post('/grievances', payload);
      toast.success(`Grievance submitted! Ticket: ${res.data.grievance.ticket_id}`);
      navigate('/my');
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isRagging = form.category === 'ragging_harassment';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Raise a Grievance</h1>
          <p className="page-sub">Your complaint will be acknowledged within 24 hours</p>
        </div>

        {isRagging && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            <strong>Fast-track case.</strong> Ragging and harassment complaints are handled by a dedicated
            committee with a 24-hour SLA. If you are in immediate danger, contact campus security directly.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          <form onSubmit={handleSubmit}>

            {/* Category — pick first to show relevant guidance */}
            <div className="form-group">
              <label className="form-label">Category <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="form-select" name="category" value={form.category} onChange={handleChange} required>
                <option value="">Select a category…</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Title <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="form-input" name="title" value={form.title}
                onChange={handleChange} placeholder="Brief summary of your grievance" required maxLength={200} />
              <p className="form-hint">{form.title.length}/200 characters</p>
            </div>

            <div className="form-group">
              <label className="form-label">
                Description <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea className="form-textarea" name="description" value={form.description}
                onChange={handleChange} rows={5}
                placeholder="Describe your grievance in detail — what happened, when, who was involved, and what outcome you are seeking."
                required style={{ minHeight: 140 }} />
              <p className="form-hint">{form.description.length} characters (minimum 30)</p>
            </div>

            <div className="form-group">
              <label className="form-label">Proof upload <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                className="form-input"
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={e => setProofFile(e.target.files?.[0] || null)}
                required
              />
              <p className="form-hint">
                Accepted: images, videos, audio recordings (.mp3, .wav, .m4a, etc.), or PDF documents (max 50 MB).
                {proofFile ? ` Selected: ${proofFile.name}` : ''}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">School / Faculty</label>
                <input className="form-input" name="school" value={form.school}
                  disabled placeholder="Auto-filled from your profile" 
                  style={{ backgroundColor: 'var(--gray-50)', cursor: 'not-allowed' }} />
                <p className="form-hint">From your registration data</p>
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <input className="form-input" name="department" value={form.department}
                  disabled placeholder="Auto-filled from your profile"
                  style={{ backgroundColor: 'var(--gray-50)', cursor: 'not-allowed' }} />
                <p className="form-hint">From your registration data</p>
              </div>
            </div>

            {/* Privacy options */}
            <div className="card" style={{ background: 'var(--gray-50)', marginBottom: 20, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: 'var(--gray-600)' }}>
                Privacy settings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="form-check">
                  <input type="radio" name="privacy" value="normal" 
                    checked={form.is_confidential === false}
                    onChange={() => setForm({ ...form, is_confidential: false })} />
                  <span style={{ marginLeft: 8 }}>
                    <strong>Standard (visible to Dean SA and Resolver)</strong>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0 0 0' }}>
                      Full details visible to Dean SA and the assigned resolver
                    </p>
                  </span>
                </label>
                <label className="form-check">
                  <input type="radio" name="privacy" value="confidential"
                    checked={form.is_confidential === true}
                    onChange={() => setForm({ ...form, is_confidential: true })} />
                  <span style={{ marginLeft: 8 }}>
                    <strong>Confidential (restricted from both)</strong>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0 0 0' }}>
                      Full details restricted from Dean SA and resolver. Only listed as confidential grievance
                    </p>
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Submitting…' : 'Submit grievance'}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => navigate('/dashboard')}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default SubmitGrievance;
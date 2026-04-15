// frontend/src/pages/Register.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const SCHOOLS = [
  'School of Ancient Hindu Sciences',
  'School of Architecture',
  'School of Engineering',
  'School of Health Sciences',
  'School of Informatics',
  'School of Law',
  'School of Management Studies',
  'School of Psychology'
];

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '', student_id: '', school: '', department: '', campus: '', role: 'student'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (form.role !== 'student') {
      return setError('This form is for student registration only');
    }

    // Email validation for Aurora domain
    if (!form.email.endsWith('@aurora.edu.in')) {
      return setError('Please use your Aurora email (@aurora.edu.in)');
    }
    
    if (form.password !== form.confirm) {
      return setError('Passwords do not match');
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    if (!form.campus) {
      return setError('Please select your campus');
    }
    if (!form.school) {
      return setError('Please select a school');
    }
    if (!form.department.trim()) {
      return setError('Please enter your department');
    }
    
    setLoading(true);
    try {
      await register({
        name: form.name, email: form.email,
        role: form.role,
        password: form.password,
        student_id: form.student_id,
        school: form.school,
        department: form.department,
        campus: form.campus,
      });
      toast.success('Account created successfully. You can log in now.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Grievance Portal</h1>
          <p>Create your student account</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="form-input" name="name" value={form.name}
              onChange={handleChange} placeholder="Your full name" required />
          </div>
          <div className="form-group">
            <label className="form-label">College email <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" type="email" name="email" value={form.email}
              onChange={handleChange} placeholder="you@aurora.edu.in" required />
            <p className="form-hint">Use your @aurora.edu.in email address</p>
          </div>
          <div className="form-group">
            <label className="form-label">Campus <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="form-select" name="campus" value={form.campus}
              onChange={handleChange} required>
              <option value="">Select your campus…</option>
              <option value="uppal">Uppal Campus</option>
              <option value="bhongir">Bhongir Campus</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Student ID</label>
              <input className="form-input" name="student_id" value={form.student_id}
                onChange={handleChange} placeholder="e.g. 21CS001" />
            </div>
            <div className="form-group">
              <label className="form-label">School <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="form-select" name="school" value={form.school}
                onChange={handleChange} required>
                <option value="">Select a school…</option>
                {SCHOOLS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Department <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" name="department" value={form.department}
              onChange={handleChange} placeholder="e.g. Computer Science" required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" name="password" value={form.password}
              onChange={handleChange} placeholder="Min 8 characters" required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input className="form-input" type="password" name="confirm" value={form.confirm}
              onChange={handleChange} placeholder="Repeat password" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--gray-400)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
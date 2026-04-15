// frontend/src/components/shared/Sidebar.js
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const isStudent    = user?.role === 'student';
  const isDean       = user?.role === 'dean';
  const isCommittee  = user?.role === 'committee';
  const isDirector   = user?.role === 'faculty';
  const isRegistrar  = user?.role === 'registrar';
  const isVC         = user?.role === 'vc';

  const designationMap = {
    student:    'Student',
    dean:       'Dean — Student Affairs',
    committee:  'Grievance Committee',
    faculty:    'Director — Academics & Planning',
    registrar:  'Registrar',
    vc:         'Vice Chancellor',
  };

  const NavItem = ({ path, label, exact }) => {
    const active = exact ? location.pathname === path : isActive(path);
    return (
      <button
        className={`nav-item ${active ? 'active' : ''}`}
        onClick={() => navigate(path)}
        style={{ fontSize: 17, padding: '12px 16px', marginBottom: 2 }}
      >
        {label}
      </button>
    );
  };

  return (
    <aside className="sidebar" style={{ gap: 0 }}>
      {/* Logo */}
      <div className="sidebar-logo" style={{ fontSize: 20, fontWeight: 700, paddingBottom: 22, marginBottom: 22 }}>
        Grievance <span>Portal</span>
      </div>

      {/* Student nav */}
      {isStudent && <>
        <NavItem path="/dashboard" label="Dashboard" icon="◈" exact />
        <NavItem path="/submit"    label="Raise Grievance" icon="✦" exact />
        <NavItem path="/my"        label="My Grievances" icon="◎" exact />
      </>}

      {/* Dean nav */}
      {isDean && <>
        <NavItem path="/dashboard/dean"            label="Dashboard" icon="◈" exact />
        <NavItem path="/grievances"                label="All Grievances" icon="≡" exact />
        <NavItem path="/grievances?status=submitted" label="Pending Grievances" icon="⏳" exact />
        <NavItem path="/dashboard/dean/committee"  label="Committee Members" icon="◉" exact />
      </>}

      {/* Committee nav */}
      {isCommittee && <>
        <NavItem path="/dashboard/committee" label="Dashboard" icon="◈" exact />
        <NavItem path="/grievances"          label="My Cases" icon="≡" exact />
      </>}

      {/* Director (faculty) nav */}
      {isDirector && <>
        <NavItem path="/dashboard/director" label="Analytics" icon="◐" exact />
        <NavItem path="/grievances"         label="All Grievances" icon="≡" exact />
        <NavItem path="/grievances?status=pending_director_approval" label="Approvals" icon="✓" exact />
        <NavItem path="/oversight"          label="Pending Grievances" icon="⏳" exact />
      </>}

      {/* Registrar nav */}
      {isRegistrar && <>
        <NavItem path="/dashboard/registrar" label="Analytics" icon="◐" exact />
        <NavItem path="/grievances"          label="All Grievances" icon="≡" exact />
        <NavItem path="/grievances?status=submitted" label="Pending Grievances" icon="⏳" exact />
        <NavItem path="/grievances?status=pending_approval" label="Approvals" icon="✓" exact />
      </>}

      {/* Vice Chancellor nav */}
      {isVC && <>
        <NavItem path="/dashboard/vice_chancellor"       label="Analytics" icon="◐" exact />
        <NavItem path="/grievances"                      label="All Grievances" icon="≡" exact />
        <NavItem path="/grievances?status=submitted"     label="Pending Grievances" icon="⏳" exact />
        <NavItem path="/grievances?status=resolved"      label="Resolved Grievances" icon="✔" exact />
        <NavItem path="/dashboard/vice_chancellor?tab=sla" label="SLA Configuration" icon="⏱" exact />
      </>}

      {/* Bottom: account info + logout */}
      <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          padding: '10px 14px', marginBottom: 10,
          background: 'rgba(255,255,255,0.06)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'white', marginBottom: 2 }}>
            {user?.name}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
            {designationMap[user?.role] || user?.role?.toUpperCase()}
          </div>
          {(isDean || isCommittee) && user?.campus && (
            <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 3, textTransform: 'capitalize' }}>
              {user.campus} Campus
            </div>
          )}
        </div>
        <button
          className="nav-item"
          onClick={handleLogout}
          style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', padding: '10px 14px' }}
        >
          <span style={{ fontSize: 15 }}>→</span> Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

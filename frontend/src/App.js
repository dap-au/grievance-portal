// frontend/src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import CornerLogo from './components/shared/CornerLogo';
import ChatWidget from './components/chat/ChatWidget';
import './index.css';

// Pages
import Login        from './pages/Login';
import Register     from './pages/Register';
import Dashboard    from './pages/Dashboard';
import DeanDashboard from './pages/DeanDashboard';
import CommitteeDashboard from './pages/CommitteeDashboard';
import DirectorDashboard from './pages/DirectorDashboard';
import RegistrarDashboard from './pages/RegistrarDashboard';
import ViceChancellorDashboard from './pages/ViceChancellorDashboard';
import SubmitGrievance  from './pages/SubmitGrievance';
import MyGrievances from './pages/MyGrievances';
import GrievanceDetail  from './pages/GrievanceDetail';
import AllGrievances    from './pages/AllGrievances';
import OversightDashboard from './pages/OversightDashboard';
import CommitteeMembers from './pages/CommitteeMembers';

// Protected route wrapper
const PrivateRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login"    element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />

      {/* Student routes */}
      <Route path="/submit"   element={<PrivateRoute roles={['student']}><SubmitGrievance /></PrivateRoute>} />
      <Route path="/my"       element={<PrivateRoute roles={['student']}><MyGrievances /></PrivateRoute>} />

      {/* Handler routes */}
      <Route path="/grievances"    element={<PrivateRoute roles={['faculty','dean','committee','registrar','vc']}><AllGrievances /></PrivateRoute>} />

      {/* Role-specific dashboards */}
      <Route path="/dashboard/dean" element={<PrivateRoute roles={['dean']}><DeanDashboard /></PrivateRoute>} />
      <Route path="/dashboard/dean/committee" element={<PrivateRoute roles={['dean']}><CommitteeMembers /></PrivateRoute>} />
      <Route path="/dashboard/committee" element={<PrivateRoute roles={['committee']}><CommitteeDashboard /></PrivateRoute>} />
      <Route path="/dashboard/director" element={<PrivateRoute roles={['faculty']}><DirectorDashboard /></PrivateRoute>} />
      <Route path="/dashboard/registrar" element={<PrivateRoute roles={['registrar']}><RegistrarDashboard /></PrivateRoute>} />
      <Route path="/dashboard/vice_chancellor" element={<PrivateRoute roles={['vc']}><ViceChancellorDashboard /></PrivateRoute>} />

      {/* Oversight */}
      <Route path="/oversight" element={<PrivateRoute roles={['registrar','vc','faculty']}><OversightDashboard /></PrivateRoute>} />

      {/* Shared */}
      <Route path="/grievances/:id" element={<PrivateRoute><GrievanceDetail /></PrivateRoute>} />
      
      {/* Smart dashboard routing based on role */}
      <Route path="/dashboard"      element={<PrivateRouteDashboard />} />
      <Route path="/"               element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

const AppShell = () => {
  const location = useLocation();
  const hideCornerLogo = ['/login', '/register'].includes(location.pathname);

  return (
    <>
      {!hideCornerLogo && <CornerLogo />}
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <AppRoutes />
      <ChatWidget />
    </>
  );
};

// Smart router that redirects to role-specific dashboard
const PrivateRouteDashboard = () => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  // Route to role-specific dashboard
  if (user.role === 'student') return <Dashboard />;
  if (user.role === 'vc') return <ViceChancellorDashboard />;
  if (user.role === 'registrar') return <RegistrarDashboard />;
  if (user.role === 'faculty') return <DirectorDashboard />;
  if (user.role === 'dean') return <DeanDashboard />;
  if (user.role === 'committee') return <CommitteeDashboard />;
  
  // Fallback
  return <Dashboard />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SocketProvider>
          <AppShell />
        </SocketProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
// frontend/src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

const normalizeUser = (user) => ({
  ...user,
  student_id: user?.student_id ?? user?.studentId ?? null,
  school: user?.school ?? null,
  department: user?.department ?? null,
  campus: user?.campus ?? null,
});

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const token  = localStorage.getItem('token');
    if (stored && token) {
      setUser(normalizeUser(JSON.parse(stored)));

      api.get('/auth/me')
        .then((res) => {
          const freshUser = normalizeUser(res.data);
          localStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        })
        .finally(() => setLoading(false));
      return;
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    const normalizedUser = normalizeUser(res.data.user);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    return normalizedUser;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    if (res.data.token && res.data.user) {
      localStorage.setItem('token', res.data.token);
      const normalizedUser = normalizeUser(res.data.user);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
    }
    return normalizeUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
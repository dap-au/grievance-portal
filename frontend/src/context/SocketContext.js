// frontend/src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const CHAT_ROLES = ['dean', 'registrar', 'faculty', 'committee', 'vc'];
const SERVER_URL  = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:5000';

export function SocketProvider({ children }) {
  const { user }       = useAuth();
  const socketRef      = useRef(null);
  const [connected, setConnected]     = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  // Map of convId → unread count
  const [unreadMap, setUnreadMap]     = useState({});

  const canChat = user && CHAT_ROLES.includes(user.role);

  useEffect(() => {
    if (!canChat) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [canChat, user?.id]);

  const incrementUnread = (convId) => {
    setUnreadMap((prev) => {
      const next = { ...prev, [convId]: (prev[convId] || 0) + 1 };
      setTotalUnread(Object.values(next).reduce((a, b) => a + b, 0));
      return next;
    });
  };

  const clearUnread = (convId) => {
    setUnreadMap((prev) => {
      const next = { ...prev, [convId]: 0 };
      setTotalUnread(Object.values(next).reduce((a, b) => a + b, 0));
      return next;
    });
  };

  const initUnreads = (conversations) => {
    const map = {};
    conversations.forEach((c) => { map[c.id] = c.unread_count || 0; });
    setUnreadMap(map);
    setTotalUnread(conversations.reduce((a, c) => a + (c.unread_count || 0), 0));
  };

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      connected,
      canChat,
      totalUnread,
      unreadMap,
      incrementUnread,
      clearUnread,
      initUnreads,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

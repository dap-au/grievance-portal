// frontend/src/components/chat/ChatWidget.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../utils/api';
import auroraLogo from '../../aurora logo.jpeg';

const CHAT_ROLES    = ['dean', 'registrar', 'faculty', 'committee', 'vc'];
const ALLOWED_EMOJI = ['👍', '✅', '❗', '👀', '🙏'];

const roleLabel = {
  dean:      'Dean',
  registrar: 'Registrar',
  faculty:   'Director',
  committee: 'Committee',
  vc:        'VC',
};

const convLabel = (conv, userId) => {
  if (conv.type === 'global') return 'Staff Room';
  if (conv.name) return conv.name;
  return `DM #${conv.id}`;
};

/* ── Tiny helpers ── */
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/* ─────────────────────────────────────────────────────────────
   MessageBubble
───────────────────────────────────────────────────────────── */
function MessageBubble({ msg, isMine, onReact }) {
  const [showActions, setShowActions] = useState(false);
  const reactions = msg.reactions || {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        marginBottom: 10,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isMine && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, paddingLeft: 4 }}>
          <strong>{msg.sender_name}</strong>
          <span style={{ marginLeft: 4, opacity: 0.7 }}>{roleLabel[msg.sender_role] || msg.sender_role}</span>
        </div>
      )}
      <div style={{ position: 'relative', maxWidth: '75%' }}>
        <div style={{
          background: isMine ? '#2563eb' : '#f1f5f9',
          color: isMine ? 'white' : '#1e293b',
          borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          padding: '8px 12px',
          fontSize: 13.5,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}>
          {msg.body}
        </div>

        {/* Reaction bar */}
        {showActions && (
          <div style={{
            position: 'absolute',
            [isMine ? 'left' : 'right']: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: 2,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            padding: '2px 6px',
            marginLeft: isMine ? 0 : 6,
            marginRight: isMine ? 6 : 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}>
            {ALLOWED_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => onReact(msg.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '1px 2px', borderRadius: 4 }}
                title={e}
              >{e}</button>
            ))}
          </div>
        )}
      </div>

      {/* Reaction counts */}
      {reactionEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
          {reactionEntries.map(([emoji, users]) => (
            <span
              key={emoji}
              onClick={() => onReact(msg.id, emoji)}
              style={{
                cursor: 'pointer',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 12,
              }}
            >{emoji} {users.length}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, paddingRight: isMine ? 2 : 0, paddingLeft: isMine ? 0 : 4 }}>
        {fmtTime(msg.created_at)}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main ChatWidget
───────────────────────────────────────────────────────────── */
export default function ChatWidget() {
  const { user }  = useAuth();
  const { socket, canChat, totalUnread, unreadMap, incrementUnread, clearUnread, initUnreads } = useSocket();

  const [open,          setOpen]         = useState(false);
  const [conversations, setConversations]= useState([]);
  const [activeConv,    setActiveConv]   = useState(null);
  const [messages,      setMessages]     = useState([]);
  const [input,         setInput]        = useState('');
  const [typingUsers,   setTypingUsers]  = useState([]);
  const [staffUsers,    setStaffUsers]   = useState([]);
  const [showNewDM,     setShowNewDM]    = useState(false);
  const [loadingMsgs,   setLoadingMsgs] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimer    = useRef(null);
  const inputRef       = useRef(null);

  // Scroll to bottom
  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data);
      initUnreads(res.data);
      // Auto-select global room on first open
      if (!activeConv && res.data.length > 0) {
        const global = res.data.find((c) => c.type === 'global') || res.data[0];
        setActiveConv(global);
      }
    } catch {}
  }, [activeConv]);

  // Load messages for active conversation
  const loadMessages = useCallback(async (conv) => {
    if (!conv) return;
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/chat/conversations/${conv.id}/messages`);
      setMessages(res.data);
      clearUnread(conv.id);
      socket?.emit('mark_read', { convId: conv.id });
    } catch {} finally {
      setLoadingMsgs(false);
    }
  }, [socket, clearUnread]);

  // Open widget
  useEffect(() => {
    if (open && canChat) {
      loadConversations();
    }
  }, [open, canChat]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv);
      socket?.emit('join_room', activeConv.id);
    }
  }, [activeConv?.id]);

  // Scroll on new messages
  useEffect(() => { scrollBottom(); }, [messages]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg) => {
      if (activeConv && msg.conversation_id === activeConv.id) {
        setMessages((prev) => [...prev, msg]);
        socket.emit('mark_read', { convId: activeConv.id });
      } else {
        incrementUnread(msg.conversation_id);
      }
      // Refresh conv list for last_message preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversation_id
            ? { ...c, last_message: msg.body, last_sender: msg.sender_name, last_at: msg.created_at }
            : c
        )
      );
    };

    const onTyping = ({ userId: uid, name }) => {
      if (uid === user?.id) return;
      setTypingUsers((prev) => prev.find((u) => u.userId === uid) ? prev : [...prev, { userId: uid, name }]);
    };
    const onStopTyping = ({ userId: uid }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== uid));
    };
    const onReaction = (updatedMsg) => {
      setMessages((prev) => prev.map((m) => m.id === updatedMsg.id ? updatedMsg : m));
    };

    socket.on('message_received', onMessage);
    socket.on('typing',           onTyping);
    socket.on('stop_typing',      onStopTyping);
    socket.on('reaction_updated', onReaction);

    return () => {
      socket.off('message_received', onMessage);
      socket.off('typing',           onTyping);
      socket.off('stop_typing',      onStopTyping);
      socket.off('reaction_updated', onReaction);
    };
  }, [socket, activeConv?.id, user?.id]);

  const handleSend = () => {
    if (!input.trim() || !activeConv || !socket) return;
    socket.emit('send_message', { convId: activeConv.id, body: input.trim() });
    setInput('');
    clearTimeout(typingTimer.current);
    socket.emit('stop_typing', { convId: activeConv.id });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket || !activeConv) return;
    socket.emit('typing', { convId: activeConv.id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('stop_typing', { convId: activeConv.id });
    }, 2000);
  };

  const handleReact = (msgId, emoji) => {
    socket?.emit('react_message', { msgId, emoji });
  };

  const loadStaffUsers = async () => {
    try {
      const res = await api.get('/chat/staff-users');
      setStaffUsers(res.data);
    } catch {}
  };

  const startDM = async (targetUser) => {
    try {
      const res = await api.post('/chat/conversations', {
        type: 'direct',
        member_ids: [targetUser.id],
        name: targetUser.name,
      });
      const newConv = { ...res.data, name: targetUser.name, type: 'direct' };
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === newConv.id);
        return exists ? prev : [newConv, ...prev];
      });
      setActiveConv(newConv);
      setShowNewDM(false);
    } catch {}
  };

  if (!canChat) return null;

  /* ── FAB Button ── */
  const fab = (
    <button
      onClick={() => setOpen((v) => !v)}
      title="Staff Chat"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'white',
        border: '2px solid #2563eb',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        transition: 'transform 0.2s, box-shadow 0.2s',
        padding: 0,
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.35)';
      }}
    >
      <img
        src={auroraLogo}
        alt="Aurora"
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
      />

      {totalUnread > 0 && (
        <span style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: '#ef4444',
          color: 'white',
          borderRadius: '50%',
          width: 20,
          height: 20,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid white',
        }}>
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  );

  if (!open) return fab;

  /* ── Chat Panel ── */
  return (
    <>
      {fab}
      <div style={{
        position: 'fixed',
        bottom: 90,
        right: 24,
        width: 440,
        height: 560,
        background: 'white',
        borderRadius: 18,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1199,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        animation: 'chatSlideUp 0.22s ease-out',
      }}>

        {/* ── Panel Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={auroraLogo}
              alt="Aurora"
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)', flexShrink: 0 }}
            />
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>
                {activeConv ? convLabel(activeConv) : 'Staff Chat'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                Internal · Staff only
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setShowNewDM((v) => !v); if (!staffUsers.length) loadStaffUsers(); }}
              title="New Direct Message"
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 13 }}
            >+ DM</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >✕</button>
          </div>
        </div>

        {/* ── New DM Picker ── */}
        {showNewDM && (
          <div style={{
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '10px 12px',
            flexShrink: 0,
            maxHeight: 160,
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Start a direct message</div>
            {staffUsers.length === 0
              ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading staff...</div>
              : staffUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startDM(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', background: 'white', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '6px 10px', marginBottom: 4,
                    cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{roleLabel[u.role] || u.role}{u.campus ? ` · ${u.campus}` : ''}</div>
                  </div>
                </button>
              ))}
          </div>
        )}

        {/* ── Body: conversation list + chat window ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Conversation sidebar */}
          <div style={{
            width: 148,
            borderRight: '1px solid #e2e8f0',
            overflowY: 'auto',
            background: '#f8fafc',
            flexShrink: 0,
          }}>
            {conversations.map((conv) => {
              const isActive = activeConv?.id === conv.id;
              const unread   = unreadMap[conv.id] || 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => { setActiveConv(conv); setShowNewDM(false); }}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderRadius: 0,
                    background: isActive ? '#dbeafe' : 'transparent',
                    borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                    padding: '10px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      fontSize: 12.5,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? '#1e40af' : '#374151',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 88,
                    }}>
                      {conv.type === 'global' && '# '}{convLabel(conv)}
                    </div>
                    {unread > 0 && (
                      <span style={{ background: '#ef4444', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', flexShrink: 0 }}>
                        {unread}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {conv.last_message}
                    </div>
                  )}
                  {conv.last_at && (
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{fmtDate(conv.last_at)}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!activeConv ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
                Select a conversation
              </div>
            ) : (
              <>
                {/* Messages list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px' }}>
                  {loadingMsgs && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 8 }}>Loading...</div>
                  )}
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isMine={msg.sender_id === user?.id}
                      onReact={handleReact}
                    />
                  ))}
                  {typingUsers.length > 0 && (
                    <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                      {typingUsers.map((u) => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{
                  borderTop: '1px solid #e2e8f0',
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 8,
                  flexShrink: 0,
                  background: 'white',
                }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: '1.5px solid #e2e8f0',
                      padding: '8px 12px',
                      fontSize: 13,
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      maxHeight: 80,
                      overflowY: 'auto',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      background: input.trim() ? '#2563eb' : '#e2e8f0',
                      color: input.trim() ? 'white' : '#94a3b8',
                      border: 'none',
                      borderRadius: 10,
                      width: 38,
                      height: 38,
                      cursor: input.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      alignSelf: 'flex-end',
                      transition: 'background 0.15s',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

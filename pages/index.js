import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [brainStatus, setBrainStatus] = useState('Initializing...');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    checkBrainStatus();
  }, []);

  const checkBrainStatus = async () => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ping' })
      });
      const data = await res.json();
      if (data.reply && !data.reply.includes('0 knowledge')) {
        setBrainStatus('Active');
      } else {
        setBrainStatus('Training...');
      }
    } catch {
      setBrainStatus('Offline');
    }
  };

  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || 'No response' }]);
      setBrainStatus('Active');
    } catch (err) {
      console.error('Send error:', err);
      setMessages(prev => [...prev, { role: 'bot', text: 'Connection error. Try again.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const brainColor = brainStatus === 'Active' ? '#10b981' : brainStatus === 'Training...' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      maxWidth: '700px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0f172a',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #1e293b',
        marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>🧠</span>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>Neural Chat</h1>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#1e293b',
          padding: '6px 12px',
          borderRadius: '20px',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            display: 'inline-block',
            backgroundColor: brainColor,
          }}></span>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>{brainStatus}</span>
        </div>
      </div>

      <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>
        Self-improving AI • Trains every 10 minutes
      </p>

      {/* Chat Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: '400px',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <h3 style={{ fontSize: '20px', color: '#f1f5f9', marginBottom: '8px' }}>Your AI is Ready</h3>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
              This chatbot runs on a neural network trained from scratch.<br />
              It learns by watching GPT-4o conversations.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ backgroundColor: '#1e293b', color: '#94a3b8', padding: '6px 14px', borderRadius: '16px', fontSize: '12px' }}>🧠 Custom Brain</span>
              <span style={{ backgroundColor: '#1e293b', color: '#94a3b8', padding: '6px 14px', borderRadius: '16px', fontSize: '12px' }}>🔄 Self-Improving</span>
              <span style={{ backgroundColor: '#1e293b', color: '#94a3b8', padding: '6px 14px', borderRadius: '16px', fontSize: '12px' }}>💰 100% Free</span>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {m.role === 'bot' && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
              }}>🧠</div>
            )}
            <div style={{
              maxWidth: '70%',
              padding: '10px 16px',
              borderRadius: '16px',
              fontSize: '14px',
              lineHeight: '1.5',
              wordBreak: 'break-word',
              backgroundColor: m.role === 'user' ? '#2563eb' : '#1e293b',
              color: m.role === 'user' ? '#ffffff' : '#e2e8f0',
              borderBottomRightRadius: m.role === 'user' ? '4px' : '16px',
              borderBottomLeftRadius: m.role === 'user' ? '16px' : '4px',
            }}>
              {m.text}
            </div>
            {m.role === 'user' && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
              }}>👤</div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
            }}>🧠</div>
            <div style={{
              backgroundColor: '#1e293b',
              padding: '12px 16px',
              borderRadius: '16px',
              display: 'flex',
              gap: '4px',
            }}>
              <span style={{ color: '#64748b', fontSize: '12px' }}>●</span>
              <span style={{ color: '#64748b', fontSize: '12px' }}>●</span>
              <span style={{ color: '#64748b', fontSize: '12px' }}>●</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '16px 0',
        borderTop: '1px solid #1e293b',
        marginTop: '8px',
      }}>
        <input
          ref={inputRef}
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: '14px',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            color: '#f1f5f9',
            outline: 'none',
          }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={loading}
          autoFocus
        />
        <button
          style={{
            width: '44px',
            height: '44px',
            backgroundColor: loading ? '#475569' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={send}
          disabled={loading}
        >
          ➤
        </button>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        padding: '12px 0',
        color: '#475569',
        fontSize: '11px',
      }}>
        <span>⚡ Powered by a self-training neural network</span>
        <span>🔄 Improves every 10 min</span>
      </div>
    </div>
  );
}

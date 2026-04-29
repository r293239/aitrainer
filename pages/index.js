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
    // Check brain status
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'ping' }) })
      .then(res => res.json())
      .then(data => {
        if (data.reply.includes('still learning')) {
          setBrainStatus('Training...');
        } else {
          setBrainStatus('Active');
        }
      })
      .catch(() => setBrainStatus('Offline'));
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || '...' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: 'Connection error. Try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const brainColor = brainStatus === 'Active' ? '#10b981' : brainStatus === 'Training...' ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🧠</span>
          <h1 style={styles.title}>Neural Chat</h1>
        </div>
        <div style={styles.statusBadge}>
          <span style={{ ...styles.statusDot, backgroundColor: brainColor }}></span>
          <span style={styles.statusText}>{brainStatus}</span>
        </div>
      </div>

      {/* Subtitle */}
      <p style={styles.subtitle}>Self-improving AI • Trains every 10 minutes</p>

      {/* Chat Area */}
      <div style={styles.chatArea}>
        {messages.length === 0 && (
          <div style={styles.welcome}>
            <div style={styles.welcomeIcon}>🤖</div>
            <h3 style={styles.welcomeTitle}>Your AI is Ready</h3>
            <p style={styles.welcomeText}>
              This chatbot runs on a neural network trained from scratch.
              <br />It learns by watching GPT-4o conversations.
            </p>
            <div style={styles.features}>
              <span style={styles.feature}>🧠 Custom Brain</span>
              <span style={styles.feature}>🔄 Self-Improving</span>
              <span style={styles.feature}>💰 100% Free</span>
            </div>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} style={{ ...styles.messageRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'bot' && <div style={styles.botAvatar}>🧠</div>}
            <div style={{
              ...styles.message,
              backgroundColor: m.role === 'user' ? '#2563eb' : '#1e293b',
              color: m.role === 'user' ? '#ffffff' : '#e2e8f0',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              borderBottomRightRadius: m.role === 'user' ? '4px' : '16px',
              borderBottomLeftRadius: m.role === 'user' ? '16px' : '4px',
            }}>
              {m.text}
            </div>
            {m.role === 'user' && <div style={styles.userAvatar}>👤</div>}
          </div>
        ))}
        
        {loading && (
          <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
            <div style={styles.botAvatar}>🧠</div>
            <div style={styles.typingIndicator}>
              <span style={styles.typingDot}>●</span>
              <span style={{ ...styles.typingDot, animationDelay: '0.2s' }}>●</span>
              <span style={{ ...styles.typingDot, animationDelay: '0.4s' }}>●</span>
            </div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputArea}>
        <input
          ref={inputRef}
          style={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type your message..."
          disabled={loading}
          autoFocus
        />
        <button
          style={{ ...styles.sendButton, opacity: loading ? 0.5 : 1 }}
          onClick={send}
          disabled={loading}
        >
          {loading ? '...' : '➤'}
        </button>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>⚡ Powered by a self-training neural network</span>
        <span>🔄 Improves every 10 min</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0f172a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
    borderBottom: '1px solid #1e293b',
    marginBottom: '8px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    fontSize: '28px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: 0,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#1e293b',
    padding: '6px 12px',
    borderRadius: '20px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: '500',
  },
  subtitle: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px',
    marginBottom: '16px',
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  welcome: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  welcomeIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  welcomeTitle: {
    fontSize: '20px',
    color: '#f1f5f9',
    marginBottom: '8px',
  },
  welcomeText: {
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  features: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  feature: {
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    padding: '6px 14px',
    borderRadius: '16px',
    fontSize: '12px',
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  botAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#2563eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
  },
  message: {
    maxWidth: '70%',
    padding: '10px 16px',
    borderRadius: '16px',
    fontSize: '14px',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  typingIndicator: {
    backgroundColor: '#1e293b',
    padding: '12px 16px',
    borderRadius: '16px',
    display: 'flex',
    gap: '4px',
  },
  typingDot: {
    color: '#64748b',
    fontSize: '12px',
    animation: 'pulse 1.5s infinite',
  },
  inputArea: {
    display: 'flex',
    gap: '8px',
    padding: '16px 0',
    borderTop: '1px solid #1e293b',
    marginTop: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    color: '#f1f5f9',
    outline: 'none',
  },
  sendButton: {
    width: '44px',
    height: '44px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    padding: '12px 0',
    color: '#475569',
    fontSize: '11px',
  },
};

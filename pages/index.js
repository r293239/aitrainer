import { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

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
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || 'No response' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: 'Error: Could not reach AI' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2>🤖 Self-Improving Bot</h2>
      <div style={{ border: '1px solid #ddd', height: 400, overflowY: 'auto', padding: 12, marginBottom: 12, borderRadius: 8, background: '#fafafa' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 150 }}>Send a message to start chatting</div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'right' : 'left', color: m.role === 'user' ? '#2563eb' : '#059669' }}>
            <strong>{m.role === 'user' ? 'You' : 'Bot'}:</strong> {m.text}
          </div>
        ))}
        {loading && <div style={{ color: '#999' }}>Bot is thinking...</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '0.6rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: 6 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          autoFocus
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{ padding: '0.6rem 1.2rem', background: loading ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          Send
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.8rem', color: '#999' }}>
        This bot improves itself every 10 minutes 🔄
      </div>
    </div>
  );
}

import { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Error connecting to AI' }]);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui' }}>
      <h2>🤖 Self-Improving Bot</h2>
      <div style={{ border: '1px solid #ddd', height: 400, overflowY: 'auto', padding: 12, marginBottom: 12, borderRadius: 8, background: '#fafafa' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'right' : 'left', color: m.role === 'user' ? '#2563eb' : '#059669' }}>
            <strong>{m.role === 'user' ? 'You' : 'Bot'}:</strong> {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '0.6rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: 6 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          autoFocus
        />
        <button onClick={send} style={{ padding: '0.6rem 1.2rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Send
        </button>
      </div>
    </div>
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ reply: 'Please send a message' });
  }

  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful chatbot. Keep answers short and friendly.' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub Models error:', response.status, errorText);
      return res.status(200).json({ reply: 'The AI brain is temporarily unavailable. It might be improving itself! Try again soon.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'I received your message but had trouble forming a response.';

    res.status(200).json({ reply });
  } catch (error) {
    console.error('API error:', error.message);
    res.status(200).json({ reply: 'Something went wrong. The bot might be updating itself. Try again in a moment.' });
  }
}

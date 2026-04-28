// pages/api/chat.js
import { callModel } from "../../lib/model";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { message } = req.body;

  try {
    const reply = await callModel([
      { role: "system", content: "You are a helpful chatbot. Keep answers short." },
      { role: "user", content: message }
    ]);
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: "AI brain unavailable" });
  }
}

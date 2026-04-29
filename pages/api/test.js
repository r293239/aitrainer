export default function handler(req, res) {
  res.status(200).json({ 
    method: req.method,
    message: 'API is working',
    time: new Date().toISOString()
  });
}

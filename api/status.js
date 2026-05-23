// api/status.js — informa ao frontend se o servidor tem chave configurada

export default function handler(req, res) {
  res.status(200).json({ ready: !!process.env.OPENAI_API_KEY })
}

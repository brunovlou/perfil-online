// api/generate.js — Vercel serverless function
// Proxies OpenAI calls so the API key never reaches the client

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Servidor não configurado com chave da API.' })
  }

  const { prompt, maxTokens = 2048 } = req.body || {}
  if (!prompt) {
    return res.status(400).json({ error: 'Campo "prompt" obrigatório.' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return res.status(response.status).json({
        error: err?.error?.message || `Erro da OpenAI: HTTP ${response.status}`,
      })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    return res.status(200).json({ content })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

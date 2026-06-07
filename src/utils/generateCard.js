import { getApiKey, setCard, setGenerating, getFirebaseUrl, getDraftRejected, getSoloMode } from './gameStore'

const HISTORY_KEY           = 'perfil-card-history'
const CATEGORY_QUEUE_KEY    = 'perfil-category-queue'
const PESSOA_SUBTYPE_KEY    = 'perfil-pessoa-subtype-queue'

const THREE_SIXTY_DAYS = 360 * 24 * 60 * 60 * 1000

// Converte entrada antiga (string) para o novo formato com timestamp
function normalizeEntry(entry) {
  if (typeof entry === 'string') return { answer: entry, playedAt: Date.now() }
  return entry
}

// Remove entradas com mais de 360 dias
function filterHistory(raw) {
  const cutoff = Date.now() - THREE_SIXTY_DAYS
  return raw.map(normalizeEntry).filter(e => e.playedAt > cutoff)
}

// Frequências: PESSOA×4, COISA×3, LUGAR×2, ANO×1 por ciclo
const CATEGORY_POOL = [
  'PESSOA', 'PESSOA', 'PESSOA', 'PESSOA',
  'COISA', 'COISA', 'COISA',
  'LUGAR', 'LUGAR',
  'ANO',
]

// Sub-tipos de PESSOA — rodízio completo antes de repetir qualquer um
const PESSOA_SUBTYPES = [
  { tipo: 'Personagem de desenho animado',         ex: 'Homer Simpson, Mickey Mouse, He-Man, Scooby-Doo, Pica-Pau' },
  { tipo: 'Personagem de filme (não animado)',      ex: 'Darth Vader, James Bond, Indiana Jones, Hannibal Lecter' },
  { tipo: 'Personagem de série de TV',              ex: 'Walter White, Tony Soprano, Ross Geller, El Profesor' },
  { tipo: 'Personagem da Disney ou Pixar',          ex: 'Simba, Woody, Elsa, Moana, Cruella De Vil' },
  { tipo: 'Ator ou atriz',                          ex: 'Fernanda Montenegro, Tom Hanks, Marlon Brando, Angélica' },
  { tipo: 'Jogador de futebol',                     ex: 'Ronaldo Fenômeno, Zidane, Ronaldinho, Marta, Garrincha' },
  { tipo: 'Cantor ou banda',                        ex: 'Raul Seixas, Madonna, Michael Jackson, Legião Urbana' },
  { tipo: 'Personagem de novela brasileira',        ex: 'Sassá Mutema, Odete Roitman, Roque Santeiro, Pantanal' },
  { tipo: 'Atleta de outro esporte',                ex: 'Ayrton Senna, Gustavo Kuerten, Oscar Schmidt, Daiane dos Santos' },
  { tipo: 'Celebridade ou apresentador(a)',         ex: 'Silvio Santos, Xuxa, Oprah Winfrey, Fausto Silva' },
  { tipo: 'Figura histórica mundial',               ex: 'Napoleão Bonaparte, Cleópatra, Winston Churchill, Che Guevara' },
  { tipo: 'Figura histórica brasileira (política)', ex: 'Getúlio Vargas, Tiradentes, Dom Pedro II, Juscelino Kubitschek' },
]

// ── História persistente ────────────────────────────────────────────────────
// Lê localStorage + Firebase, mescla, filtra >360 dias e retorna array de strings
async function getHistory() {
  let local = []
  try {
    local = filterHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))
  } catch {}

  const fbUrl = getFirebaseUrl()
  if (!fbUrl) return local.map(e => e.answer)

  try {
    const res = await fetch(`${fbUrl}/perfil-history.json`)
    if (!res.ok) return local.map(e => e.answer)
    const remote = await res.json()
    if (Array.isArray(remote) && remote.length > 0) {
      const remoteFiltered = filterHistory(remote)
      // Merge: mantém a entrada mais recente para cada resposta
      const map = new Map(local.map(e => [e.answer.toLowerCase(), e]))
      remoteFiltered.forEach(e => {
        const key = e.answer.toLowerCase()
        if (!map.has(key) || map.get(key).playedAt < e.playedAt) map.set(key, e)
      })
      const merged = [...map.values()]
      localStorage.setItem(HISTORY_KEY, JSON.stringify(merged))
      return merged.map(e => e.answer)
    }
  } catch (e) {
    console.warn('Firebase: erro ao ler histórico', e.message)
  }
  return local.map(e => e.answer)
}

// Salva no localStorage E no Firebase com timestamp de hoje
async function addToHistory(answer) {
  let local = []
  try {
    local = filterHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))
  } catch {}

  const key   = answer.toLowerCase()
  const entry = { answer, playedAt: Date.now() }
  const idx   = local.findIndex(e => e.answer.toLowerCase() === key)
  if (idx >= 0) local[idx] = entry
  else          local.push(entry)

  localStorage.setItem(HISTORY_KEY, JSON.stringify(local))

  const fbUrl = getFirebaseUrl()
  if (!fbUrl) return

  try {
    await fetch(`${fbUrl}/perfil-history.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local),
    })
    console.log(`✅ Histórico salvo no Firebase (${local.length} cartas ativas)`)
  } catch (e) {
    console.warn('Firebase: erro ao salvar histórico', e.message)
  }
}

// Rotação de categorias com pesos
function getNextCategory() {
  try {
    let queue = JSON.parse(localStorage.getItem(CATEGORY_QUEUE_KEY) || '[]')
    if (queue.length === 0) queue = [...CATEGORY_POOL].sort(() => Math.random() - 0.5)
    const category = queue.shift()
    localStorage.setItem(CATEGORY_QUEUE_KEY, JSON.stringify(queue))
    return category
  } catch { return 'PESSOA' }
}

// Rodízio de sub-tipos de PESSOA — passa por todos antes de repetir
function getNextPessoaSubtype() {
  try {
    let queue = JSON.parse(localStorage.getItem(PESSOA_SUBTYPE_KEY) || '[]')
    if (queue.length === 0) {
      queue = [...PESSOA_SUBTYPES]
        .sort(() => Math.random() - 0.5)
        .map(s => s.tipo)
    }
    const subtype = queue.shift()
    localStorage.setItem(PESSOA_SUBTYPE_KEY, JSON.stringify(queue))
    // Devolve o objeto completo para ter os exemplos
    return PESSOA_SUBTYPES.find(s => s.tipo === subtype) || PESSOA_SUBTYPES[0]
  } catch { return PESSOA_SUBTYPES[0] }
}

function buildPrompt(category, pessoaSubtype = null, history = []) {
  const pessoaHint = pessoaSubtype
    ? `exatamente um(a) **${pessoaSubtype.tipo}**.
  Exemplos do tipo: ${pessoaSubtype.ex}.
  ⚠️ OBRIGATÓRIO: escolha exclusivamente um(a) ${pessoaSubtype.tipo}. NÃO escolha escritores, poetas, literatos ou qualquer figura do universo literário — mesmo que sejam famosos. O tipo desta rodada é fixo.`
    : 'uma pessoa ou personagem famoso'

  const hints = {
    PESSOA: pessoaHint,
    COISA:  'uma coisa (objeto, invenção, alimento, animal, conceito, fenômeno, estilo musical, obra de arte)',
    LUGAR:  'um lugar (cidade, país, monumento, acidente geográfico, ponto turístico, bairro famoso)',
    ANO:    'um ano histórico importante (a resposta é o ano em si, ex: "1969")',
  }

  const historyBlock = history.length > 0
    ? `\n⛔ RESPOSTAS PROIBIDAS — estas respostas já foram usadas e JAMAIS podem ser repetidas, independente da categoria:\n${history.map(h => `- ${h}`).join('\n')}\nSe sua resposta estiver nessa lista, descarte-a e escolha outra.\n`
    : ''

  const voiceRule = category === 'ANO'
    ? `REGRA DE VOZ NARRATIVA — ANO:
- Escreva todas as dicas em TERCEIRA PESSOA, descrevendo eventos que aconteceram naquele ano.
- CORRETO: "Neil Armstrong pisou na Lua.", "Pelé marcou seu milésimo gol.", "A cédula de 2 reais foi lançada."
- ERRADO: "Neil Armstrong pisou em mim.", "Fui o ano em que Pelé..."
`
    : `REGRA DE VOZ NARRATIVA — ${category} (MUITO IMPORTANTE):
- Escreva TODAS as 20 dicas em PRIMEIRA PESSOA. O perfil fala de si mesmo.
- CORRETO (PESSOA): "Nasci em Liverpool em 1940.", "Fui criado por Walt Disney.", "Minha nave se chama Nabucodonosor."
- CORRETO (LUGAR): "Estou localizada no litoral norte de São Paulo.", "Sou banhada pelo Oceano Atlântico.", "Tenho cerca de 33 mil habitantes."
- CORRETO (COISA): "Sou deixada pelo 'cujus'.", "Posso ser boa ou ruim.", "Fui inventada no século XIX."
- ERRADO: "Foi criado por...", "Está localizada em...", "É deixada pelo..."
- Use verbos como: sou, fui, estou, fiquei, nasci, moro, tenho, possuo, posso, minha, meu, me, mim.
`

  const anoRule = category === 'ANO' ? `
REGRA ESPECIAL PARA ANO — DIVERSIDADE OBRIGATÓRIA:
- Inclua pelo menos 8 eventos COMPLETAMENTE DIFERENTES e sem relação entre si.
- Cubra áreas distintas: política internacional, política brasileira, esporte, cinema/música/cultura, ciência/tecnologia, nascimentos famosos, mortes marcantes, catástrofes, curiosidades.
- PROIBIDO ter mais de 2 dicas sobre o mesmo evento ou a mesma pessoa.
- Inclua pelo menos 1 referência especificamente brasileira.
- Inclua pelo menos 1 dica criativa/meta (ex: algarismo romano, distância temporal de outro evento famoso, numerologia, efemérides).
- A resposta é um número de 4 dígitos (ex: "1963"). Esse número NUNCA deve aparecer em nenhuma das 20 dicas.
- Use referências relativas: "Cinco anos antes, ocorreu tal evento.", "Neste ano, faltavam X anos para o homem pisar na Lua."
` : ''

  return `Você é o gerador de cartas do jogo de tabuleiro Perfil, versão brasileira.

Gere uma carta sobre ${hints[category]}.
${historyBlock}
NÍVEL DE DIFICULDADE: médio a difícil.
- Escolha perfis de conhecimento geral brasileiro, mas que não sejam os primeiros que vêm à cabeça.
- Evite os mais óbvios (ex: Pelé, Brasil, Amazônia, Jesus, Neymar, São Paulo).
- Prefira perfis que uma pessoa culta e bem informada conheceria, mas que exijam raciocínio.

ORDEM DAS DICAS — DO MAIS DIFÍCIL PARA O MAIS FÁCIL (OBRIGATÓRIO):
- Dica 1 = a mais difícil e obscura do card. Detalhes que só especialistas saberiam.
- Dicas 1–8: fatos que POUCAS pessoas conhecem — números, curiosidades técnicas, detalhes históricos obscuros. Quem não sabe a resposta NÃO deve conseguir deduzi-la pelas primeiras dicas.
- Dicas 9–15: dificuldade média — fatos conhecidos por quem tem interesse no assunto.
- Dicas 16–20: mais fáceis — características marcantes que a maioria reconhece. A dica 20 pode ser quase óbvia.
⚠️ NÃO comece com as características mais famosas. Guarde os fatos mais conhecidos para as dicas 15–20.

${voiceRule}
REGRA CRÍTICA — CITE NOMES REAIS NAS DICAS:
- SEMPRE cite nomes reais de pessoas, lugares, filmes, músicas, eventos, empresas — qualquer coisa que apareça na dica.
- PROIBIDO usar descrições vagas como "um famoso cantor", "uma grande empresa", "um país europeu".
- Use o nome específico: "Freddie Mercury", "A General Motors", "A França", "Ayrton Senna".
- A única exceção é a própria resposta: o nome da carta JAMAIS pode ser citado.
- CORRETO: "A Toyota lançou o Corolla no mesmo ano." | ERRADO: "Uma famosa montadora lançou um modelo icônico."

REGRA CRÍTICA — DICAS DIVERSAS E VARIADAS:
- As 20 dicas devem cobrir ângulos completamente diferentes: geográfico, biográfico, cultural, científico, esportivo, econômico, político, artístico, curioso/trivia, comparativo, cronológico, impacto social.
- PROIBIDO ter dicas parecidas ou que repitam o mesmo tipo de informação.
- PROIBIDO começar muitas dicas com a mesma estrutura (ex: não repita "Na [contexto]," em mais de 3 dicas).
- Misture formatos: afirmações diretas, curiosidades, comparações, contexto histórico, fatos numéricos, referências culturais, detalhes casuais do cotidiano.
- Inclua pelo menos 1–2 dicas com tom mais casual e direto (não enciclopédico), como faria um brasileiro descrevendo o lugar ou a pessoa de forma natural.

REGRA CRÍTICA — ESPECIFICIDADE COM NÚMEROS:
- Use dados concretos sempre que possível: distâncias em km, áreas em km², datas exatas, valores monetários, anos, quantidades.
- CORRETO: "Estou a 135 km de São Paulo.", "Tenho 347 km² de área.", "Fui fundada em 1494."
- ERRADO: "Fico próxima a São Paulo.", "Tenho grande extensão territorial.", "Fui fundada há séculos."
${anoRule}
REGRA CRÍTICA — DICAS INDEPENDENTES:
- Cada dica deve fazer sentido SOZINHA, sem depender de nenhuma outra dica.
- PROIBIDO usar "esta", "esse", "o mesmo", "ela também", "além disso" referenciando algo dito antes.

REGRA MAIS IMPORTANTE — NUNCA REVELAR A RESPOSTA:
- O texto da resposta JAMAIS pode aparecer em qualquer dica, nem parcialmente, nem em plural, nem em outro gênero.
  → Se a resposta for "jardim suspenso": nunca escreva "jardim", "jardins", "suspenso", "suspensos" em nenhuma dica.
  → Se a resposta for "1963": nunca escreva "1963" em nenhuma das 20 dicas.
  → Se a resposta for "Ayrton Senna": nunca escreva "Senna", "Ayrton" ou "Ayrton Senna".
  → Se a resposta for "Cristo Redentor": nunca escreva "Cristo", "Redentor" ou "Cristo Redentor".
- Isso inclui PLURAIS e variações de gênero.
- Use sempre pronomes ou referências indiretas: "ele", "ela", "o monumento", "o local", "o músico", "o evento", "essa estrutura", "essa obra", etc.

Retorne APENAS um objeto JSON válido, sem texto adicional, sem markdown, sem \`\`\`:
{
  "category": "${category}",
  "answer": "nome exato do perfil",
  "clues": ["dica 1", "dica 2", ..., "dica 20"]
}

Exatamente 20 dicas em português brasileiro. Frases curtas e diretas (uma linha cada).`
}

// Prompt para corrigir uma dica específica sem mexer na carta toda
function buildFixPrompt(answer, category, clueIndex, badClue) {
  return `Você é o revisor de cartas do jogo Perfil.

A carta é da categoria "${category}" e a RESPOSTA é: "${answer}".

A dica ${clueIndex} está ERRADA porque menciona a resposta ou parte dela:
"${badClue}"

Reescreva APENAS essa dica para que ela:
1. NÃO mencione "${answer}" nem nenhuma palavra que faça parte do nome (${answer.split(/\s+/).filter(w => w.length > 3).join(', ')}).
2. Continue sendo uma dica válida e útil sobre "${answer}".
3. Cite nomes reais (pessoas, lugares, eventos) — sem descrições vagas.
4. Seja independente (não dependa de outras dicas para fazer sentido).
5. Mantenha o mesmo nível de dificuldade da dica original.

Retorne APENAS um objeto JSON:
{"clue": "texto da dica corrigida"}`
}

// Substitui uma dica aleatória por "Perca sua vez." (nunca a 1ª nem a última)
function insertPerdaSuaVez(clues) {
  const total = clues.length
  // Faixa: entre 15% e 80% do total (ex: nas 20 dicas → índices 3–16; nas 12 → índices 1–9)
  const min = Math.max(1, Math.floor(total * 0.15))
  const max = Math.min(total - 2, Math.floor(total * 0.80))
  const idx = min + Math.floor(Math.random() * (max - min + 1))
  const result = [...clues]
  result[idx] = 'Perca sua vez.'
  return result
}

// Termos proibidos derivados da resposta — inclui radicais para pegar plurais e variações
function forbiddenTerms(answer) {
  const terms = new Set()

  const addWord = (word) => {
    const w = word.toLowerCase().trim()
    if (!w) return
    terms.add(w)
    // Radical: pega os primeiros ~80% das letras (mín. 5) para capturar plurais,
    // gêneros e flexões. Ex: "jardim" → "jardi" captura "jardins".
    if (w.length >= 6) {
      terms.add(w.slice(0, Math.max(5, Math.floor(w.length * 0.8))))
    }
  }

  addWord(answer)
  answer.split(/\s+/).forEach(word => {
    if (word.length > 3) addWord(word)
  })

  return [...terms]
}

// Retorna o índice (1-based) da primeira dica que menciona a resposta, ou null
function findLeakyClue(clues, answer) {
  const forbidden = forbiddenTerms(answer)
  for (let i = 0; i < clues.length; i++) {
    const lower = clues[i].toLowerCase()
    if (forbidden.some(term => lower.includes(term))) return i + 1
  }
  return null
}

// Retorna todos os índices (1-based) de dicas que mencionam a resposta
function findAllLeakyClues(clues, answer) {
  const forbidden = forbiddenTerms(answer)
  return clues
    .map((clue, i) => ({ i: i + 1, clue, lower: clue.toLowerCase() }))
    .filter(({ lower }) => forbidden.some(term => lower.includes(term)))
    .map(({ i }) => i)
}

async function callOpenAI(prompt, maxTokens = 2048) {
  const apiKey = getApiKey()

  // Sem chave local → usa o proxy serverless do Vercel (chave fica no servidor)
  if (!apiKey) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `Erro HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.content
  }

  // Com chave local → chama a OpenAI diretamente (usuário usa a própria chave)
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erro HTTP ${response.status}`)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content || ''
}

// Gera a carta completa
async function fetchCard(category, pessoaSubtype, history) {
  const text = await callOpenAI(buildPrompt(category, pessoaSubtype, history))
  const parsed = JSON.parse(text)

  if (!parsed.category || !parsed.answer || !Array.isArray(parsed.clues)) {
    throw new Error('Resposta da IA em formato inesperado.')
  }

  while (parsed.clues.length < 20) parsed.clues.push('...')
  parsed.clues = parsed.clues.slice(0, 20)

  return parsed
}

// Corrige uma única dica problemática, mantendo o restante da carta intacto
async function fixSingleClue(answer, category, clueIndex, badClue) {
  const MAX_FIX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    try {
      const text = await callOpenAI(
        buildFixPrompt(answer, category, clueIndex, badClue),
        256
      )
      const parsed = JSON.parse(text)
      if (!parsed.clue || typeof parsed.clue !== 'string') continue

      // Verifica se a correção ainda vaza a resposta
      const forbidden = forbiddenTerms(answer)
      if (forbidden.some(term => parsed.clue.toLowerCase().includes(term))) {
        console.warn(`Dica ${clueIndex} ainda vaza após correção (tentativa ${attempt}).`)
        continue
      }

      console.log(`✅ Dica ${clueIndex} corrigida: "${parsed.clue}"`)
      return parsed.clue
    } catch (err) {
      console.warn(`Erro ao corrigir dica ${clueIndex}:`, err.message)
    }
  }
  // Se não conseguiu corrigir, retorna uma dica genérica segura
  return `Esta é uma característica importante de ${category === 'ANO' ? 'este ano' : 'este perfil'}.`
}

// ── Modo Draft ─────────────────────────────────────────────────────────────

// Prompt rápido: pede apenas 4 nomes, sem gerar dicas
function buildOptionsPrompt(category, pessoaSubtype, history, rejected) {
  const hints = {
    PESSOA: pessoaSubtype
      ? `exclusivamente um(a) **${pessoaSubtype.tipo}**. Exemplos: ${pessoaSubtype.ex}. ⚠️ NÃO escolha escritores, poetas ou literatos.`
      : 'uma pessoa ou personagem famoso',
    COISA:  'uma coisa (objeto, invenção, alimento, animal, conceito, fenômeno, estilo musical, obra de arte)',
    LUGAR:  'um lugar (cidade, país, monumento, acidente geográfico, ponto turístico, bairro famoso)',
    ANO:    'um ano histórico importante (a resposta é o ano em si, ex: "1969")',
  }

  const historyBlock = history.length > 0
    ? `\n⛔ PROIBIDO — já foram usadas, não podem aparecer:\n${history.map(h => `- ${h}`).join('\n')}\n`
    : ''

  const rejectedBlock = rejected.length > 0
    ? `\n⛔ PROIBIDO TAMBÉM — rejeitadas recentemente (bloqueadas por 60 dias):\n${rejected.map(r => `- ${r.answer}`).join('\n')}\n`
    : ''

  return `Você é o gerador de cartas do jogo de tabuleiro Perfil, versão brasileira.

Gere 4 opções de tema para a categoria ${category} — ${hints[category]}.
${historyBlock}${rejectedBlock}
Regras:
- Todos os 4 temas devem ser da categoria ${category}${pessoaSubtype ? ` e do tipo ${pessoaSubtype.tipo}` : ''}.
- Nível médio a difícil — evite os mais óbvios (Pelé, Brasil, Amazônia, Jesus, Neymar).
- Os 4 temas devem ser variados (épocas, origens e áreas distintas).
- Retorne APENAS um objeto JSON válido, sem markdown:
{"options": ["tema 1", "tema 2", "tema 3", "tema 4"]}`
}

// Prompt completo mas com resposta já definida — gera as 20 dicas para um tema escolhido
function buildCluesOnlyPrompt(category, answer, pessoaSubtype) {
  const catLabel = { PESSOA: 'Pessoa', COISA: 'Coisa', LUGAR: 'Lugar', ANO: 'Ano' }[category] || category
  const subLabel = category === 'PESSOA' && pessoaSubtype ? ` (${pessoaSubtype.tipo})` : ''
  const wordsForbidden = answer.split(/\s+/).filter(w => w.length > 3).map(w => `"${w}"`).join(', ')

  const voiceRule = category === 'ANO'
    ? `REGRA DE VOZ NARRATIVA — ANO:
- Escreva todas as dicas em TERCEIRA PESSOA, descrevendo eventos que aconteceram naquele ano.
- CORRETO: "Neil Armstrong pisou na Lua.", "A cédula de 2 reais foi lançada no Brasil."
- ERRADO: "Neil Armstrong pisou em mim.", "Fui o ano em que..."
`
    : `REGRA DE VOZ NARRATIVA — ${category} (MUITO IMPORTANTE):
- Escreva TODAS as 20 dicas em PRIMEIRA PESSOA. O perfil fala de si mesmo.
- CORRETO (PESSOA): "Nasci em Liverpool em 1940.", "Fui criado por Walt Disney.", "Minha nave se chama Nabucodonosor."
- CORRETO (LUGAR): "Estou localizada no litoral norte de São Paulo.", "Sou banhada pelo Oceano Atlântico.", "Tenho cerca de 33 mil habitantes."
- CORRETO (COISA): "Sou deixada pelo 'cujus'.", "Posso ser boa ou ruim.", "Fui inventada no século XIX."
- ERRADO: "Foi criado por...", "Está localizada em...", "É deixada pelo..."
- Use verbos como: sou, fui, estou, fiquei, nasci, moro, tenho, possuo, posso, minha, meu, me, mim.
`

  const anoRule = category === 'ANO' ? `
REGRA ESPECIAL PARA ANO — DIVERSIDADE OBRIGATÓRIA:
- Inclua pelo menos 8 eventos COMPLETAMENTE DIFERENTES e sem relação entre si.
- Cubra áreas distintas: política internacional, política brasileira, esporte, cinema/música/cultura, ciência/tecnologia, nascimentos famosos, mortes marcantes, catástrofes, curiosidades.
- PROIBIDO ter mais de 2 dicas sobre o mesmo evento ou a mesma pessoa.
- Inclua pelo menos 1 referência especificamente brasileira.
- Inclua pelo menos 1 dica criativa/meta (ex: algarismo romano, distância temporal de outro evento famoso, numerologia).
- O número "${answer}" NUNCA deve aparecer em nenhuma das 20 dicas.
` : ''

  return `Você é o gerador de cartas do jogo de tabuleiro Perfil, versão brasileira.

Gere as 20 dicas para a seguinte carta:
- Categoria: ${catLabel}${subLabel}
- RESPOSTA OBRIGATÓRIA: "${answer}" — use exatamente este tema, não escolha outro.

NÍVEL DE DIFICULDADE: médio a difícil.
ORDEM DAS DICAS — DO MAIS DIFÍCIL PARA O MAIS FÁCIL (OBRIGATÓRIO):
- Dica 1 = a mais difícil e obscura do card. Detalhes que só especialistas saberiam.
- Dicas 1–8: fatos que POUCAS pessoas conhecem — números, curiosidades técnicas, detalhes históricos obscuros.
- Dicas 9–15: dificuldade média — fatos conhecidos por quem tem interesse no assunto.
- Dicas 16–20: mais fáceis — características marcantes que a maioria reconhece. A dica 20 pode ser quase óbvia.
⚠️ NÃO comece com as características mais famosas. Guarde os fatos mais conhecidos para as dicas 15–20.

${voiceRule}
REGRA CRÍTICA — CITE NOMES REAIS NAS DICAS:
- SEMPRE cite nomes reais de pessoas, lugares, filmes, músicas, eventos, empresas.
- PROIBIDO usar descrições vagas como "um famoso cantor", "uma grande empresa", "um país europeu".
- A única exceção é a própria resposta: "${answer}" JAMAIS pode ser citado.
${wordsForbidden ? `  → Palavras proibidas e suas variações: ${wordsForbidden}.\n` : ''}
REGRA CRÍTICA — DICAS DIVERSAS E VARIADAS:
- As 20 dicas devem cobrir ângulos completamente diferentes: geográfico, biográfico, cultural, científico, esportivo, econômico, político, artístico, curioso/trivia, comparativo, cronológico, impacto social.
- PROIBIDO ter dicas parecidas ou que repitam o mesmo tipo de informação.
- PROIBIDO começar muitas dicas com a mesma estrutura (ex: não repita "Na [contexto]," em mais de 3 dicas).
- Inclua pelo menos 1–2 dicas com tom mais casual e direto (não enciclopédico).

REGRA CRÍTICA — ESPECIFICIDADE COM NÚMEROS:
- Use dados concretos sempre que possível: distâncias em km, áreas em km², datas exatas, valores monetários, anos, quantidades.
- CORRETO: "Estou a 135 km de São Paulo." | ERRADO: "Fico próxima a São Paulo."
${anoRule}
REGRA CRÍTICA — DICAS INDEPENDENTES:
- Cada dica deve fazer sentido SOZINHA, sem depender de outras.
- PROIBIDO usar "esta", "esse", "o mesmo", "ela também", "além disso" referenciando algo dito antes.

REGRA MAIS IMPORTANTE — NUNCA REVELAR A RESPOSTA:
- "${answer}" JAMAIS pode aparecer em qualquer dica, nem parcialmente, nem em plural, nem em outro gênero.
- Use sempre pronomes ou referências indiretas: "ele", "ela", "o local", "o músico", "o evento", "essa obra", etc.

Retorne APENAS um objeto JSON válido, sem texto adicional, sem markdown, sem \`\`\`:
{
  "category": "${category}",
  "answer": "${answer}",
  "clues": ["dica 1", "dica 2", ..., "dica 20"]
}

Exatamente 20 dicas em português brasileiro. Frases curtas e diretas (uma linha cada).`
}

// Gera as 4 opções de tema para o leitor escolher (etapa 1 do Draft)
export async function generateDraftOptions() {
  const category      = getNextCategory()
  const pessoaSubtype = category === 'PESSOA' ? getNextPessoaSubtype() : null
  const history       = await getHistory()
  const rejected      = getDraftRejected()

  const text   = await callOpenAI(buildOptionsPrompt(category, pessoaSubtype, history, rejected), 256)
  const parsed = JSON.parse(text)

  if (!Array.isArray(parsed.options) || parsed.options.length < 2) {
    throw new Error('Resposta da IA em formato inesperado.')
  }

  return { category, pessoaSubtype, options: parsed.options.slice(0, 4) }
}

// Gera a carta completa para o tema já escolhido pelo leitor (etapa 2 do Draft)
export async function generateCardFromAnswer(answer, category, pessoaSubtype) {
  setGenerating(true)

  const MAX_CARD_ATTEMPTS = 2
  let lastError = null

  for (let attempt = 1; attempt <= MAX_CARD_ATTEMPTS; attempt++) {
    try {
      const text   = await callOpenAI(buildCluesOnlyPrompt(category, answer, pessoaSubtype))
      const parsed = JSON.parse(text)

      if (!Array.isArray(parsed.clues)) throw new Error('Resposta da IA em formato inesperado.')

      while (parsed.clues.length < 20) parsed.clues.push('...')
      parsed.clues    = parsed.clues.slice(0, 20)
      parsed.category = category
      parsed.answer   = answer

      // Corrigir dicas que vazam a resposta
      const leakyIndices = findAllLeakyClues(parsed.clues, answer)
      if (leakyIndices.length > 0) {
        console.warn(`⚠️ Dicas problemáticas: ${leakyIndices.join(', ')}. Corrigindo…`)
        for (const idx of leakyIndices) {
          parsed.clues[idx - 1] = await fixSingleClue(
            answer, category, idx, parsed.clues[idx - 1]
          )
        }
        const stillLeaky = findLeakyClue(parsed.clues, answer)
        if (stillLeaky) {
          console.warn(`⚠️ Dica ${stillLeaky} ainda problemática. Tentando nova carta…`)
          lastError = new Error(`Dica ${stillLeaky} ainda vaza a resposta.`)
          continue
        }
      }

      addToHistory(answer)
      setCard({
        category,
        answer,
        clues: insertPerdaSuaVez(parsed.clues),
        revealed: [],
        answerRevealed: false,
      })
      return

    } catch (err) {
      lastError = err
      if (attempt === MAX_CARD_ATTEMPTS) break
    }
  }

  setGenerating(false)
  throw lastError ?? new Error('Não foi possível gerar uma carta válida. Tente novamente.')
}

// ── Modo Solo ──────────────────────────────────────────────────────────────

// Normaliza string para comparação: minúsculas, sem acento, sem pontuação
function normalizeStr(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Valida resposta: fuzzy match primeiro, depois validação semântica via IA
export async function validateAnswer(guess, correctAnswer) {
  const ng = normalizeStr(guess)
  const na = normalizeStr(correctAnswer)

  if (!ng) return false

  // Anos exigem correspondência EXATA — sem fuzzy, sem IA
  if (/^\d{4}$/.test(na)) return ng === na

  // Correspondência exata normalizada
  if (ng === na) return true

  // Containment: "senna" aceita para "ayrton senna"
  if (na.includes(ng) || ng.includes(na)) return true

  // Levenshtein: tolerância de 25% do menor comprimento, máx 3
  const dist = levenshtein(ng, na)
  const tol  = Math.max(1, Math.floor(Math.min(ng.length, na.length) * 0.25))
  if (dist <= Math.min(tol, 3)) return true

  // Validação semântica via IA (fallback)
  try {
    const prompt = `Você é árbitro do jogo Perfil. A resposta correta é: "${correctAnswer}".
O jogador digitou: "${guess}".

A resposta do jogador é essencialmente a mesma coisa que a resposta correta?
Considere como CORRETO:
- Apelidos reconhecidos (ex: "Senna" para "Ayrton Senna", "Lula" para "Luiz Inácio Lula da Silva")
- Erros de digitação leves (ex: "Micheal" para "Michael")
- Variações de acentuação (ex: "Pelé" e "Pele")
- Tradução direta amplamente usada

Considere como ERRADO:
- Respostas completamente diferentes
- Confusão entre pessoas/lugares/coisas distintos

Retorne APENAS: {"correct": true} ou {"correct": false}`
    const text = await callOpenAI(prompt, 100)
    const parsed = JSON.parse(text)
    return !!parsed.correct
  } catch {
    return false
  }
}

function buildSoloPrompt(category, pessoaSubtype = null, history = []) {
  const pessoaHint = pessoaSubtype
    ? `exatamente um(a) **${pessoaSubtype.tipo}**.
  Exemplos do tipo: ${pessoaSubtype.ex}.
  ⚠️ OBRIGATÓRIO: escolha exclusivamente um(a) ${pessoaSubtype.tipo}.`
    : 'uma pessoa ou personagem famoso'

  const hints = {
    PESSOA: pessoaHint,
    COISA:  'uma coisa (objeto, invenção, alimento, animal, conceito, fenômeno, estilo musical, obra de arte)',
    LUGAR:  'um lugar (cidade, país, monumento, acidente geográfico, ponto turístico, bairro famoso)',
    ANO:    'um ano histórico importante (a resposta é o ano em si, ex: "1969")',
  }

  const historyBlock = history.length > 0
    ? `\n⛔ RESPOSTAS PROIBIDAS — já foram usadas, não podem se repetir:\n${history.map(h => `- ${h}`).join('\n')}\n`
    : ''

  const voiceRule = category === 'ANO'
    ? `REGRA DE VOZ NARRATIVA — ANO:
- Escreva todas as dicas em TERCEIRA PESSOA, descrevendo eventos que aconteceram naquele ano.
- CORRETO: "Neil Armstrong pisou na Lua.", "A cédula de 2 reais foi lançada no Brasil."
- ERRADO: "Neil Armstrong pisou em mim.", "Fui o ano em que..."
`
    : `REGRA DE VOZ NARRATIVA — ${category} (MUITO IMPORTANTE):
- Escreva TODAS as 12 dicas em PRIMEIRA PESSOA. O perfil fala de si mesmo.
- CORRETO (PESSOA): "Nasci em Liverpool em 1940.", "Fui criado por Walt Disney.", "Minha companheira chama Trinity."
- CORRETO (LUGAR): "Estou localizada no litoral norte de São Paulo.", "Sou banhada pelo Oceano Atlântico."
- CORRETO (COISA): "Sou deixada pelo 'cujus'.", "Posso ser boa ou ruim.", "Fui inventada no século XIX."
- ERRADO: "Foi criado por...", "Está localizada em...", "É conhecida por..."
- Use verbos como: sou, fui, estou, fiquei, nasci, moro, tenho, possuo, posso, minha, meu, me, mim.
`

  const anoRule = category === 'ANO' ? `
REGRA ESPECIAL PARA ANO — DIVERSIDADE OBRIGATÓRIA:
- Inclua pelo menos 6 eventos COMPLETAMENTE DIFERENTES e sem relação entre si.
- Cubra áreas distintas: política, esporte, cinema/música, ciência, nascimentos, mortes, curiosidades.
- PROIBIDO ter mais de 2 dicas sobre o mesmo evento ou a mesma pessoa.
- Inclua pelo menos 1 referência especificamente brasileira.
- Inclua pelo menos 1 dica criativa/meta (algarismo romano, distância temporal, efeméride).
` : ''

  return `Você é o gerador de cartas do jogo de tabuleiro Perfil, versão brasileira — MODO SOLO.

Gere uma carta sobre ${hints[category]}.
${historyBlock}
NÍVEL DE DIFICULDADE: médio.
- Escolha perfis que qualquer adulto brasileiro bem informado conheceria — não muito óbvios, não muito obscuros.
- Evite os extremos: nem "Pelé, Brasil, Jesus" (óbvios demais) nem figuras completamente desconhecidas.
- O ideal é que um jogador atento consiga acertar entre as dicas 5–9.

ORDEM DAS DICAS — DO MAIS DIFÍCIL PARA O MAIS FÁCIL (OBRIGATÓRIO):
- Dica 1 = a mais difícil. Detalhe obscuro ou numérico que poucos sabem.
- Dicas 1–4: moderadamente difíceis — curiosidades, números, detalhes menos conhecidos.
- Dicas 5–8: médias — fatos que quem tem interesse no assunto reconhece.
- Dicas 9–12: mais fáceis — características marcantes que a maioria dos brasileiros reconhece.

${voiceRule}
REGRA CRÍTICA — CITE NOMES REAIS NAS DICAS:
- SEMPRE cite nomes reais de pessoas, lugares, filmes, músicas, eventos, empresas.
- PROIBIDO usar descrições vagas como "um famoso cantor", "uma grande empresa", "um país europeu".
- A única exceção é a própria resposta: o nome da carta JAMAIS pode ser citado.

REGRA CRÍTICA — ESPECIFICIDADE COM NÚMEROS:
- Use dados concretos: distâncias em km, datas exatas, áreas, valores, quantidades.
- CORRETO: "Estou a 135 km de São Paulo." | ERRADO: "Fico próxima a São Paulo."
${anoRule}
REGRA CRÍTICA — DICAS INDEPENDENTES:
- Cada dica deve fazer sentido SOZINHA, sem depender de outras.
- PROIBIDO usar "esta", "esse", "o mesmo", "ela também", "além disso" referenciando dicas anteriores.

REGRA MAIS IMPORTANTE — NUNCA REVELAR A RESPOSTA:
- O texto da resposta JAMAIS pode aparecer em qualquer dica, nem parcialmente, nem em plural, nem em outro gênero.
- Use pronomes ou referências indiretas: "ele", "ela", "o local", "o músico", "o evento", etc.

Retorne APENAS um objeto JSON válido, sem texto adicional, sem markdown, sem \`\`\`:
{
  "category": "${category}",
  "answer": "nome exato do perfil",
  "clues": ["dica 1", "dica 2", ..., "dica 12"]
}

Exatamente 12 dicas em português brasileiro. Frases curtas e diretas (uma linha cada).`
}

export async function generateSoloCard() {
  setGenerating(true)

  const category      = getNextCategory()
  const pessoaSubtype = category === 'PESSOA' ? getNextPessoaSubtype() : null
  const history       = await getHistory()

  const MAX_ATTEMPTS = 2
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text   = await callOpenAI(buildSoloPrompt(category, pessoaSubtype, history))
      const parsed = JSON.parse(text)

      if (!parsed.answer || !Array.isArray(parsed.clues)) {
        throw new Error('Resposta da IA em formato inesperado.')
      }

      if (history.some(h => h.toLowerCase() === parsed.answer.toLowerCase())) {
        lastError = new Error(`Resposta repetida: ${parsed.answer}`)
        continue
      }

      while (parsed.clues.length < 12) parsed.clues.push('...')
      parsed.clues    = parsed.clues.slice(0, 12)
      parsed.category = category

      // Corrigir dicas que vazam a resposta
      const leakyIndices = findAllLeakyClues(parsed.clues, parsed.answer)
      if (leakyIndices.length > 0) {
        console.warn(`⚠️ [Solo] Dicas problemáticas: ${leakyIndices.join(', ')}. Corrigindo…`)
        for (const idx of leakyIndices) {
          parsed.clues[idx - 1] = await fixSingleClue(
            parsed.answer, category, idx, parsed.clues[idx - 1]
          )
        }
        const stillLeaky = findLeakyClue(parsed.clues, parsed.answer)
        if (stillLeaky) {
          lastError = new Error(`Dica ${stillLeaky} ainda vaza a resposta.`)
          continue
        }
      }

      addToHistory(parsed.answer)
      setCard({
        category,
        answer:         parsed.answer,
        clues:          insertPerdaSuaVez(parsed.clues),
        revealed:       [],
        answerRevealed: false,
      })
      return

    } catch (err) {
      lastError = err
      if (attempt === MAX_ATTEMPTS) break
    }
  }

  setGenerating(false)
  throw lastError ?? new Error('Não foi possível gerar uma carta válida. Tente novamente.')
}

export async function generateCard() {
  setGenerating(true)

  const category      = getNextCategory()
  const pessoaSubtype = category === 'PESSOA' ? getNextPessoaSubtype() : null
  const history       = await getHistory()

  const MAX_CARD_ATTEMPTS = 2
  let lastError = null

  for (let attempt = 1; attempt <= MAX_CARD_ATTEMPTS; attempt++) {
    try {
      const parsed = await fetchCard(category, pessoaSubtype, history)

      // 2. Verificar repetição no cliente (segunda camada de proteção)
      if (history.some(h => h.toLowerCase() === parsed.answer.toLowerCase())) {
        console.warn(`⚠️ IA gerou resposta repetida: "${parsed.answer}". Tentando novamente…`)
        lastError = new Error(`Resposta repetida: ${parsed.answer}`)
        continue
      }

      // 3. Double check: encontrar TODAS as dicas que vazam a resposta
      const leakyIndices = findAllLeakyClues(parsed.clues, parsed.answer)

      if (leakyIndices.length > 0) {
        console.warn(
          `⚠️ Dicas problemáticas encontradas: ${leakyIndices.join(', ')}. Corrigindo sem gerar nova carta…`
        )

        // 3. Corrigir cada dica problemática individualmente (mantendo a carta)
        for (const idx of leakyIndices) {
          const badClue = parsed.clues[idx - 1]
          parsed.clues[idx - 1] = await fixSingleClue(
            parsed.answer, parsed.category, idx, badClue
          )
        }

        // 4. Double check final após correções
        const stillLeaky = findLeakyClue(parsed.clues, parsed.answer)
        if (stillLeaky) {
          console.warn(`⚠️ Dica ${stillLeaky} ainda problemática após correções. Tentando nova carta…`)
          continue
        }
      }

      // Carta válida — salvar no histórico e exibir
      addToHistory(parsed.answer)
      setCard({
        category: parsed.category,
        answer: parsed.answer,
        clues: insertPerdaSuaVez(parsed.clues),
        revealed: [],
        answerRevealed: false,
      })
      return

    } catch (err) {
      lastError = err
      if (attempt === MAX_CARD_ATTEMPTS) break
    }
  }

  setGenerating(false)
  throw lastError ?? new Error('Não foi possível gerar uma carta válida. Tente novamente.')
}

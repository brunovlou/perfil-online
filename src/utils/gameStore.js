const STORAGE_KEY = 'perfil-game-state'
const API_KEY_KEY = 'perfil-api-key'

const PLAYER_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6']

const defaultState = {
  players: [
    { id: 0, name: 'Jogador 1', color: PLAYER_COLORS[0], position: 0, active: true },
    { id: 1, name: 'Jogador 2', color: PLAYER_COLORS[1], position: 0, active: true },
    { id: 2, name: 'Jogador 3', color: PLAYER_COLORS[2], position: 0, active: false },
    { id: 3, name: 'Jogador 4', color: PLAYER_COLORS[3], position: 0, active: false },
    { id: 4, name: 'Jogador 5', color: PLAYER_COLORS[4], position: 0, active: false },
  ],
  card: null,
  generating: false,
  currentReaderId: null,
}

const listeners = new Set()

let channel = null
try {
  channel = new BroadcastChannel('perfil-game')
  channel.addEventListener('message', (e) => notifyListeners(e.data))
} catch (_) {}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    try { notifyListeners(JSON.parse(e.newValue)) } catch (_) {}
  }
})

function notifyListeners(state) {
  listeners.forEach((fn) => fn(state))
}

export function getState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { ...defaultState }
  } catch (_) {
    return { ...defaultState }
  }
}

export function setState(updater) {
  const current = getState()
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyListeners(next)
  if (channel) channel.postMessage(next)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function resetGame() {
  setState({ ...defaultState })
}

// Reinicia posições e carta, mas mantém nomes e quais jogadores estão ativos
export function newMatch() {
  setState((s) => ({
    ...defaultState,
    players: s.players.map(p => ({ ...p, position: 0 })),
  }))
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_KEY) || ''
}

export function setApiKey(key) {
  localStorage.setItem(API_KEY_KEY, key.trim())
}

export function getFirebaseUrl() {
  return (
    localStorage.getItem('perfil-firebase-url') ||
    import.meta.env.VITE_FIREBASE_URL ||
    ''
  ).replace(/\/$/, '')
}

export function setFirebaseUrl(url) {
  localStorage.setItem('perfil-firebase-url', url.trim().replace(/\/$/, ''))
}

// ── Modo Draft ─────────────────────────────────────────────────────────────
export function getDraftMode() {
  return localStorage.getItem('perfil-draft-mode') === 'true'
}
export function setDraftMode(val) {
  localStorage.setItem('perfil-draft-mode', val ? 'true' : 'false')
}

// Opções rejeitadas no Draft — ficam bloqueadas por 60 dias
const DRAFT_REJECTED_KEY = 'perfil-draft-rejected'
const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000

export function getDraftRejected() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_REJECTED_KEY) || '[]')
    const cutoff = Date.now() - SIXTY_DAYS
    return raw.filter(r => r.rejectedAt > cutoff)
  } catch { return [] }
}

export function addDraftRejected(answers) {
  const existing = getDraftRejected()
  const now = Date.now()
  const map = new Map(existing.map(r => [r.answer.toLowerCase(), r]))
  answers.forEach(a => map.set(a.toLowerCase(), { answer: a, rejectedAt: now }))
  localStorage.setItem(DRAFT_REJECTED_KEY, JSON.stringify([...map.values()]))
}

export const BOARD_SIZE = 120

export function movePlayer(id, delta) {
  setState((s) => ({
    ...s,
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: Math.max(0, Math.min(BOARD_SIZE, p.position + delta)) } : p
    ),
  }))
}

// Ends the round: moves reader by revealed count, moves winner by (20 - revealed),
// clears the card and auto-advances to next reader in rotation.
export function endRound(winnerId = null) {
  setState((s) => {
    const revealedCount = s.card ? s.card.revealed.length : 0
    const winnerScore   = Math.max(0, 20 - revealedCount)
    const activePlayers = s.players.filter(p => p.active)

    // Rotate to next reader
    const currentIdx  = activePlayers.findIndex(p => p.id === s.currentReaderId)
    const nextIdx     = currentIdx >= 0 ? (currentIdx + 1) % activePlayers.length : 0
    const nextReaderId = activePlayers[nextIdx]?.id ?? null

    const players = s.players.map(p => {
      let pos = p.position
      if (p.id === s.currentReaderId && revealedCount > 0)
        pos = Math.min(BOARD_SIZE, pos + revealedCount)
      if (winnerId !== null && p.id === winnerId)
        pos = Math.min(BOARD_SIZE, pos + winnerScore)
      return { ...p, position: pos }
    })

    return { ...s, players, card: null, currentReaderId: nextReaderId }
  })
}

export function updatePlayerName(id, name) {
  setState((s) => ({
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, name } : p)),
  }))
}

export function togglePlayerActive(id) {
  setState((s) => ({
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    currentReaderId: s.currentReaderId === id ? null : s.currentReaderId,
  }))
}

export function setCurrentReader(id) {
  setState((s) => ({ ...s, currentReaderId: s.currentReaderId === id ? null : id }))
}

export function setCard(card) {
  setState((s) => ({ ...s, card, generating: false }))
}

export function setGenerating(val) {
  setState((s) => ({ ...s, generating: val }))
}

export function toggleClue(index) {
  setState((s) => {
    if (!s.card) return s
    const revealed = s.card.revealed.includes(index)
      ? s.card.revealed.filter((i) => i !== index)
      : [...s.card.revealed, index]
    return { ...s, card: { ...s.card, revealed } }
  })
}

export function revealAnswer() {
  setState((s) => s.card ? { ...s, card: { ...s.card, answerRevealed: true } } : s)
}

export function hideAnswer() {
  setState((s) => s.card ? { ...s, card: { ...s.card, answerRevealed: false } } : s)
}

// ── Modo Leitor ────────────────────────────────────────────────────────────
export function getLeitorMode() {
  return localStorage.getItem('perfil-leitor-mode') === 'true'
}
export function setLeitorMode(val) {
  localStorage.setItem('perfil-leitor-mode', val ? 'true' : 'false')
}

// ── Timer por dica ─────────────────────────────────────────────────────────
export function getTimerMode() {
  return localStorage.getItem('perfil-timer-mode') === 'true'
}
export function setTimerMode(val) {
  localStorage.setItem('perfil-timer-mode', val ? 'true' : 'false')
}

// ── Modo Solo ──────────────────────────────────────────────────────────────
export function getSoloMode() {
  return localStorage.getItem('perfil-solo-mode') === 'true'
}

export function setSoloMode(val) {
  localStorage.setItem('perfil-solo-mode', val ? 'true' : 'false')
}

// Revela sequencialmente a próxima dica ainda não revelada
export function revealNextSoloClue() {
  setState((s) => {
    if (!s.card) return s
    const total = s.card.clues.length
    for (let i = 0; i < total; i++) {
      if (!s.card.revealed.includes(i)) {
        return { ...s, card: { ...s.card, revealed: [...s.card.revealed, i] } }
      }
    }
    return s // todas já reveladas
  })
}

// Encerra rodada solo: vencedor anda (12 - revealed); ninguém lê → leitor não anda
export function endSoloRound(winnerId = null) {
  setState((s) => {
    const revealedCount = s.card ? s.card.revealed.length : 0
    const winnerScore   = Math.max(0, 12 - revealedCount)
    const activePlayers = s.players.filter(p => p.active)

    // Avança para o próximo na rotação (mantém consistência)
    const currentIdx   = activePlayers.findIndex(p => p.id === s.currentReaderId)
    const nextIdx      = currentIdx >= 0 ? (currentIdx + 1) % activePlayers.length : 0
    const nextReaderId = activePlayers[nextIdx]?.id ?? null

    const players = s.players.map(p => {
      let pos = p.position
      if (winnerId !== null && p.id === winnerId)
        pos = Math.min(BOARD_SIZE, pos + winnerScore)
      return { ...p, position: pos }
    })

    return { ...s, players, card: null, currentReaderId: nextReaderId }
  })
}

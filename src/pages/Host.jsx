import { useState, useEffect } from 'react'
import Board from '../components/Board'
import Card from '../components/Card'
import {
  getState, subscribe,
  movePlayer, updatePlayerName, togglePlayerActive, setPlayerPosition,
  toggleClue, revealAnswer, hideAnswer, clearCard, resetGame,
  getApiKey, setApiKey,
} from '../utils/gameStore'
import { generateCard } from '../utils/generateCard'

const CATEGORIES = ['ALEATÓRIO', 'PESSOA', 'COISA', 'LUGAR', 'ANO']

export default function Host() {
  const [state, setLocalState] = useState(getState)
  const [category, setCategory] = useState('ALEATÓRIO')
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey)

  useEffect(() => subscribe(setLocalState), [])

  const { players, card, generating } = state
  const activePlayers = players.filter((p) => p.active)
  const remaining = card ? 20 - card.revealed.length : 0

  async function handleGenerate() {
    setError('')
    try {
      await generateCard(category)
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSaveApiKey() {
    setApiKey(apiKeyInput)
    setShowSettings(false)
    setError('')
  }

  function openDisplay() {
    window.open('/display', '_blank')
  }

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.logo}>PERFIL <span style={styles.logoSub}>— Host</span></span>
        <div style={styles.topActions}>
          <button onClick={openDisplay} style={styles.btnSecondary}>
            Abrir Tela dos Jogadores ↗
          </button>
          <button onClick={() => setShowSettings(true)} style={styles.btnIcon} title="Configurações">
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div style={styles.overlay} onClick={() => setShowSettings(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Configurações</h2>
            <p style={styles.modalDesc}>
              A chave da API do OpenAI é necessária para gerar as cartas.
              Ela é salva apenas no seu navegador.
            </p>
            <p style={{ ...styles.modalDesc, marginTop: 4, fontSize: 12 }}>
              Obtenha a sua em{' '}
              <span style={{ color: '#f59e0b' }}>platform.openai.com → API Keys</span>
            </p>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={styles.input}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
            />
            <div style={styles.modalActions}>
              <button onClick={() => setShowSettings(false)} style={styles.btnCancel}>
                Cancelar
              </button>
              <button onClick={handleSaveApiKey} style={styles.btnPrimary}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div style={styles.main}>
        {/* LEFT — Board + players */}
        <div style={styles.left}>
          <div style={styles.boardWrap}>
            <Board players={players} />
          </div>

          {/* Player controls */}
          <div style={styles.playersSection}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Jogadores</span>
              <button
                onClick={() => {
                  if (window.confirm('Resetar o jogo? Todos voltam à posição inicial.')) resetGame()
                }}
                style={styles.btnDanger}
              >
                Resetar
              </button>
            </div>

            {players.map((player) => (
              <div
                key={player.id}
                style={{
                  ...styles.playerRow,
                  opacity: player.active ? 1 : 0.45,
                }}
              >
                {/* Color dot */}
                <div style={{ ...styles.playerDot, background: player.color }} />

                {/* Name */}
                <input
                  value={player.name}
                  onChange={(e) => updatePlayerName(player.id, e.target.value)}
                  style={styles.playerName}
                  disabled={!player.active}
                />

                {/* Position controls */}
                {player.active && (
                  <>
                    <button
                      onClick={() => movePlayer(player.id, -1)}
                      style={styles.btnSmall}
                      title="Voltar 1 casa"
                    >
                      ◀
                    </button>
                    <span style={styles.posLabel}>Casa {player.position}</span>
                    <button
                      onClick={() => movePlayer(player.id, 1)}
                      style={styles.btnSmall}
                      title="Avançar 1 casa"
                    >
                      ▶
                    </button>
                    {card && remaining > 0 && (
                      <button
                        onClick={() => movePlayer(player.id, remaining)}
                        style={{ ...styles.btnSmall, background: '#f59e0b', color: '#0f172a', fontWeight: 800 }}
                        title={`Acertou! Avançar ${remaining} casas`}
                      >
                        +{remaining}
                      </button>
                    )}
                  </>
                )}

                {/* Toggle active */}
                <button
                  onClick={() => togglePlayerActive(player.id)}
                  style={{ ...styles.btnSmall, background: player.active ? '#334155' : '#22c55e22', color: player.active ? '#94a3b8' : '#22c55e' }}
                  title={player.active ? 'Remover jogador' : 'Adicionar jogador'}
                >
                  {player.active ? '✕' : '+'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Card controls */}
        <div style={styles.right}>
          {/* Generate controls */}
          <div style={styles.generateSection}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={styles.select}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALEATÓRIO' ? 'Categoria Aleatória' : c}
                </option>
              ))}
            </select>

            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                ...styles.btnPrimary,
                opacity: generating ? 0.7 : 1,
                cursor: generating ? 'wait' : 'pointer',
              }}
            >
              {generating ? 'Gerando carta...' : card ? 'Gerar Nova Carta' : 'Gerar Carta'}
            </button>

            {error && <p style={styles.error}>{error}</p>}

            {!getApiKey() && (
              <p style={styles.warning}>
                Chave da API não configurada.{' '}
                <button
                  onClick={() => setShowSettings(true)}
                  style={{ background: 'none', color: '#f59e0b', fontWeight: 700, padding: 0, fontSize: 13 }}
                >
                  Configurar agora →
                </button>
              </p>
            )}
          </div>

          {/* Card */}
          <div style={styles.cardWrap}>
            {card ? (
              <Card
                card={card}
                isHost={true}
                onToggleClue={toggleClue}
                onRevealAnswer={revealAnswer}
                onHideAnswer={hideAnswer}
              />
            ) : (
              <div style={styles.emptyCard}>
                <span style={{ fontSize: 48 }}>🃏</span>
                <p>Nenhuma carta gerada ainda.</p>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  Clique em "Gerar Carta" para começar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f172a',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    flexShrink: 0,
  },
  logo: {
    fontSize: '20px',
    fontWeight: 900,
    color: '#f59e0b',
    letterSpacing: '2px',
  },
  logoSub: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: 0,
  },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  btnSecondary: {
    background: '#334155',
    color: '#e2e8f0',
    padding: '7px 14px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '13px',
  },
  btnIcon: {
    background: '#334155',
    color: '#e2e8f0',
    padding: '7px 10px',
    borderRadius: '8px',
    fontSize: '16px',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: '0',
  },
  left: {
    flex: '0 0 55%',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '12px',
    overflow: 'hidden',
    borderRight: '1px solid #334155',
  },
  boardWrap: {
    flex: '0 0 auto',
    width: '100%',
  },
  playersSection: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#64748b',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#1e293b',
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid #334155',
  },
  playerDot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  playerName: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#e2e8f0',
    fontWeight: 700,
    fontSize: '14px',
    minWidth: 0,
  },
  posLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  btnSmall: {
    background: '#334155',
    color: '#e2e8f0',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    flexShrink: 0,
  },
  btnDanger: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
  },
  right: {
    flex: '0 0 45%',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '12px',
    overflow: 'hidden',
  },
  generateSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
  },
  select: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    padding: '9px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700,
    width: '100%',
  },
  btnPrimary: {
    background: '#f59e0b',
    color: '#0f172a',
    padding: '10px 16px',
    borderRadius: '8px',
    fontWeight: 800,
    fontSize: '14px',
    width: '100%',
  },
  error: {
    color: '#f87171',
    fontSize: '13px',
    background: '#7f1d1d22',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #7f1d1d',
  },
  warning: {
    color: '#fbbf24',
    fontSize: '13px',
    background: '#78350f22',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #78350f',
  },
  cardWrap: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e293b',
    borderRadius: '12px',
    border: '1px dashed #334155',
    color: '#94a3b8',
    fontSize: '15px',
    gap: '8px',
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#1e293b',
    borderRadius: '16px',
    padding: '28px',
    width: '420px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 900,
    color: '#f1f5f9',
  },
  modalDesc: {
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  input: {
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '8px',
    color: '#e2e8f0',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  btnCancel: {
    background: '#334155',
    color: '#e2e8f0',
    padding: '9px 18px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '14px',
  },
}

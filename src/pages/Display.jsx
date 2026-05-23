import { useState, useEffect } from 'react'
import Board from '../components/Board'
import Card from '../components/Card'
import { getState, subscribe } from '../utils/gameStore'

const CATEGORY_META = {
  PESSOA: { label: 'Pessoa', icon: '👤', color: '#3b82f6' },
  COISA: { label: 'Coisa',  icon: '📦', color: '#f97316' },
  LUGAR: { label: 'Lugar',  icon: '📍', color: '#22c55e' },
  ANO:   { label: 'Ano',    icon: '📅', color: '#a855f7' },
}

export default function Display() {
  const [state, setLocalState] = useState(getState)

  useEffect(() => subscribe(setLocalState), [])

  const { players, card, generating } = state
  const activePlayers = players.filter((p) => p.active)

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>PERFIL</span>
        <div style={styles.playerChips}>
          {activePlayers.map((p) => (
            <div key={p.id} style={styles.chip}>
              <div style={{ ...styles.chipDot, background: p.color }} />
              <span style={styles.chipName}>{p.name}</span>
              <span style={styles.chipPos}>Casa {p.position}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {/* Board */}
        <div style={styles.boardCol}>
          <Board players={players} />
        </div>

        {/* Card / right panel */}
        <div style={styles.cardCol}>
          {generating ? (
            <div style={styles.waiting}>
              <div style={styles.spinner} />
              <p style={styles.waitingText}>Gerando carta...</p>
            </div>
          ) : card ? (
            <DisplayCard card={card} />
          ) : (
            <div style={styles.waiting}>
              <span style={{ fontSize: 56 }}>🃏</span>
              <p style={styles.waitingText}>Aguardando próxima carta...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Read-only card for the display screen
function DisplayCard({ card }) {
  const meta = CATEGORY_META[card.category] || { label: card.category, icon: '❓', color: '#6b7280' }
  const revealedClues = card.clues
    .map((text, i) => ({ text, num: i + 1, revealed: card.revealed.includes(i) }))
    .filter((c) => c.revealed)
  const hiddenCount = 20 - revealedClues.length

  return (
    <div style={styles.displayCard}>
      {/* Category header */}
      <div style={{ ...styles.displayHeader, background: meta.color }}>
        <span style={styles.displayIcon}>{meta.icon}</span>
        <span style={styles.displayCategory}>{meta.label.toUpperCase()}</span>
        <span style={styles.displayStats}>
          {revealedClues.length} dica{revealedClues.length !== 1 ? 's' : ''} revelada{revealedClues.length !== 1 ? 's' : ''}
          {' · '}
          {hiddenCount} restante{hiddenCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Answer (if revealed) */}
      {card.answerRevealed && (
        <div style={{ ...styles.displayAnswer, borderColor: meta.color }}>
          <span style={styles.displayAnswerLabel}>RESPOSTA</span>
          <span style={{ ...styles.displayAnswerText, color: meta.color }}>{card.answer}</span>
        </div>
      )}

      {/* Revealed clues */}
      <div style={styles.displayClues}>
        {revealedClues.length === 0 ? (
          <div style={styles.noClues}>
            <span style={{ fontSize: 32 }}>🔒</span>
            <p>Nenhuma dica revelada ainda.</p>
            <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
              Peça uma dica pelo número (1 a 20).
            </p>
          </div>
        ) : (
          revealedClues.map((clue) => (
            <div key={clue.num} style={styles.displayClueRow}>
              <span style={styles.displayClueNum}>{clue.num}</span>
              <span style={styles.displayClueText}>{clue.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Hidden clues strip */}
      {hiddenCount > 0 && (
        <div style={styles.hiddenStrip}>
          {Array.from({ length: hiddenCount }).map((_, i) => {
            const hiddenNums = Array.from({ length: 20 }, (_, j) => j + 1)
              .filter((n) => !card.revealed.includes(n - 1))
            return (
              <span key={i} style={styles.hiddenChip}>
                {hiddenNums[i]}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Spinner
const spinnerKeyframes = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = spinnerKeyframes
  document.head.appendChild(style)
}

const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0f1e',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '10px 24px',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    flexShrink: 0,
  },
  logo: {
    fontSize: '22px',
    fontWeight: 900,
    color: '#f59e0b',
    letterSpacing: '4px',
    flexShrink: 0,
  },
  playerChips: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    flex: 1,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '20px',
    padding: '4px 12px 4px 8px',
  },
  chipDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  chipName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  chipPos: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 600,
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  boardCol: {
    flex: '0 0 52%',
    display: 'flex',
    alignItems: 'center',
    padding: '20px',
    borderRight: '1px solid #1e293b',
  },
  cardCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '16px',
  },
  waiting: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    color: '#334155',
  },
  waitingText: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#475569',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTopColor: '#f59e0b',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  // Display card
  displayCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#1e293b',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid #334155',
  },
  displayHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    flexShrink: 0,
  },
  displayIcon: {
    fontSize: '24px',
  },
  displayCategory: {
    fontSize: '20px',
    fontWeight: 900,
    color: 'white',
    letterSpacing: '3px',
    flex: 1,
  },
  displayStats: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.75)',
    fontWeight: 600,
  },
  displayAnswer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    background: '#0f172a',
    borderBottom: '2px solid',
    flexShrink: 0,
    gap: '4px',
  },
  displayAnswerLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#64748b',
    letterSpacing: '3px',
  },
  displayAnswerText: {
    fontSize: '36px',
    fontWeight: 900,
  },
  displayClues: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  noClues: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: '#475569',
    fontSize: '15px',
    fontWeight: 600,
  },
  displayClueRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '10px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  displayClueNum: {
    minWidth: '28px',
    height: '28px',
    background: '#334155',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
    color: '#94a3b8',
    flexShrink: 0,
  },
  displayClueText: {
    fontSize: '16px',
    color: '#e2e8f0',
    fontWeight: 600,
    lineHeight: 1.4,
    paddingTop: '4px',
  },
  hiddenStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '12px 16px',
    borderTop: '1px solid #334155',
    background: '#0f172a',
    flexShrink: 0,
  },
  hiddenChip: {
    width: '30px',
    height: '30px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#475569',
  },
}

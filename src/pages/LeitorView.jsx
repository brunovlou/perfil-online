import { useState, useEffect } from 'react'
import { getState, subscribe } from '../utils/gameStore'

const CATEGORY_META = {
  PESSOA:   { label: 'Pessoa',       icon: '👤', gradient: 'linear-gradient(135deg,#4338CA,#6366F1,#818CF8)', color: '#6366F1', glow: 'rgba(99,102,241,0.4)'  },
  COISA:    { label: 'Coisa',        icon: '📦', gradient: 'linear-gradient(135deg,#C2410C,#F97316,#FB923C)', color: '#F97316', glow: 'rgba(249,115,22,0.4)'  },
  LUGAR:    { label: 'Lugar',        icon: '🌍', gradient: 'linear-gradient(135deg,#065F46,#10B981,#34D399)', color: '#10B981', glow: 'rgba(16,185,129,0.4)'  },
  ANO:      { label: 'Ano',          icon: '📅', gradient: 'linear-gradient(135deg,#6D28D9,#A855F7,#C084FC)', color: '#A855F7', glow: 'rgba(168,85,247,0.4)'  },
  CONCEITO: { label: 'Conceito',     icon: '🧠', gradient: 'linear-gradient(135deg,#0E7490,#06B6D4,#67E8F9)', color: '#06B6D4', glow: 'rgba(6,182,212,0.4)'   },
  MÚSICA:   { label: 'Música',       icon: '🎵', gradient: 'linear-gradient(135deg,#9D174D,#EC4899,#F9A8D4)', color: '#EC4899', glow: 'rgba(236,72,153,0.4)'  },
  SÉRIE:    { label: 'Série/Filme',  icon: '🎬', gradient: 'linear-gradient(135deg,#881337,#E11D48,#FB7185)', color: '#E11D48', glow: 'rgba(225,29,72,0.4)'   },
}

// Modo celular: resposta vem direto da URL (?a=ANSWER&c=CATEGORY)
// Modo popup:  resposta vem do estado sincronizado via BroadcastChannel/localStorage

export default function LeitorView() {
  const params      = new URLSearchParams(window.location.search)
  const urlAnswer   = params.get('a')
  const urlCategory = params.get('c')
  const urlMode     = params.get('mode')
  const isDraftPhone = urlMode === 'draft'
  const isPhone      = !!urlAnswer || isDraftPhone

  const [state, setLocalState] = useState(getState)

  useEffect(() => {
    if (isPhone) return
    return subscribe(setLocalState)
  }, [isPhone])

  /* ── Modo celular Draft: mostra as 4 opções numeradas ── */
  if (isDraftPhone) {
    const category = urlCategory || 'PESSOA'
    const options = [1, 2, 3, 4].map(n => params.get(`o${n}`)).filter(Boolean)
    const meta = CATEGORY_META[category] || {
      label: category, icon: '❓',
      gradient: 'linear-gradient(135deg,#374151,#6B7280)',
      color: '#6B7280', glow: 'rgba(107,114,128,0.3)',
    }
    return (
      <div style={s.root}>
        <div style={{ ...s.catHeader, background: meta.gradient }}>
          <div style={s.catShine}/>
          <span style={s.catIcon}>{meta.icon}</span>
          <span style={s.catLabel}>{meta.label.toUpperCase()}</span>
        </div>

        <div style={s.draftOptionsList}>
          {options.map((opt, i) => (
            <div key={i} style={{ ...s.draftOption, borderLeft: `3px solid ${meta.color}` }}>
              <div style={{ ...s.draftNum, background: meta.color, boxShadow: `0 0 12px ${meta.glow}` }}>
                {i + 1}
              </div>
              <span style={{ ...s.draftText, color: meta.color }}>{opt}</span>
            </div>
          ))}
        </div>

        <p style={s.phoneTip}>Só você está vendo isso 👁</p>
      </div>
    )
  }

  // Em modo celular normal, monta um card sintético só com a resposta
  const card = urlAnswer
    ? { answer: urlAnswer, category: urlCategory || 'PESSOA', clues: [], revealed: [], answerRevealed: true }
    : state.card

  const meta = CATEGORY_META[card?.category] || {
    label: card?.category || '?', icon: '❓',
    gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.3)',
  }

  // URL para o QR code (só no popup, para abrir no celular)
  const phoneUrl = card
    ? `${window.location.origin}/?leitor&a=${encodeURIComponent(card.answer)}&c=${encodeURIComponent(card.category)}`
    : ''
  const qrSrc = phoneUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&bgcolor=0D1530&color=FFFFFF&qzone=1&data=${encodeURIComponent(phoneUrl)}`
    : ''

  /* ── Sem carta ainda ── */
  if (!card) {
    return (
      <div style={s.root}>
        <div style={s.waiting}>
          <span style={{ fontSize: 48 }}>🃏</span>
          <p style={s.waitTitle}>Aguardando carta…</p>
          <p style={s.waitHint}>
            Quando o leitor gerar uma carta, ela aparecerá aqui automaticamente.
          </p>
        </div>
      </div>
    )
  }

  /* ── Modo celular: só mostra a resposta ── */
  if (urlAnswer) {
    return (
      <div style={s.root}>
        <div style={{ ...s.catHeader, background: meta.gradient }}>
          <div style={s.catShine}/>
          <span style={s.catIcon}>{meta.icon}</span>
          <span style={s.catLabel}>{meta.label.toUpperCase()}</span>
        </div>

        <div style={s.phoneAnswer}>
          <span style={s.phoneAnswerLabel}>RESPOSTA</span>
          <span style={{ ...s.phoneAnswerText, color: meta.color, textShadow: `0 0 30px ${meta.glow}` }}>
            {card.answer}
          </span>
        </div>

        <p style={s.phoneTip}>Só você está vendo isso 👁</p>
      </div>
    )
  }

  /* ── Modo popup: resposta + dicas + QR code ── */
  const revealedCount = card.revealed.length
  const totalClues    = card.clues.length

  return (
    <div style={s.root}>
      {/* Category header */}
      <div style={{ ...s.catHeader, background: meta.gradient }}>
        <div style={s.catShine}/>
        <span style={s.catIcon}>{meta.icon}</span>
        <span style={s.catLabel}>{meta.label.toUpperCase()}</span>
        <div style={s.clueBadge}>
          {revealedCount}/{totalClues} dicas reveladas
        </div>
      </div>

      {/* Answer */}
      <div style={s.answerBox}>
        <span style={s.answerLabel}>RESPOSTA</span>
        <span style={{ ...s.answerText, color: meta.color, textShadow: `0 0 24px ${meta.glow}` }}>
          {card.answer}
        </span>
      </div>

      {/* QR code para celular */}
      {qrSrc && (
        <div style={s.qrBox}>
          <img src={qrSrc} alt="QR Code" style={s.qrImg} />
          <div style={s.qrTexts}>
            <span style={s.qrTitle}>📱 Celular</span>
            <span style={s.qrHint}>
              Escaneie para ver a resposta no celular (modo espelhamento)
            </span>
          </div>
        </div>
      )}

      {/* Clues list */}
      {card.clues.length > 0 && (
        <div style={s.cluesList}>
          {card.clues.map((clue, i) => {
            const revealed = card.revealed.includes(i)
            const isAction = clue === 'Perca sua vez.'
            return (
              <div key={i} style={{
                ...s.clueRow,
                background: revealed
                  ? isAction
                    ? 'linear-gradient(90deg,rgba(239,68,68,0.12) 0%,transparent 100%)'
                    : `linear-gradient(90deg,rgba(${hexToRgb(meta.color)},0.08) 0%,transparent 100%)`
                  : 'transparent',
                borderLeft: revealed
                  ? `2.5px solid ${isAction ? '#EF4444' : meta.color}`
                  : '2.5px solid transparent',
                opacity: revealed ? 1 : 0.35,
              }}>
                <div style={{
                  ...s.clueNum,
                  background: revealed ? (isAction ? '#EF4444' : meta.color) : 'rgba(255,255,255,0.06)',
                  boxShadow: revealed ? `0 0 8px ${isAction ? 'rgba(239,68,68,0.4)' : meta.glow}` : 'none',
                }}>
                  {i + 1}
                </div>
                <span style={{
                  ...s.clueText,
                  color: revealed ? (isAction ? '#FCA5A5' : '#E2E8F0') : '#334155',
                  fontWeight: isAction && revealed ? 700 : 400,
                }}>
                  {revealed ? (isAction ? '⚠️ Perca sua vez.' : clue) : '● ● ● ● ●'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!r) return '99,102,241'
  return `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}`
}

const s = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#07091A 0%,#0A1020 60%,#070D1E 100%)',
    fontFamily: "'Space Grotesk', sans-serif",
    display: 'flex', flexDirection: 'column',
    color: '#E2E8F0',
  },

  // Waiting
  waiting: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 16, padding: 32, textAlign: 'center',
  },
  waitTitle: { fontSize: 18, fontWeight: 700, color: '#94A3B8' },
  waitHint:  { fontSize: 13, color: '#334155', lineHeight: 1.6, maxWidth: 280 },

  // Category header
  catHeader: {
    padding: '14px 18px',
    display: 'flex', alignItems: 'center', gap: 12,
    flexShrink: 0, position: 'relative', overflow: 'hidden',
  },
  catShine: {
    position: 'absolute', top: 0, left: '-20%',
    width: '60%', height: '100%',
    background: 'rgba(255,255,255,0.08)',
    transform: 'skewX(-20deg)', pointerEvents: 'none',
  },
  catIcon:  { fontSize: 22, lineHeight: 1, position: 'relative' },
  catLabel: {
    fontSize: 15, fontWeight: 800, color: 'white',
    letterSpacing: '3px', flex: 1, position: 'relative',
    textShadow: '0 1px 8px rgba(0,0,0,0.3)',
  },
  clueBadge: {
    background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 99, padding: '3px 10px',
    fontSize: 11, fontWeight: 700, color: 'white', whiteSpace: 'nowrap',
    position: 'relative',
  },

  // Answer (popup mode)
  answerBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    padding: '14px 18px',
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  answerLabel: {
    fontSize: 9, fontWeight: 700, color: '#4B6080', letterSpacing: '2px',
  },
  answerText: {
    fontSize: 28, fontWeight: 900, lineHeight: 1.2,
  },

  // Draft phone mode — numbered options list
  draftOptionsList: {
    flex: 1, display: 'flex', flexDirection: 'column',
    gap: 0, padding: '8px 0', overflowY: 'auto',
  },
  draftOption: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '18px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(255,255,255,0.02)',
  },
  draftNum: {
    width: 42, height: 42, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 900, color: 'white', flexShrink: 0,
  },
  draftText: {
    fontSize: 20, fontWeight: 800, lineHeight: 1.3, flex: 1,
  },

  // Answer (phone mode)
  phoneAnswer: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 32,
  },
  phoneAnswerLabel: {
    fontSize: 11, fontWeight: 700, color: '#4B6080', letterSpacing: '3px',
  },
  phoneAnswerText: {
    fontSize: 42, fontWeight: 900, textAlign: 'center', lineHeight: 1.2,
  },
  phoneTip: {
    textAlign: 'center', fontSize: 13, color: '#334155',
    fontWeight: 500, paddingBottom: 24,
  },

  // QR code box
  qrBox: {
    display: 'flex', alignItems: 'center', gap: 14,
    margin: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: '10px 14px',
    flexShrink: 0,
  },
  qrImg: {
    width: 80, height: 80, borderRadius: 8, flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.08)',
  },
  qrTexts: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  qrTitle: {
    fontSize: 13, fontWeight: 700, color: '#94A3B8',
  },
  qrHint: {
    fontSize: 11, color: '#4B6080', lineHeight: 1.5,
  },

  // Clues
  cluesList: {
    flex: 1, overflowY: 'auto', padding: '4px 0',
  },
  clueRow: {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '5px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    minHeight: 32,
    transition: 'all 0.2s',
  },
  clueNum: {
    minWidth: 22, height: 22, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 800, color: 'white', flexShrink: 0,
    transition: 'background 0.2s',
  },
  clueText: {
    fontSize: 12, lineHeight: 1.4, flex: 1,
    transition: 'color 0.2s',
  },
}

// Card.jsx — redesigned with modern dark aesthetic

const CATEGORY_META = {
  PESSOA: {
    label: 'Pessoa',
    icon: '👤',
    gradient: 'linear-gradient(135deg, #4338CA 0%, #6366F1 60%, #818CF8 100%)',
    color: '#6366F1',
    glow: 'rgba(99,102,241,0.3)',
  },
  COISA: {
    label: 'Coisa',
    icon: '📦',
    gradient: 'linear-gradient(135deg, #C2410C 0%, #F97316 60%, #FB923C 100%)',
    color: '#F97316',
    glow: 'rgba(249,115,22,0.3)',
  },
  LUGAR: {
    label: 'Lugar',
    icon: '🌍',
    gradient: 'linear-gradient(135deg, #065F46 0%, #10B981 60%, #34D399 100%)',
    color: '#10B981',
    glow: 'rgba(16,185,129,0.3)',
  },
  ANO: {
    label: 'Ano',
    icon: '📅',
    gradient: 'linear-gradient(135deg, #6D28D9 0%, #A855F7 60%, #C084FC 100%)',
    color: '#A855F7',
    glow: 'rgba(168,85,247,0.3)',
  },
}

export default function Card({ card, onToggleClue, onRevealAnswer, onHideAnswer }) {
  if (!card) return null

  const meta = CATEGORY_META[card.category] || {
    label: card.category, icon: '❓',
    gradient: 'linear-gradient(135deg, #374151, #6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.3)',
  }
  const revealedCount = card.revealed.length

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0D1530',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: `0 0 30px ${meta.glow}, 0 20px 40px rgba(0,0,0,0.4)`,
    }}>

      {/* Category header */}
      <div style={{
        background: meta.gradient,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '12px',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative shine */}
        <div style={{
          position: 'absolute', top: 0, left: '-20%',
          width: '60%', height: '100%',
          background: 'rgba(255,255,255,0.08)',
          transform: 'skewX(-20deg)',
          pointerEvents: 'none',
        }}/>

        <span style={{ fontSize: '22px', lineHeight: 1 }}>{meta.icon}</span>
        <span style={{
          fontSize: '16px', fontWeight: 700, color: 'white',
          letterSpacing: '3px', flex: 1,
          textShadow: '0 1px 8px rgba(0,0,0,0.3)',
        }}>
          {meta.label.toUpperCase()}
        </span>

        {/* Counter badge */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '99px',
          padding: '4px 12px',
          fontSize: '11px', fontWeight: 700, color: 'white',
          whiteSpace: 'nowrap',
        }}>
          {revealedCount} dica{revealedCount !== 1 ? 's' : ''} revelada{revealedCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Answer row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '11px 18px',
        background: 'rgba(0,0,0,0.35)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        minHeight: '48px',
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 700, color: '#4B6080',
          letterSpacing: '2px', flexShrink: 0,
        }}>
          RESPOSTA
        </span>

        {card.answerRevealed ? (
          <>
            <span style={{
              fontSize: '17px', fontWeight: 700, flex: 1,
              color: meta.color,
              textShadow: `0 0 20px ${meta.glow}`,
            }}>
              {card.answer}
            </span>
            <button onClick={onHideAnswer} style={{
              padding: '5px 14px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94A3B8', fontWeight: 600, fontSize: '12px',
              cursor: 'pointer', flexShrink: 0,
            }}>
              Ocultar
            </button>
          </>
        ) : (
          <>
            <span style={{
              flex: 1, color: '#1E3050', letterSpacing: '4px', fontSize: '13px',
            }}>
              {'● '.repeat(Math.min(Math.ceil(card.answer.length / 2), 8)).trim()}
            </span>
            <button onClick={onRevealAnswer} style={{
              padding: '6px 16px', borderRadius: '8px',
              background: meta.gradient,
              color: 'white', fontWeight: 700, fontSize: '12px',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: `0 4px 12px ${meta.glow}`,
              border: 'none',
            }}>
              Revelar
            </button>
          </>
        )}
      </div>

      {/* Clues list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {card.clues.map((clue, i) => {
          const revealed = card.revealed.includes(i)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '6px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              minHeight: '36px',
              background: revealed
                ? `linear-gradient(90deg, rgba(${hexToRgb(meta.color)},0.07) 0%, transparent 100%)`
                : 'transparent',
              borderLeft: revealed ? `2.5px solid ${meta.color}` : '2.5px solid transparent',
              transition: 'all 0.2s ease',
            }}>
              {/* Number badge */}
              <div style={{
                minWidth: '24px', height: '24px',
                borderRadius: '6px',
                background: revealed ? meta.color : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 800, color: 'white',
                flexShrink: 0,
                transition: 'background 0.2s',
                boxShadow: revealed ? `0 0 8px ${meta.glow}` : 'none',
              }}>
                {i + 1}
              </div>

              {/* Clue text */}
              <span style={{
                fontSize: '12.5px',
                flex: 1, lineHeight: 1.4,
                color: revealed ? '#E2E8F0' : '#1E3050',
                letterSpacing: revealed ? 'normal' : '3px',
                transition: 'color 0.2s, letter-spacing 0.2s',
              }}>
                {revealed ? clue : '● ● ● ● ● ● ● ●'}
              </span>

              {/* Toggle button */}
              <button
                onClick={() => onToggleClue(i)}
                style={{
                  width: '30px', height: '30px',
                  borderRadius: '8px',
                  background: revealed
                    ? meta.color
                    : 'rgba(255,255,255,0.06)',
                  border: revealed
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.08)',
                  fontSize: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: revealed ? `0 0 10px ${meta.glow}` : 'none',
                }}
                title={revealed ? 'Ocultar dica' : 'Revelar dica'}
              >
                {revealed ? '👁' : '🔒'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Helper: convert hex color to "r,g,b" string for rgba()
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '99,102,241'
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
}

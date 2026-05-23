// Board.jsx — flat 120-space board
// Mantidas: jump-arc (1), dynamic light (3), particles (5)

import { useEffect, useRef, useState } from 'react'

const COLS = 12
const ROWS = 10
const BOARD_SIZE = 120
const R         = 13
const SPACING_X = 58
const SPACING_Y = 42
const ORIGIN_X  = 43
const ORIGIN_Y  = 427

const MAX_JUMP = 20   // SVG units peak elevation during move

function buildPositions() {
  const pos = [null] // 1-indexed
  for (let row = 0; row < ROWS; row++) {
    const y   = ORIGIN_Y - row * SPACING_Y
    const ltr = row % 2 === 0
    for (let col = 0; col < COLS; col++) {
      const x = ltr
        ? ORIGIN_X + col * SPACING_X
        : ORIGIN_X + (COLS - 1 - col) * SPACING_X
      pos.push({ x, y })
    }
  }
  return pos
}

const POS         = buildPositions()
const PATH_POINTS = POS.slice(1).map(p => `${p.x},${p.y}`).join(' ')

function tokenOffsets(count) {
  if (count === 1) return [{ dx: 0, dy: 0 }]
  if (count === 2) return [{ dx: -7, dy: 0 }, { dx: 7, dy: 0 }]
  if (count === 3) return [{ dx: -9, dy: 5 }, { dx: 9, dy: 5 }, { dx: 0, dy: -8 }]
  if (count === 4) return [{ dx: -8, dy: -6 }, { dx: 8, dy: -6 }, { dx: -8, dy: 6 }, { dx: 8, dy: 6 }]
  return [{ dx: -10, dy: -8 }, { dx: 10, dy: -8 }, { dx: 0, dy: 0 }, { dx: -10, dy: 8 }, { dx: 10, dy: 8 }]
}

function spaceProps(num) {
  if (num === 1)          return { fill: '#064E3B', stroke: '#10B981', strokeW: 2, special: 'start'  }
  if (num === BOARD_SIZE) return { fill: '#7F1D1D', stroke: '#F43F5E', strokeW: 2, special: 'finish' }
  if (num % 10 === 0)     return { fill: '#1C1208', stroke: '#F59E0B', strokeW: 1.5, special: 'ckpt' }
  return                         { fill: '#141F35', stroke: '#1E2D4A', strokeW: 1,   special: null   }
}

function makeBurst(x, y, color, count = 20) {
  const base = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const speed = 22 + Math.random() * 44
    return {
      id: base + i, x, y, color,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed - 30,
      r:  1.8 + Math.random() * 3.5,
    }
  })
}

export default function Board({ players, currentReaderId }) {
  const activePlayers = players.filter(p => p.active)

  // ── Animated visual positions ──────────────────────────────────────────────
  const [visualPos, setVisualPos] = useState(() => {
    const init = {}; players.forEach(p => { init[p.id] = p.position }); return init
  })

  // ── Jump-arc elevation (Suggestion 1) ──────────────────────────────────────
  const [visualElevation, setVisualElevation] = useState(() => {
    const init = {}; players.forEach(p => { init[p.id] = 0 }); return init
  })

  // ── Particles (Suggestion 5) ───────────────────────────────────────────────
  const [particles, setParticles] = useState([])

  const prevPosRef = useRef({})
  const animRefs   = useRef({})

  const posKey = players.map(p => `${p.id}:${p.position}`).join(',')

  useEffect(() => {
    players.forEach(player => {
      const target = player.position
      const from   = prevPosRef.current[player.id] ?? target

      if (from !== target) {
        if (animRefs.current[player.id] != null) clearInterval(animRefs.current[player.id])

        // Suggestion 5 — particles on score (≥2 spaces, not from waiting area)
        const delta = target - from
        if (delta >= 2 && from >= 1 && target >= 1) {
          const pos = POS[target]
          if (pos) {
            const burst = makeBurst(pos.x, pos.y, player.color)
            setParticles(prev => [...prev, ...burst])
            const ids = new Set(burst.map(b => b.id))
            setTimeout(() => setParticles(prev => prev.filter(p => !ids.has(p.id))), 1400)
          }
        }

        let curr = from
        const step       = delta > 0 ? 1 : -1
        const totalSteps = Math.abs(delta)
        let   stepCount  = 0

        const id = setInterval(() => {
          curr += step
          stepCount++
          const progress  = stepCount / totalSteps
          const elevation = Math.sin(Math.PI * progress) * MAX_JUMP

          setVisualPos(v => ({ ...v, [player.id]: curr }))
          setVisualElevation(v => ({ ...v, [player.id]: elevation }))

          if (curr === target) {
            clearInterval(id)
            setVisualElevation(v => ({ ...v, [player.id]: 0 }))
            delete animRefs.current[player.id]
          }
        }, 55)
        animRefs.current[player.id] = id
      }

      prevPosRef.current[player.id] = target
    })
    return () => {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey])

  // Group tokens by visual position
  const byPosition = {}
  activePlayers.forEach(p => {
    const vp = visualPos[p.id] ?? p.position
    if (vp >= 1 && vp <= BOARD_SIZE) {
      if (!byPosition[vp]) byPosition[vp] = []
      byPosition[vp].push(p)
    }
  })
  const waiting = activePlayers.filter(p => (visualPos[p.id] ?? p.position) === 0)

  // Suggestion 3 — dynamic light follows the current reader's token
  const reader   = players.find(p => p.id === currentReaderId)
  const readerVP = reader ? (visualPos[reader.id] ?? reader.position) : null
  const lightPos = readerVP && readerVP >= 1 ? POS[readerVP] : null
  const lightColor = reader?.color ?? '#6366F1'

  return (
    <div style={{
      width: '100%',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid rgba(99,102,241,0.2)',
      boxShadow: '0 0 40px rgba(99,102,241,0.08), 0 20px 40px rgba(0,0,0,0.5)',
    }}>
      <svg viewBox="0 0 724 460" width="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#07091A"/>
            <stop offset="100%" stopColor="#0C1228"/>
          </linearGradient>
          <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#F59E0B"/>
            <stop offset="30%"  stopColor="#FCD34D"/>
            <stop offset="70%"  stopColor="#D97706"/>
            <stop offset="100%" stopColor="#F59E0B"/>
          </linearGradient>
          <linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(99,102,241,0.12)"/>
            <stop offset="50%"  stopColor="rgba(139,92,246,0.15)"/>
            <stop offset="100%" stopColor="rgba(99,102,241,0.12)"/>
          </linearGradient>
          <radialGradient id="spaceHL" cx="35%" cy="30%" r="65%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.18)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </radialGradient>
          <filter id="glowGold" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glowGreen" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glowRed" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="playerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="shadowBlur" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3"/>
          </filter>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.7" fill="rgba(99,102,241,0.15)"/>
          </pattern>

          {/* Suggestion 3 — dynamic light around reader's token */}
          {lightPos && (
            <radialGradient id="dynLight"
              cx={lightPos.x} cy={lightPos.y} r="95" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor={lightColor} stopOpacity="0.2"/>
              <stop offset="55%"  stopColor={lightColor} stopOpacity="0.06"/>
              <stop offset="100%" stopColor={lightColor} stopOpacity="0"/>
            </radialGradient>
          )}
        </defs>

        {/* Outer glow ring */}
        <rect x="0" y="0" width="724" height="460" rx="16"
          fill="none" stroke="rgba(99,102,241,0.35)" strokeWidth="1"/>

        {/* Board background */}
        <rect x="1" y="1" width="722" height="458" rx="15" fill="url(#bgGrad)"/>
        <rect x="1" y="1" width="722" height="458" rx="15" fill="url(#dots)" opacity="0.7"/>

        {/* Gold border */}
        <rect x="3" y="3" width="718" height="454" rx="13"
          fill="none" stroke="url(#goldBorder)" strokeWidth="2.5" opacity="0.65"/>
        <rect x="8" y="8" width="708" height="444" rx="10"
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>

        {/* Corner ornaments */}
        {[[14,14],[710,14],[14,446],[710,446]].map(([cx,cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="8" fill="url(#goldBorder)" opacity="0.55"/>
            <circle cx={cx} cy={cy} r="3.5" fill="#07091A"/>
            <circle cx={cx} cy={cy} r="1.5" fill="#F59E0B" opacity="0.8"/>
          </g>
        ))}

        {/* Title */}
        <text x="362" y="23" textAnchor="middle" fontFamily="Nunito, sans-serif"
          fontSize="13" fontWeight="900" letterSpacing="7" fill="#F59E0B" opacity="0.9">
          PERFIL
        </text>

        {/* Path track */}
        <polyline points={PATH_POINTS} fill="none"
          stroke="rgba(30,45,74,0.9)" strokeWidth="26"
          strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points={PATH_POINTS} fill="none"
          stroke="url(#pathGrad)" strokeWidth="20"
          strokeLinecap="round" strokeLinejoin="round"/>

        {/* Spaces */}
        {POS.slice(1).map((pos, i) => {
          const num   = i + 1
          const sp    = spaceProps(num)
          const glowId = sp.special === 'ckpt'   ? 'glowGold'
                       : sp.special === 'start'  ? 'glowGreen'
                       : sp.special === 'finish' ? 'glowRed'
                       : null
          return (
            <g key={num}>
              {sp.special === 'ckpt' && (
                <circle cx={pos.x} cy={pos.y} r={R + 5}
                  fill="rgba(245,158,11,0.08)" stroke="#F59E0B"
                  strokeWidth="1" opacity="0.5" filter="url(#glowGold)"/>
              )}
              {sp.special === 'start' && (
                <circle cx={pos.x} cy={pos.y} r={R + 5}
                  fill="rgba(16,185,129,0.1)" stroke="#10B981"
                  strokeWidth="1" opacity="0.6" filter="url(#glowGreen)"/>
              )}
              {sp.special === 'finish' && (
                <circle cx={pos.x} cy={pos.y} r={R + 5}
                  fill="rgba(244,63,94,0.1)" stroke="#F43F5E"
                  strokeWidth="1" opacity="0.6" filter="url(#glowRed)"/>
              )}
              <circle cx={pos.x} cy={pos.y} r={R} fill={sp.fill}
                stroke={sp.stroke} strokeWidth={sp.strokeW}
                filter={glowId ? `url(#${glowId})` : undefined}/>
              <circle cx={pos.x} cy={pos.y} r={R} fill="url(#spaceHL)"/>

              {sp.special === 'start' && (
                <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                  fontFamily="Nunito, sans-serif" fontSize="6.5" fontWeight="900" fill="#6EE7B7">
                  INÍCIO
                </text>
              )}
              {sp.special === 'finish' && (
                <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                  fontFamily="Nunito, sans-serif" fontSize="6.5" fontWeight="900" fill="#FDA4AF">
                  META
                </text>
              )}
              {sp.special === 'ckpt' && (
                <text x={pos.x} y={pos.y + 4} textAnchor="middle"
                  fontFamily="Nunito, sans-serif" fontSize="8" fontWeight="900" fill="#FCD34D">
                  {num}
                </text>
              )}
            </g>
          )
        })}

        {/* Suggestion 3 — dynamic light overlay */}
        {lightPos && (
          <rect x="0" y="0" width="724" height="460"
            fill="url(#dynLight)" style={{ pointerEvents: 'none' }}/>
        )}

        {/* Player tokens with jump-arc (Suggestion 1) */}
        {Object.entries(byPosition).map(([posStr, group]) => {
          const posData = POS[parseInt(posStr)]
          if (!posData) return null
          const offsets = tokenOffsets(group.length)
          return group.map((player, idx) => {
            const { dx, dy } = offsets[idx]
            const tx    = posData.x + dx
            const baseY = posData.y + dy
            const elev  = visualElevation[player.id] || 0
            const ty    = baseY - elev

            const shadowScale   = Math.max(0.3, 1 - elev / (MAX_JUMP * 1.7))
            const shadowOpacity = elev > 1 ? Math.max(0.06, 0.38 * shadowScale) : 0

            return (
              <g key={player.id}>
                {/* Jump shadow */}
                {shadowOpacity > 0 && (
                  <ellipse
                    cx={tx} cy={baseY + 4}
                    rx={R * 1.15 * shadowScale}
                    ry={R * 0.4 * shadowScale}
                    fill="black" opacity={shadowOpacity}
                    filter="url(#shadowBlur)"
                  />
                )}
                <g filter="url(#playerGlow)">
                  <circle cx={tx} cy={ty} r={R} fill="none"
                    stroke={player.color} strokeWidth="2.5" opacity="0">
                    <animate attributeName="r" values={`${R};${R * 2.4}`}
                      dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.9;0"
                      dur="2s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx={tx} cy={ty} r={R}
                    fill={player.color} stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>
                  <text x={tx} y={ty + 4.5} textAnchor="middle"
                    fontFamily="Space Grotesk, Nunito, sans-serif"
                    fontSize="11" fontWeight="700" fill="white">
                    {player.name.charAt(0).toUpperCase()}
                  </text>
                </g>
              </g>
            )
          })
        })}

        {/* Particles (Suggestion 5) */}
        {particles.map(p => (
          <circle key={p.id} cx={p.x} cy={p.y} r={p.r} fill={p.color}
            style={{
              animation: 'particleBurst 1.3s ease-out forwards',
              '--pdx': `${p.dx}px`,
              '--pdy': `${p.dy}px`,
              transformOrigin: `${p.x}px ${p.y}px`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Waiting players (position 0) */}
        {waiting.map((p, i) => {
          const start = POS[1]
          return (
            <g key={p.id} opacity="0.55">
              <circle cx={start.x - 32 - i * 26} cy={start.y} r={10}
                fill={p.color} stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>
              <text x={start.x - 32 - i * 26} y={start.y + 4}
                textAnchor="middle" fontFamily="Space Grotesk, Nunito, sans-serif"
                fontSize="9" fontWeight="700" fill="white">
                {p.name.charAt(0).toUpperCase()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

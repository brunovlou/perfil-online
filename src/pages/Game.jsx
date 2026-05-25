import { useState, useEffect } from 'react'
import Board from '../components/Board'
import Card from '../components/Card'
import {
  getState, subscribe,
  movePlayer, updatePlayerName, togglePlayerActive, setCurrentReader,
  toggleClue, revealAnswer, hideAnswer, resetGame, endRound,
  getApiKey, setApiKey, getFirebaseUrl, setFirebaseUrl,
  getDraftMode, setDraftMode, addDraftRejected, newMatch,
  getSoloMode, setSoloMode, endSoloRound, revealNextSoloClue,
} from '../utils/gameStore'
import { generateCard, generateDraftOptions, generateCardFromAnswer, generateSoloCard, validateAnswer } from '../utils/generateCard'

const CATEGORY_META = {
  PESSOA: { label: 'Pessoa', icon: '👤', gradient: 'linear-gradient(135deg,#4338CA,#6366F1,#818CF8)', color: '#6366F1', glow: 'rgba(99,102,241,0.4)' },
  COISA:  { label: 'Coisa',  icon: '📦', gradient: 'linear-gradient(135deg,#C2410C,#F97316,#FB923C)', color: '#F97316', glow: 'rgba(249,115,22,0.4)' },
  LUGAR:  { label: 'Lugar',  icon: '🌍', gradient: 'linear-gradient(135deg,#065F46,#10B981,#34D399)', color: '#10B981', glow: 'rgba(16,185,129,0.4)' },
  ANO:    { label: 'Ano',    icon: '📅', gradient: 'linear-gradient(135deg,#6D28D9,#A855F7,#C084FC)', color: '#A855F7', glow: 'rgba(168,85,247,0.4)' },
}

export default function Game() {
  const [state, setLocalState] = useState(getState)
  const [error, setError]       = useState('')
  const [showSettings, setShowSettings]     = useState(false)
  const [apiKeyInput, setApiKeyInput]       = useState(getApiKey)
  const [firebaseInput, setFirebaseInput]   = useState(getFirebaseUrl)
  const [tvMode, setTvMode]             = useState(false)
  const [serverReady, setServerReady]   = useState(false)

  // Verifica se o servidor tem chave configurada (para amigos sem chave local)
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(d => { if (d.ready) setServerReady(true) })
      .catch(() => {})
  }, [])

  // Modo Draft
  const [draftMode, setDraftModeLocal]   = useState(() => getDraftMode())
  const [draftLoading, setDraftLoading]  = useState(false)
  const [draftPhase, setDraftPhase]      = useState('idle') // 'idle' | 'selecting'
  const [draftData, setDraftData]        = useState(null)   // {category, pessoaSubtype, options}

  function toggleDraftMode() {
    const next = !draftMode
    setDraftModeLocal(next)
    setDraftMode(next)
    setDraftPhase('idle')
    setDraftData(null)
  }

  // Modo Solo
  const [soloMode, setSoloModeLocal]       = useState(() => getSoloMode())
  const [soloPhase, setSoloPhase]          = useState('playing') // 'playing' | 'result'
  const [soloResult, setSoloResult]        = useState(null)       // { winnerId, winnerName, score } | null (score=0 → ninguém)
  const [soloAnswer, setSoloAnswer]        = useState('')
  const [soloChecking, setSoloChecking]    = useState(false)
  const [soloSelectedPlayer, setSoloSelectedPlayer] = useState(null)
  const [soloWrong, setSoloWrong]          = useState(false)

  function toggleSoloMode() {
    const next = !soloMode
    setSoloModeLocal(next)
    setSoloMode(next)
    resetSoloState()
  }

  function resetSoloState() {
    setSoloPhase('playing')
    setSoloResult(null)
    setSoloAnswer('')
    setSoloChecking(false)
    setSoloSelectedPlayer(null)
    setSoloWrong(false)
  }

  async function handleSoloSubmit() {
    if (!card || !soloAnswer.trim() || soloChecking) return
    const pid = soloSelectedPlayer ?? activePlayers[0]?.id
    if (pid == null) return
    setSoloChecking(true)
    setSoloWrong(false)
    try {
      const correct = await validateAnswer(soloAnswer, card.answer)
      if (correct) {
        const revCount = card ? card.revealed.length : 0
        const score    = Math.max(0, 12 - revCount)
        const player   = activePlayers.find(p => p.id === pid)
        setSoloResult({ winnerId: pid, winnerName: player?.name ?? '', score })
        setSoloPhase('result')
      } else {
        setSoloWrong(true)
        setSoloAnswer('')
        setTimeout(() => setSoloWrong(false), 1800)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSoloChecking(false)
    }
  }

  function handleSoloNoWinner() {
    setSoloResult({ winnerId: null, winnerName: '', score: 0 })
    setSoloPhase('result')
  }

  function handleSoloContinue() {
    endSoloRound(soloResult?.winnerId ?? null)
    resetSoloState()
  }

  useEffect(() => subscribe(setLocalState), [])

  // ESC exits TV mode
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setTvMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { players, card, generating, currentReaderId } = state
  const activePlayers = players.filter(p => p.active)
  const currentReader = activePlayers.find(p => p.id === currentReaderId)
  const revealedCount = card ? card.revealed.length : 0
  const winnerScore   = Math.max(0, 20 - revealedCount)

  async function handleGenerate() {
    setError('')
    resetSoloState()

    if (soloMode) {
      try { await generateSoloCard() }
      catch (e) { setError(e.message) }
    } else if (draftMode) {
      setDraftLoading(true)
      try {
        const data = await generateDraftOptions()
        setDraftData(data)
        setDraftPhase('selecting')
      } catch (e) {
        setError(e.message)
      } finally {
        setDraftLoading(false)
      }
    } else {
      try { await generateCard() }
      catch (e) { setError(e.message) }
    }
  }

  async function handleDraftSelect(answer) {
    if (!draftData) return
    const rejected = draftData.options.filter(o => o !== answer)
    addDraftRejected(rejected)
    setDraftPhase('idle')
    setDraftData(null)
    setError('')
    try {
      await generateCardFromAnswer(answer, draftData.category, draftData.pessoaSubtype)
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSaveKey() {
    setApiKey(apiKeyInput)
    setFirebaseUrl(firebaseInput)
    setShowSettings(false)
    setError('')
  }

  const hasKey = !!getApiKey() || serverReady

  return (
    <div style={s.root}>

      {/* ── Top bar ── */}
      <div style={s.topBar}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <span style={s.logoDot}/>
          <span style={s.logo}>PERFIL</span>
        </div>

        {/* Center messages */}
        <div style={s.topCenter}>
          {error && (
            <div style={s.errorBadge}>
              <span style={{ fontSize: 13 }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {!hasKey && !error && (
            <div style={s.warnBadge}>
              <span style={{ fontSize: 13 }}>🔑</span>
              <span>API não configurada —{' '}
                <button onClick={() => setShowSettings(true)} style={s.inlineBtn}>
                  configurar agora
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div style={s.topRight}>
          {/* Solo mode toggle */}
          <button
            onClick={toggleSoloMode}
            title={soloMode ? 'Modo Solo ativo — clique para desativar' : 'Ativar Modo Solo (sistema lê as cartas)'}
            style={{
              ...s.btnDraft,
              background: soloMode
                ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(79,70,229,0.15))'
                : 'rgba(255,255,255,0.05)',
              border: soloMode
                ? '1px solid rgba(99,102,241,0.5)'
                : '1px solid rgba(255,255,255,0.08)',
              color: soloMode ? '#818CF8' : '#4B6080',
            }}
          >
            <span style={{ fontSize: 14 }}>🤖</span>
            <span>Solo{soloMode ? ' ON' : ''}</span>
          </button>

          {/* Draft mode toggle */}
          <button
            onClick={toggleDraftMode}
            title={draftMode ? 'Modo Draft ativo — clique para desativar' : 'Ativar Modo Draft'}
            style={{
              ...s.btnDraft,
              background: draftMode
                ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.15))'
                : 'rgba(255,255,255,0.05)',
              border: draftMode
                ? '1px solid rgba(16,185,129,0.5)'
                : '1px solid rgba(255,255,255,0.08)',
              color: draftMode ? '#34D399' : '#4B6080',
            }}
          >
            <span style={{ fontSize: 14 }}>🎯</span>
            <span>Draft{draftMode ? ' ON' : ''}</span>
          </button>

          <button
            onClick={handleGenerate}
            disabled={generating || draftLoading}
            style={{ ...s.btnGenerate, opacity: (generating || draftLoading) ? 0.65 : 1 }}
          >
            {(generating || draftLoading)
              ? <><SpinIcon/> {draftLoading ? 'Buscando…' : 'Gerando…'}</>
              : card ? '⟳  Nova Carta' : '✦  Gerar Carta'}
          </button>
          {card && (
            <button
              onClick={() => setTvMode(true)}
              style={s.btnTV}
              title="Modo TV — tela cheia para projetar"
            >
              📺
            </button>
          )}
          <button onClick={() => setShowSettings(true)} style={s.btnGear} title="Configurações">
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={s.main}>

        {/* LEFT: Board + Players */}
        <div style={s.left}>
          <Board players={players} currentReaderId={currentReaderId} />

          <div style={s.playersSection}>
            {/* Players header */}
            <div style={s.playersHeader}>
              <div style={s.sectionTitle}>
                <span style={s.sectionDot}/>
                <span style={s.sectionLabel}>JOGADORES</span>
                <span style={s.sectionCount}>{activePlayers.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => window.confirm('Nova partida? Todos voltam ao início, mas os jogadores são mantidos.') && newMatch()}
                  style={s.btnNewMatch}
                >
                  ↺ Nova Partida
                </button>
                <button
                  onClick={() => window.confirm('Resetar tudo? Nomes e posições voltam ao padrão.') && resetGame()}
                  style={s.btnReset}
                >
                  Resetar
                </button>
              </div>
            </div>

            {/* Player list */}
            <div style={s.playersList}>
              {players.map(player => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  isReader={player.id === currentReaderId}
                  card={card}
                  currentReaderId={currentReaderId}
                  revealedCount={revealedCount}
                  winnerScore={winnerScore}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Round panel + Card */}
        <div style={s.right}>

          {/* Round panel — solo or normal */}
          {soloMode && card ? (
            <SoloRoundPanel
              revealedCount={revealedCount}
              card={card}
              soloPhase={soloPhase}
              onRevealNext={revealNextSoloClue}
              onNoWinner={handleSoloNoWinner}
            />
          ) : soloMode ? (
            <SoloBanner hasKey={hasKey} />
          ) : card && currentReader ? (
            <RoundPanel reader={currentReader} revealedCount={revealedCount} card={card}/>
          ) : (
            <ReadyBanner reader={currentReader} hasKey={hasKey} onGenerate={handleGenerate} generating={generating}/>
          )}

          {/* Card area */}
          <div style={s.cardWrap}>
            {/* Solo result screen */}
            {soloMode && soloPhase === 'result' && soloResult ? (
              <SoloResultPanel
                result={soloResult}
                card={card}
                activePlayers={activePlayers}
                onContinue={handleSoloContinue}
              />
            ) : soloMode && card ? (
              /* Solo playing: card (no controls) + answer input */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 8 }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Card
                    card={card}
                    onToggleClue={() => {}}
                    onRevealAnswer={() => {}}
                    onHideAnswer={() => {}}
                    soloMode={true}
                  />
                </div>
                <SoloAnswerPanel
                  activePlayers={activePlayers}
                  selectedPlayer={soloSelectedPlayer}
                  onSelectPlayer={setSoloSelectedPlayer}
                  answer={soloAnswer}
                  onAnswerChange={setSoloAnswer}
                  onSubmit={handleSoloSubmit}
                  checking={soloChecking}
                  wrong={soloWrong}
                />
              </div>
            ) : draftPhase === 'selecting' && draftData ? (
              <DraftPanel
                data={draftData}
                onSelect={handleDraftSelect}
                onCancel={() => { setDraftPhase('idle'); setDraftData(null) }}
              />
            ) : card ? (
              <Card
                card={card}
                onToggleClue={toggleClue}
                onRevealAnswer={revealAnswer}
                onHideAnswer={hideAnswer}
              />
            ) : (
              <div style={s.emptyCard}>
                <span style={{ fontSize: 56, lineHeight: 1 }}>{soloMode ? '🤖' : '🃏'}</span>
                <p style={s.emptyTitle}>
                  {soloMode
                    ? 'Modo Solo ativo'
                    : currentReader
                      ? `Vez de ${currentReader.name} ler`
                      : 'Selecione um leitor primeiro'}
                </p>
                <p style={s.emptyHint}>
                  {soloMode
                    ? 'Clique em "Gerar Carta" — o sistema vai revelar as dicas'
                    : currentReader
                      ? draftMode
                        ? 'Clique em "Gerar Carta" — 4 opções aparecerão para o leitor escolher'
                        : 'Clique em "Gerar Carta" para iniciar a rodada'
                      : 'Clique na ★ ao lado do nome de um jogador'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TV Mode overlay ── */}
      {tvMode && card && (
        <TVOverlay card={card} onExit={() => setTvMode(false)} />
      )}

      {/* ── Settings modal ── */}
      {showSettings && (
        <div style={s.overlay} onClick={() => setShowSettings(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={{ fontSize: 28 }}>🔑</span>
              <div>
                <h2 style={s.modalTitle}>Chave da API</h2>
                <p style={s.modalSub}>OpenAI · platform.openai.com → API Keys</p>
              </div>
            </div>
            <p style={s.modalDesc}>
              A chave fica salva somente no seu navegador e é usada para gerar as cartas com IA.
            </p>
            <input
              type="password"
              placeholder="sk-proj-..."
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
              style={s.input}
              autoFocus
            />

            {/* Firebase URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', letterSpacing: '1px' }}>
                🔥 FIREBASE — URL do banco de dados
              </label>
              <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                Garante que nenhuma carta se repita, em qualquer dispositivo ou navegador.
                Obtenha em <span style={{ color: '#F59E0B' }}>firebase.google.com → Realtime Database</span>
              </p>
              <input
                type="text"
                placeholder="https://seu-projeto-default-rtdb.firebaseio.com"
                value={firebaseInput}
                onChange={e => setFirebaseInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                style={{ ...s.input, borderColor: firebaseInput ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.25)' }}
              />
              {firebaseInput && (
                <span style={{ fontSize: 11, color: '#10B981' }}>✓ Firebase configurado — histórico permanente ativo</span>
              )}
            </div>
            <div style={s.modalActions}>
              <button onClick={() => setShowSettings(false)} style={s.btnCancel}>Cancelar</button>
              <button onClick={handleSaveKey} style={s.btnSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Solo banner (no card yet) ──
function SoloBanner({ hasKey }) {
  if (!hasKey) return null
  return (
    <div style={{ ...s.readyBanner, borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <span style={{ color: '#818CF8', fontWeight: 700, fontSize: 14 }}>Modo Solo</span>
        <span style={{ color: '#4B6080', fontSize: 13 }}>— o sistema revela as dicas, jogadores digitam a resposta</span>
      </div>
    </div>
  )
}

// ── Solo round panel (replaces RoundPanel in solo mode) ──
function SoloRoundPanel({ revealedCount, card, soloPhase, onRevealNext, onNoWinner }) {
  const total      = card.clues.length
  const allRevealed = revealedCount >= total
  const isPlaying  = soloPhase === 'playing'

  return (
    <div style={{ ...s.roundPanel, borderColor: 'rgba(99,102,241,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Solo badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 8, padding: '5px 12px',
        }}>
          <span style={{ fontSize: 14 }}>🤖</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', letterSpacing: '1px' }}>MODO SOLO</span>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Clue counter */}
        <div style={s.scorePill}>
          <span style={{ color: '#4B6080', fontSize: 10, fontWeight: 600 }}>DICAS</span>
          <span style={{ color: '#818CF8', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
            {revealedCount}/{total}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onRevealNext}
          disabled={!isPlaying || allRevealed}
          style={{
            flex: 1,
            background: (!isPlaying || allRevealed)
              ? 'rgba(255,255,255,0.03)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.2))',
            border: (!isPlaying || allRevealed)
              ? '1px solid rgba(255,255,255,0.06)'
              : '1px solid rgba(99,102,241,0.4)',
            color: (!isPlaying || allRevealed) ? '#2A3A52' : '#A5B4FC',
            padding: '8px 16px', borderRadius: 9,
            fontWeight: 700, fontSize: 13, cursor: (!isPlaying || allRevealed) ? 'default' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}
        >
          {allRevealed ? '✓ Todas as dicas reveladas' : '▶ Revelar próxima dica'}
        </button>
        <button
          onClick={onNoWinner}
          disabled={!isPlaying}
          style={{ ...s.btnNoWinner, opacity: isPlaying ? 1 : 0.4 }}
        >
          Ninguém acertou
        </button>
      </div>
    </div>
  )
}

// ── Solo answer input panel ──
function SoloAnswerPanel({ activePlayers, selectedPlayer, onSelectPlayer, answer, onAnswerChange, onSubmit, checking, wrong }) {
  const effectivePlayer = selectedPlayer ?? activePlayers[0]?.id

  return (
    <div style={solo.panel}>
      {/* Player selector */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {activePlayers.map(p => {
          const sel = p.id === effectivePlayer
          return (
            <button
              key={p.id}
              onClick={() => onSelectPlayer(p.id)}
              style={{
                padding: '5px 12px', borderRadius: 8,
                background: sel ? p.color : 'rgba(255,255,255,0.04)',
                border: sel ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: sel ? 'white' : '#4B6080',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
                boxShadow: sel ? `0 0 10px ${p.color}60` : 'none',
              }}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      {/* Input + submit */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={answer}
          onChange={e => onAnswerChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
          placeholder="Digite a resposta..."
          disabled={checking}
          style={{
            ...solo.input,
            borderColor: wrong ? 'rgba(248,113,113,0.5)' : 'rgba(99,102,241,0.3)',
            boxShadow: wrong ? '0 0 12px rgba(248,113,113,0.2)' : 'none',
          }}
          autoComplete="off"
        />
        <button
          onClick={onSubmit}
          disabled={checking || !answer.trim()}
          style={{
            ...solo.submitBtn,
            opacity: (checking || !answer.trim()) ? 0.5 : 1,
          }}
        >
          {checking ? <SpinIcon/> : 'Confirmar'}
        </button>
      </div>

      {/* Wrong feedback */}
      {wrong && (
        <div style={solo.wrongMsg}>
          ❌ Resposta incorreta — tente novamente!
        </div>
      )}
    </div>
  )
}

// ── Solo result panel (winner or no winner) ──
function SoloResultPanel({ result, card, activePlayers, onContinue }) {
  const hasWinner = result.winnerId !== null
  const winner    = hasWinner ? activePlayers.find(p => p.id === result.winnerId) : null
  const meta      = CATEGORY_META[card?.category] || {
    label: '', gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.3)',
  }

  return (
    <div style={solo.result}>
      {/* Icon */}
      <div style={{ fontSize: 56, lineHeight: 1 }}>
        {hasWinner ? '🏆' : '😔'}
      </div>

      {/* Headline */}
      <div style={solo.resultTitle}>
        {hasWinner ? 'CORRETO!' : 'NINGUÉM ACERTOU'}
      </div>

      {/* Winner info */}
      {hasWinner && winner && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={solo.resultWinner}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: winner.color,
              boxShadow: `0 0 8px ${winner.color}`,
            }}/>
            <span>{winner.name} acertou!</span>
          </div>
          <div style={{ ...solo.resultScore, color: meta.color }}>
            +{result.score} casas
          </div>
        </div>
      )}

      {/* Answer reveal */}
      <div style={solo.resultAnswerBox}>
        <span style={solo.resultAnswerLabel}>A RESPOSTA ERA</span>
        <span style={{ ...solo.resultAnswer, color: meta.color, textShadow: `0 0 20px ${meta.glow}` }}>
          {card?.answer}
        </span>
      </div>

      {/* Continue */}
      <button onClick={onContinue} style={solo.continueBtn}>
        Continuar →
      </button>
    </div>
  )
}

// ── Ready / empty banner ──
function ReadyBanner({ reader, hasKey, onGenerate, generating }) {
  if (!hasKey) return null
  if (!reader)  return null
  return (
    <div style={s.readyBanner}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ ...s.readerDot, background: reader.color }}/>
        <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: 14 }}>
          {reader.name}
        </span>
        <span style={{ color: '#4B6080', fontSize: 13 }}>vai ler esta rodada</span>
      </div>
    </div>
  )
}

// ── Round action panel ──
function RoundPanel({ reader, revealedCount, card }) {
  const readerScore = revealedCount
  const winnerScore = Math.max(0, 20 - revealedCount)

  return (
    <div style={{ ...s.roundPanel, borderColor: `${reader.color}55` }}>
      {/* Reader info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: reader.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: 'white',
          boxShadow: `0 0 12px ${reader.color}88`,
          flexShrink: 0,
        }}>
          {reader.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>
            {reader.name}
          </div>
          <div style={{ fontSize: 11, color: '#4B6080', fontWeight: 500 }}>
            leitor desta rodada
          </div>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Score pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={s.scorePill}>
            <span style={{ color: '#4B6080', fontSize: 10, fontWeight: 600 }}>LEITOR</span>
            <span style={{ color: reader.color, fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
              +{readerScore}
            </span>
          </div>
          <div style={{ color: '#2A3A52', fontSize: 18 }}>·</div>
          <div style={s.scorePill}>
            <span style={{ color: '#4B6080', fontSize: 10, fontWeight: 600 }}>VENCEDOR</span>
            <span style={{ color: '#F59E0B', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
              +{winnerScore}
            </span>
          </div>
        </div>
      </div>

      {/* Dicas info + no winner btn */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <div style={{
          fontSize: 12, color: '#4B6080', fontWeight: 500,
          background: 'rgba(255,255,255,0.04)', borderRadius: 8,
          padding: '4px 10px',
        }}>
          {revealedCount} dica{revealedCount !== 1 ? 's' : ''} revelada{revealedCount !== 1 ? 's' : ''}
        </div>
        <div style={{ flex: 1 }}/>
        <button
          onClick={() => endRound(null)}
          style={s.btnNoWinner}
          title="Ninguém acertou — só o leitor anda"
        >
          Ninguém acertou → leitor +{readerScore}
        </button>
      </div>
    </div>
  )
}

// ── Player row ──
function PlayerRow({ player, isReader, card, currentReaderId, revealedCount, winnerScore }) {
  const hasCard    = !!card
  const showTrophy = hasCard && currentReaderId !== null && player.active && !isReader

  return (
    <div style={{
      ...s.playerRow,
      opacity: player.active ? 1 : 0.35,
      borderColor: isReader ? `${player.color}60` : 'rgba(255,255,255,0.05)',
      background: isReader
        ? `linear-gradient(90deg, ${player.color}18 0%, rgba(13,21,48,0.9) 100%)`
        : 'rgba(255,255,255,0.02)',
      boxShadow: isReader ? `0 0 20px ${player.color}20` : 'none',
    }}>

      {/* Reader toggle */}
      <button
        onClick={() => player.active && setCurrentReader(player.id)}
        disabled={!player.active}
        title={isReader ? 'Leitor desta rodada' : 'Definir como leitor'}
        style={{
          fontSize: 18, lineHeight: 1,
          color: isReader ? player.color : '#1E2D4A',
          padding: '0 3px',
          transition: 'color 0.2s',
          flexShrink: 0,
          filter: isReader ? `drop-shadow(0 0 6px ${player.color})` : 'none',
        }}
      >
        {isReader ? '★' : '☆'}
      </button>

      {/* Color dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: player.color,
        flexShrink: 0,
        boxShadow: isReader ? `0 0 8px ${player.color}` : 'none',
      }}/>

      {/* Name input */}
      <input
        value={player.name}
        onChange={e => updatePlayerName(player.id, e.target.value)}
        disabled={!player.active}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: '#E2E8F0', fontWeight: 600, fontSize: '13px',
          fontFamily: 'inherit', minWidth: 0,
        }}
      />

      {/* Position controls */}
      {player.active && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <button onClick={() => movePlayer(player.id, -1)} style={s.btnArrow}>◀</button>
          <span style={s.posLabel}>Casa {player.position}</span>
          <button onClick={() => movePlayer(player.id,  1)} style={s.btnArrow}>▶</button>
        </div>
      )}

      {/* Trophy button */}
      {showTrophy && (
        <button
          onClick={() => endRound(player.id)}
          title={`${player.name} acertou! +${winnerScore} casas`}
          style={s.btnTrophy}
        >
          🏆 +{winnerScore}
        </button>
      )}

      {/* Activate/deactivate */}
      <button
        onClick={() => togglePlayerActive(player.id)}
        title={player.active ? 'Remover jogador' : 'Adicionar jogador'}
        style={{
          fontSize: 14, fontWeight: 700, flexShrink: 0,
          color: player.active ? '#2A3A52' : '#22c55e',
          padding: '2px 4px',
          transition: 'color 0.2s',
        }}
      >
        {player.active ? '✕' : '+'}
      </button>
    </div>
  )
}

function SpinIcon() {
  return <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span>
}

// ── Draft Panel ──
function DraftPanel({ data, onSelect, onCancel }) {
  const meta = CATEGORY_META[data.category] || {
    label: data.category, icon: '❓',
    gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.4)',
  }

  return (
    <div style={draft.wrap}>
      {/* Header */}
      <div style={{ ...draft.header, background: meta.gradient }}>
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.25)', borderRadius:'12px 12px 0 0' }}/>
        <div style={{ position:'relative', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize: 28 }}>{meta.icon}</span>
          <div>
            <div style={draft.headerLabel}>{meta.label.toUpperCase()}</div>
            {data.pessoaSubtype && (
              <div style={draft.headerSub}>{data.pessoaSubtype.tipo}</div>
            )}
          </div>
        </div>
        <div style={{ position:'relative' }}>
          <div style={draft.headerHint}>Leitor: escolha um tema</div>
        </div>
      </div>

      {/* Options */}
      <div style={draft.optionsGrid}>
        {data.options.map((opt, i) => (
          <button key={i} onClick={() => onSelect(opt)} style={{ ...draft.optionBtn, '--c': meta.color }}>
            <div style={{ ...draft.optionNum, background: meta.color }}>
              {i + 1}
            </div>
            <span style={draft.optionText}>{opt}</span>
            <span style={{ fontSize: 16, color: meta.color, opacity: 0.7, flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>

      {/* Cancel */}
      <button onClick={onCancel} style={draft.cancelBtn}>
        ✕ Cancelar
      </button>
    </div>
  )
}

// ── TV / Presentation overlay ──
function TVOverlay({ card, onExit }) {
  const meta = CATEGORY_META[card.category] || {
    label: card.category, icon: '❓',
    gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.4)',
  }
  const revealedClues = card.clues
    .map((text, i) => ({ text, i, revealed: card.revealed.includes(i) }))
    .filter(c => c.revealed)

  return (
    <div style={tv.overlay}>
      {/* Exit button */}
      <button onClick={onExit} style={tv.exitBtn} title="Sair (ESC)">
        ✕ Sair
      </button>

      {/* Category header */}
      <div style={{ ...tv.header, background: meta.gradient }}>
        <div style={tv.headerShine}/>
        <span style={tv.headerIcon}>{meta.icon}</span>
        <span style={tv.headerLabel}>{meta.label.toUpperCase()}</span>
        <div style={tv.headerBadge}>
          {revealedClues.length} dica{revealedClues.length !== 1 ? 's' : ''} revelada{revealedClues.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Answer — shown if already revealed, hidden otherwise (no button) */}
      <div style={tv.answerRow}>
        <span style={tv.answerLabel}>RESPOSTA</span>
        {card.answerRevealed ? (
          <span style={{ ...tv.answerText, color: meta.color,
            textShadow: `0 0 30px ${meta.glow}` }}>
            {card.answer}
          </span>
        ) : (
          <span style={tv.answerDots}>
            {'● '.repeat(Math.min(Math.ceil(card.answer.length / 2), 10)).trim()}
          </span>
        )}
      </div>

      {/* Clues grid */}
      <div style={tv.cluesArea}>
        {card.clues.map((clue, i) => {
          const revealed = card.revealed.includes(i)
          return (
            <div key={i} style={{
              ...tv.clueRow,
              background: revealed
                ? `linear-gradient(90deg, rgba(${hexToRgbTV(meta.color)},0.1) 0%, transparent 80%)`
                : 'rgba(255,255,255,0.02)',
              borderLeft: revealed ? `3px solid ${meta.color}` : '3px solid transparent',
              opacity: revealed ? 1 : 0.2,
            }}>
              <div style={{
                ...tv.clueNum,
                background: revealed ? meta.color : 'rgba(255,255,255,0.08)',
                boxShadow: revealed ? `0 0 12px ${meta.glow}` : 'none',
              }}>
                {i + 1}
              </div>
              <span style={{
                ...tv.clueText,
                color: revealed ? '#F1F5F9' : '#1E3050',
              }}>
                {revealed ? clue : '● ● ● ●'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function hexToRgbTV(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!r) return '99,102,241'
  return `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}`
}

// ── Styles ──
const s = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(160deg, #07091A 0%, #0A1020 50%, #070D1E 100%)',
    overflow: 'hidden',
    fontFamily: "'Space Grotesk', sans-serif",
  },

  // Top bar
  topBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'rgba(10,16,36,0.95)',
    borderBottom: '1px solid rgba(99,102,241,0.15)',
    backdropFilter: 'blur(20px)',
    flexShrink: 0,
    gap: 14,
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
  },
  logoDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366F1, #A855F7)',
    boxShadow: '0 0 8px #6366F1',
    display: 'inline-block',
  },
  logo: {
    fontSize: 20, fontWeight: 800, letterSpacing: 4,
    background: 'linear-gradient(135deg, #818CF8 0%, #A855F7 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  topCenter: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
  },
  topRight: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
  },
  errorBadge: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 12, color: '#FCA5A5',
    background: 'rgba(127,29,29,0.4)',
    border: '1px solid rgba(220,38,38,0.3)',
    padding: '5px 12px', borderRadius: 99,
    maxWidth: 380,
  },
  warnBadge: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 12, color: '#FDE68A',
    background: 'rgba(120,53,15,0.3)',
    border: '1px solid rgba(245,158,11,0.25)',
    padding: '5px 12px', borderRadius: 99,
  },
  inlineBtn: {
    color: '#F59E0B', fontWeight: 700, fontSize: 12,
    textDecoration: 'underline', cursor: 'pointer',
    background: 'none', border: 'none', fontFamily: 'inherit',
  },
  btnGenerate: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    color: 'white', padding: '9px 20px',
    borderRadius: 10, fontWeight: 700, fontSize: 13,
    cursor: 'pointer', border: 'none',
    boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
    transition: 'opacity 0.2s, transform 0.1s',
    fontFamily: 'inherit',
  },
  btnDraft: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    letterSpacing: '0.5px',
  },
  btnGear: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#94A3B8', padding: '8px 11px',
    borderRadius: 10, fontSize: 16, cursor: 'pointer',
  },
  btnTV: {
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.3)',
    color: '#818CF8', padding: '8px 11px',
    borderRadius: 10, fontSize: 16, cursor: 'pointer',
  },

  // Layout
  main: {
    flex: 1, display: 'flex', overflow: 'hidden', gap: 0,
  },
  left: {
    flex: '0 0 55%', display: 'flex', flexDirection: 'column',
    padding: '14px 12px 14px 16px', gap: 12, overflow: 'hidden',
    borderRight: '1px solid rgba(99,102,241,0.1)',
  },
  right: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '14px 16px 14px 12px', gap: 10, overflow: 'hidden',
  },

  // Players section
  playersSection: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 8,
  },
  playersHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  sectionDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366F1, #A855F7)',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: '#4B6080', letterSpacing: '2px',
  },
  sectionCount: {
    fontSize: 11, fontWeight: 700, color: '#6366F1',
    background: 'rgba(99,102,241,0.15)', borderRadius: 99,
    padding: '1px 7px',
  },
  btnNewMatch: {
    fontSize: 11, fontWeight: 700, color: '#6EE7B7',
    background: 'rgba(5,78,55,0.3)',
    border: '1px solid rgba(16,185,129,0.25)',
    padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnReset: {
    fontSize: 11, fontWeight: 700, color: '#F87171',
    background: 'rgba(127,29,29,0.3)',
    border: '1px solid rgba(220,38,38,0.2)',
    padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  playersList: {
    flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5,
  },

  // Player row
  playerRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '7px 11px', borderRadius: 11,
    border: '1px solid',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },
  readerDot: {
    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  },
  btnArrow: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: '#94A3B8',
    padding: '3px 7px', borderRadius: 6, fontSize: 11,
    fontWeight: 700, cursor: 'pointer', flexShrink: 0,
    fontFamily: 'inherit',
  },
  posLabel: {
    fontSize: 11, color: '#4B6080', fontWeight: 600,
    whiteSpace: 'nowrap', flexShrink: 0,
    minWidth: 52, textAlign: 'center',
  },
  btnTrophy: {
    background: 'linear-gradient(135deg, #78350F, #92400E)',
    color: '#FCD34D',
    border: '1px solid rgba(245,158,11,0.35)',
    padding: '4px 11px', borderRadius: 7,
    fontSize: 11, fontWeight: 800,
    cursor: 'pointer', flexShrink: 0,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
  },

  // Round panel
  readyBanner: {
    background: 'rgba(99,102,241,0.06)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: 12, padding: '10px 16px', flexShrink: 0,
  },
  roundPanel: {
    background: 'rgba(13,21,48,0.8)',
    backdropFilter: 'blur(12px)',
    border: '1px solid',
    borderRadius: 14, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
  },
  scorePill: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, padding: '5px 14px',
  },
  btnNoWinner: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#64748B', padding: '6px 14px',
    borderRadius: 8, fontWeight: 600, fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },

  // Card area
  cardWrap: {
    flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  emptyCard: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.015)',
    border: '1px dashed rgba(99,102,241,0.15)',
    borderRadius: 16, gap: 12, textAlign: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 15, color: '#94A3B8', fontWeight: 700,
  },
  emptyHint: {
    fontSize: 13, color: '#2A3A52', fontWeight: 500,
  },

  // Modal
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: 'linear-gradient(160deg, #0D1530 0%, #111A2E 100%)',
    borderRadius: 20, padding: '28px 30px',
    width: 440,
    border: '1px solid rgba(99,102,241,0.2)',
    boxShadow: '0 0 60px rgba(99,102,241,0.15), 0 24px 48px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column', gap: 18,
  },
  modalHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 14,
  },
  modalTitle: {
    fontSize: 20, fontWeight: 800, color: '#F1F5F9',
  },
  modalSub: {
    fontSize: 12, color: '#6366F1', fontWeight: 600, marginTop: 2,
  },
  modalDesc: {
    fontSize: 13, color: '#64748B', lineHeight: 1.6,
  },
  input: {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: 10, color: '#E2E8F0',
    padding: '12px 14px', fontSize: 14,
    width: '100%', outline: 'none',
    fontFamily: 'inherit',
  },
  modalActions: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
  },
  btnCancel: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#94A3B8', padding: '10px 20px',
    borderRadius: 10, fontWeight: 600, fontSize: 14,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnSave: {
    background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    color: 'white', border: 'none',
    padding: '10px 22px', borderRadius: 10,
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
  },
}

// TV overlay styles (separate from s to avoid clutter)
const tv = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'linear-gradient(160deg, #06080F 0%, #0A1020 100%)',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Space Grotesk', sans-serif",
    overflow: 'hidden',
  },
  exitBtn: {
    position: 'absolute', top: 18, right: 22, zIndex: 10,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#64748B', padding: '8px 16px',
    borderRadius: 10, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  header: {
    padding: '22px 36px',
    display: 'flex', alignItems: 'center', gap: 18,
    flexShrink: 0, position: 'relative', overflow: 'hidden',
  },
  headerShine: {
    position: 'absolute', top: 0, left: '-15%',
    width: '50%', height: '100%',
    background: 'rgba(255,255,255,0.08)',
    transform: 'skewX(-20deg)', pointerEvents: 'none',
  },
  headerIcon: { fontSize: 40, lineHeight: 1 },
  headerLabel: {
    fontSize: 28, fontWeight: 800, color: 'white',
    letterSpacing: 6, flex: 1,
    textShadow: '0 2px 12px rgba(0,0,0,0.4)',
  },
  headerBadge: {
    background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 99, padding: '6px 18px',
    fontSize: 14, fontWeight: 700, color: 'white',
  },
  answerRow: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '16px 36px',
    background: 'rgba(0,0,0,0.4)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  answerLabel: {
    fontSize: 11, fontWeight: 700, color: '#4B6080', letterSpacing: '3px',
  },
  answerText: {
    fontSize: 30, fontWeight: 800, flex: 1,
  },
  answerDots: {
    fontSize: 20, color: '#1E3050', letterSpacing: '6px', flex: 1,
  },
  cluesArea: {
    flex: 1, overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px',
    padding: '8px 0',
    alignContent: 'start',
  },
  clueRow: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '10px 28px',
    transition: 'all 0.2s',
    minHeight: 44,
  },
  clueNum: {
    minWidth: 30, height: 30, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0,
    transition: 'all 0.2s',
  },
  clueText: {
    fontSize: 15, lineHeight: 1.4, flex: 1,
    transition: 'color 0.2s',
  },
}

// Solo mode styles
const solo = {
  panel: {
    flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: 8,
    background: 'rgba(13,21,48,0.85)',
    border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 14, padding: '12px 14px',
  },
  input: {
    flex: 1,
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid',
    borderRadius: 10, color: '#E2E8F0',
    padding: '10px 14px', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  submitBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    color: 'white', border: 'none',
    padding: '10px 20px', borderRadius: 10,
    fontWeight: 700, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap', flexShrink: 0,
    boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
    transition: 'opacity 0.2s',
  },
  wrongMsg: {
    fontSize: 12, color: '#F87171', fontWeight: 600,
    background: 'rgba(127,29,29,0.3)',
    border: '1px solid rgba(220,38,38,0.25)',
    borderRadius: 8, padding: '6px 12px',
    textAlign: 'center',
    animation: 'fadeIn 0.2s ease',
  },

  // Result screen
  result: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 18, padding: 24, textAlign: 'center',
    background: 'rgba(255,255,255,0.015)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: 16,
  },
  resultTitle: {
    fontSize: 28, fontWeight: 900, letterSpacing: 4,
    background: 'linear-gradient(135deg, #818CF8, #A855F7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  resultWinner: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 18, fontWeight: 700, color: '#F1F5F9',
  },
  resultScore: {
    fontSize: 32, fontWeight: 900, lineHeight: 1,
  },
  resultAnswerBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: '14px 28px',
    marginTop: 4,
  },
  resultAnswerLabel: {
    fontSize: 10, fontWeight: 700, color: '#4B6080', letterSpacing: '3px',
  },
  resultAnswer: {
    fontSize: 24, fontWeight: 800,
  },
  continueBtn: {
    background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    color: 'white', border: 'none',
    padding: '12px 32px', borderRadius: 12,
    fontWeight: 700, fontSize: 15,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
    marginTop: 4,
  },
}

// Draft panel styles
const draft = {
  wrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    borderRadius: 16, overflow: 'hidden',
    border: '1px solid rgba(99,102,241,0.2)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    background: 'linear-gradient(160deg, #0A1020 0%, #0D1530 100%)',
  },
  header: {
    padding: '18px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0, position: 'relative', overflow: 'hidden',
    borderRadius: '12px 12px 0 0',
  },
  headerLabel: {
    fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: 4,
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  },
  headerSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600,
    marginTop: 2, letterSpacing: 1,
  },
  headerHint: {
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
    background: 'rgba(0,0,0,0.3)', borderRadius: 99,
    padding: '5px 14px', border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  optionsGrid: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
    padding: '10px 0', overflowY: 'auto',
  },
  optionBtn: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 20px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.02)',
    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: '#E2E8F0', fontFamily: 'inherit', textAlign: 'left',
    transition: 'background 0.15s, transform 0.1s',
    width: '100%',
  },
  optionNum: {
    minWidth: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0,
  },
  optionText: {
    flex: 1, fontSize: 15, fontWeight: 700, color: '#F1F5F9',
    lineHeight: 1.3,
  },
  cancelBtn: {
    margin: '10px 20px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#64748B', padding: '9px 16px',
    borderRadius: 10, fontWeight: 600, fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
}

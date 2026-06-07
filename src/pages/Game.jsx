import { useState, useEffect, useRef, useCallback } from 'react'
import Board from '../components/Board'
import Card from '../components/Card'
import {
  getState, subscribe,
  movePlayer, updatePlayerName, togglePlayerActive, setCurrentReader,
  toggleClue, revealAnswer, hideAnswer, resetGame, endRound,
  getApiKey, setApiKey, getFirebaseUrl, setFirebaseUrl,
  getDraftMode, setDraftMode, addDraftRejected, newMatch,
  getSoloMode, setSoloMode, endSoloRound, revealNextSoloClue,
  getTimerMode, setTimerMode,
  getLeitorMode, setLeitorMode,
} from '../utils/gameStore'
import { generateCard, generateDraftOptions, generateCardFromAnswer, generateSoloCard, validateAnswer } from '../utils/generateCard'

// ── Zoações ────────────────────────────────────────────────────────────────
const TAUNTS = {
  wrongSolo: (name) => [
    `Putz, ${name}! Minha vó sabia essa 👵`,
    `${name} passou batido... próxima vida vai! 💀`,
    `Anotou aí, ${name}? Estuda mais! 📚`,
    `Nossa ${name}, isso tava na cara! 😂`,
    `${name} errou feio. FEIO mesmo 🤦`,
    `Alguém avisa ${name} que o jogo começou? 😅`,
    `${name}: 0 × Perfil: 1 💀`,
    `${name} foi ali e já volta 👋`,
  ],
  wonEasy: (name, n) => [
    `${name} na ${n}ª dica?! Tá colando! 👀`,
    `Ninguém segura ${name} hoje! 🔥`,
    `Só ${n} dica${n !== 1 ? 's' : ''}?! ${name} tá dominando 🚀`,
    `${name} nem deixou a gente pensar! 🤯`,
    `${name} no modo deus. Alguém para esse cara 😤`,
  ],
  wonHard: (name, n) => [
    `${name} precisou de ${n} dicas... mas chegou lá! 👏`,
    `Só na ${n}ª dica ${name} pegou. Quase 😂`,
    `${name} foi de tartaruga, mas chegou! 🐢`,
    `${n} dicas pra ${name}. Mas valeu, né! 😅`,
    `${name} sofreu, mas ganhou. Que emoção 🥹`,
  ],
  farBehind: (name) => [
    `${name}, o jogo começou faz tempo! 🐢`,
    `Ei ${name}, tá dormindo? Acorda! 😴`,
    `${name} ligou o modo contemplativo 🧘`,
    `${name} tá curioso pra saber como é o último lugar 😆`,
    `Força, ${name}! Ainda dá pra ganhar... talvez 🫡`,
    `${name} tá usando a estratégia do INSS: vai devagar 🐌`,
  ],
  overtake: (mover, passed) => [
    `${mover} deixou ${passed} pra trás! Ciao! 👋`,
    `${mover} passou ${passed} na curva sem nem olhar 😎`,
    `${passed} olha pra trás e vê ${mover} passando! 😆`,
    `${mover} voou! ${passed} ficou na poeira 🌪️`,
    `Tchau, ${passed}! ${mover} tá na frente agora 🏃`,
    `${passed} levou uma rasteira de ${mover}! 💨`,
  ],
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

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

  // Modo Leitor
  const [leitorMode, setLeitorModeLocal] = useState(() => getLeitorMode())

  function toggleLeitorMode() {
    const next = !leitorMode
    setLeitorModeLocal(next)
    setLeitorMode(next)
  }

  // Timer por dica
  const [timerMode, setTimerModeLocal]   = useState(() => getTimerMode())
  const [timerSeconds, setTimerSeconds]  = useState(60)
  const [timerActive, setTimerActive]    = useState(false)
  const [timerExpired, setTimerExpired]  = useState(false)
  const prevRevealedRef = useRef(0)

  function toggleTimerMode() {
    const next = !timerMode
    setTimerModeLocal(next)
    setTimerMode(next)
    if (!next) { setTimerActive(false); setTimerSeconds(60); setTimerExpired(false) }
  }

  // Modo Solo
  const [soloMode, setSoloModeLocal]         = useState(() => getSoloMode())
  const [soloPhase, setSoloPhase]            = useState('playing') // 'playing' | 'result'
  const [soloResult, setSoloResult]          = useState(null)       // { winnerId, score } | null
  const [soloAnswer, setSoloAnswer]          = useState('')
  const [soloChecking, setSoloChecking]      = useState(false)
  const [soloCurrentGuesserId, setSoloCurrentGuesserId] = useState(null) // id do jogador da vez
  const [soloWrong, setSoloWrong]            = useState(false)

  function toggleSoloMode() {
    const next = !soloMode
    setSoloModeLocal(next)
    setSoloMode(next)
    resetSoloState(null)
  }

  // guesterId = quem começa a próxima carta (null = não definido ainda)
  function resetSoloState(firstGuesserId = null) {
    setSoloPhase('playing')
    setSoloResult(null)
    setSoloAnswer('')
    setSoloChecking(false)
    setSoloCurrentGuesserId(firstGuesserId)
    setSoloWrong(false)
  }

  // Avança para o próximo jogador ativo na rotação
  function advanceSoloGuesser(currentId, players) {
    const active = players.filter(p => p.active)
    if (active.length === 0) return
    const idx  = active.findIndex(p => p.id === currentId)
    const next = active[(idx >= 0 ? idx + 1 : 0) % active.length]
    setSoloCurrentGuesserId(next.id)
  }

  async function handleSoloSubmit() {
    if (!card || !soloAnswer.trim() || soloChecking || soloPhase !== 'playing') return
    const pid = soloCurrentGuesserId ?? state.players.filter(p => p.active)[0]?.id
    if (pid == null) return

    setSoloChecking(true)
    setSoloWrong(false)
    try {
      const correct = await validateAnswer(soloAnswer, card.answer)
      if (correct) {
        const revCount = card.revealed.length
        const score    = Math.max(0, 12 - revCount)
        setSoloResult({ winnerId: pid, score })
        setSoloPhase('result')
        // Zoação baseada na facilidade
        const guesser = state.players.find(p => p.id === pid)
        if (guesser) {
          if (revCount <= 2)      addToast(pickRandom(TAUNTS.wonEasy(guesser.name, revCount + 1)))
          else if (revCount >= 9) addToast(pickRandom(TAUNTS.wonHard(guesser.name, revCount + 1)))
        }
      } else {
        setSoloAnswer('')
        // Zoação pelo erro
        const guesser = state.players.find(p => p.id === pid)
        if (guesser) addToast(pickRandom(TAUNTS.wrongSolo(guesser.name)))

        // Verifica se ainda há dicas para revelar
        if (card.revealed.length >= 12) {
          setSoloResult({ winnerId: null, score: 0 })
          setSoloPhase('result')
        } else {
          revealNextSoloClue()
          advanceSoloGuesser(pid, state.players)
          setSoloWrong(true)
          setTimeout(() => setSoloWrong(false), 1400)
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSoloChecking(false)
    }
  }

  function handleSoloNoWinner() {
    setSoloResult({ winnerId: null, score: 0 })
    setSoloPhase('result')
  }

  function handleSoloContinue() {
    endSoloRound(soloResult?.winnerId ?? null)
    checkFarBehind(soloResult?.winnerId ?? null)
    resetSoloState(null)
  }

  // ── Toast / Zoação ────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-2), { id, message, exiting: false }])
    // marca como saindo antes de remover para animar
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    }, 5500)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 6000)
  }, [])

  // Detecção de ultrapassagens
  const prevPositionsRef = useRef({})
  useEffect(() => {
    const active = state.players.filter(p => p.active)
    const prev   = prevPositionsRef.current

    const overtakes = []
    for (const mover of active) {
      const prevPos = prev[mover.id]
      if (prevPos === undefined || mover.position <= prevPos) continue
      for (const other of active) {
        if (other.id === mover.id) continue
        const otherPrev = prev[other.id] ?? other.position
        // mover estava atrás, agora está igual ou à frente — e o outro já tinha saído do 0
        if (prevPos < otherPrev && mover.position >= other.position && otherPrev > 0) {
          overtakes.push({ mover: mover.name, passed: other.name })
        }
      }
    }

    prevPositionsRef.current = Object.fromEntries(active.map(p => [p.id, p.position]))

    overtakes.slice(0, 2).forEach((o, i) => {
      setTimeout(() => addToast(pickRandom(TAUNTS.overtake(o.mover, o.passed))), i * 900)
    })
  }, [state.players, addToast])

  // ── Timer effects ─────────────────────────────────────────────────────────
  const revealedLength = state.card?.revealed.length ?? 0

  // Nova carta gerada (ou carta removida): volta para 60s e fica PARADO
  useEffect(() => {
    setTimerActive(false)
    setTimerSeconds(60)
    setTimerExpired(false)
    prevRevealedRef.current = 0
  }, [state.card?.answer])

  // Inicia o cronômetro quando uma nova dica é revelada
  useEffect(() => {
    if (!timerMode || !state.card) return
    if (revealedLength > prevRevealedRef.current) {
      setTimerSeconds(60)
      setTimerActive(true)
      setTimerExpired(false)
    }
    prevRevealedRef.current = revealedLength
  }, [revealedLength, timerMode, state.card?.answer])

  // Countdown de 1s em 1s
  useEffect(() => {
    if (!timerActive || !timerMode) return
    const id = setInterval(() => {
      setTimerSeconds(s => {
        if (s <= 1) {
          setTimerActive(false)
          setTimerExpired(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timerActive, timerMode])

  // Para o timer quando a rodada solo termina (resultado exibido)
  useEffect(() => {
    if (soloPhase === 'result') { setTimerActive(false); setTimerExpired(false) }
  }, [soloPhase])

  // Zoação para quem está muito atrás do líder (>25 casas)
  function checkFarBehind(excludeId = null) {
    const active = state.players.filter(p => p.active && p.id !== excludeId)
    if (active.length < 2) return
    const leader   = active.reduce((a, b) => a.position > b.position ? a : b)
    const laggards = active.filter(p => p.id !== leader.id && leader.position - p.position > 25)
    if (laggards.length === 0) return
    const target = laggards[Math.floor(Math.random() * laggards.length)]
    setTimeout(() => addToast(pickRandom(TAUNTS.farBehind(target.name))), 1600)
  }

  // Encerramento de rodada normal com zoação
  function handleEndRound(winnerId) {
    setTimerActive(false)
    setTimerExpired(false)
    if (winnerId !== null) {
      const player = activePlayers.find(p => p.id === winnerId)
      if (player) {
        if (revealedCount <= 3) {
          addToast(pickRandom(TAUNTS.wonEasy(player.name, revealedCount)))
        } else if (revealedCount >= 15) {
          addToast(pickRandom(TAUNTS.wonHard(player.name, revealedCount)))
        }
      }
    }
    endRound(winnerId)
    checkFarBehind(winnerId)
  }

  useEffect(() => subscribe(setLocalState), [])


  const { players, card, generating, currentReaderId } = state
  const activePlayers = players.filter(p => p.active)
  const currentReader = activePlayers.find(p => p.id === currentReaderId)
  const revealedCount = card ? card.revealed.length : 0
  const winnerScore   = Math.max(0, 20 - revealedCount)

  async function handleGenerate() {
    setError('')
    resetSoloState()

    if (soloMode) {
      // Quem começa: o próximo na fila (currentReaderId já foi rotacionado pelo endSoloRound)
      const activePl   = state.players.filter(p => p.active)
      const firstId    = state.currentReaderId ?? activePl[0]?.id ?? null
      resetSoloState(firstId)
      try {
        await generateSoloCard()
        // Revela automaticamente a primeira dica ao gerar a carta
        revealNextSoloClue()
      } catch (e) { setError(e.message) }
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

          {/* ── Grupo: Modos ── */}
          <div style={s.modeGroupBtns}>

              <button
                onClick={toggleSoloMode}
                title={soloMode ? 'Modo Solo ativo — clique para desativar' : 'Ativar Modo Solo'}
                style={{
                  ...s.modeBtn,
                  background: soloMode ? 'rgba(99,102,241,0.18)' : 'transparent',
                  color: soloMode ? '#818CF8' : '#4B6080',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={s.modeBtnIcon}>🤖</span>
                <span>Solo</span>
                {soloMode && <span style={{ ...s.onDot, background: '#818CF8' }}/>}
              </button>

              <button
                onClick={toggleDraftMode}
                title={draftMode ? 'Modo Draft ativo — clique para desativar' : 'Ativar Modo Draft'}
                style={{
                  ...s.modeBtn,
                  background: draftMode ? 'rgba(16,185,129,0.18)' : 'transparent',
                  color: draftMode ? '#34D399' : '#4B6080',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={s.modeBtnIcon}>🎯</span>
                <span>Draft</span>
                {draftMode && <span style={{ ...s.onDot, background: '#34D399' }}/>}
              </button>

              <button
                onClick={toggleLeitorMode}
                title={leitorMode ? 'Modo Leitor ativo — clique para desativar' : 'Ativar Modo Leitor (requer Draft ON)'}
                style={{
                  ...s.modeBtn,
                  background: leitorMode && draftMode ? 'rgba(236,72,153,0.18)' : 'transparent',
                  color: leitorMode && draftMode ? '#F9A8D4' : '#4B6080',
                  opacity: leitorMode && !draftMode ? 0.4 : 1,
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={s.modeBtnIcon}>👁</span>
                <span>Leitor</span>
                {leitorMode && draftMode && <span style={{ ...s.onDot, background: '#F9A8D4' }}/>}
              </button>

              <button
                onClick={toggleTimerMode}
                title={timerMode ? 'Timer ativo — clique para desativar' : 'Ativar Timer (1 min por dica)'}
                style={{
                  ...s.modeBtn,
                  background: timerMode ? 'rgba(245,158,11,0.18)' : 'transparent',
                  color: timerMode ? '#FCD34D' : '#4B6080',
                }}
              >
                <span style={s.modeBtnIcon}>⏱</span>
                <span>Timer</span>
                {timerMode && <span style={{ ...s.onDot, background: '#FCD34D' }}/>}
              </button>

          </div>

          {/* ── Separador ── */}
          <div style={s.topSep}/>

          {/* ── Ações ── */}
          <button
            onClick={handleGenerate}
            disabled={generating || draftLoading}
            style={{ ...s.btnGenerate, opacity: (generating || draftLoading) ? 0.65 : 1 }}
          >
            {(generating || draftLoading)
              ? <><SpinIcon/> {draftLoading ? 'Buscando…' : 'Gerando…'}</>
              : card ? '⟳  Nova Carta' : '✦  Gerar Carta'}
          </button>

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
                  onEndRound={handleEndRound}
                  soloMode={soloMode}
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
              currentPlayer={activePlayers.find(p => p.id === soloCurrentGuesserId) ?? activePlayers[0]}
              onNoWinner={handleSoloNoWinner}
            />
          ) : soloMode ? (
            <SoloBanner hasKey={hasKey} />
          ) : card && currentReader ? (
            <RoundPanel reader={currentReader} revealedCount={revealedCount} card={card} onEndRound={handleEndRound}/>
          ) : (
            <ReadyBanner reader={currentReader} hasKey={hasKey} onGenerate={handleGenerate} generating={generating}/>
          )}

          {/* Timer bar */}
          {timerMode && card && (
            <TimerBar seconds={timerSeconds} expired={timerExpired} />
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
                  currentPlayer={activePlayers.find(p => p.id === soloCurrentGuesserId) ?? activePlayers[0]}
                  answer={soloAnswer}
                  onAnswerChange={setSoloAnswer}
                  onSubmit={handleSoloSubmit}
                  checking={soloChecking}
                  wrong={soloWrong}
                  disabled={soloPhase !== 'playing'}
                />
              </div>
            ) : draftPhase === 'selecting' && draftData ? (
              leitorMode ? (
                <LeitorDraftPanel
                  data={draftData}
                  onSelect={handleDraftSelect}
                  onCancel={() => { setDraftPhase('idle'); setDraftData(null) }}
                />
              ) : (
                <DraftPanel
                  data={draftData}
                  onSelect={handleDraftSelect}
                  onCancel={() => { setDraftPhase('idle'); setDraftData(null) }}
                />
              )
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

      {/* ── Toast / Zoação ── */}
      <ToastContainer toasts={toasts} />

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
function SoloRoundPanel({ revealedCount, card, soloPhase, currentPlayer, onNoWinner }) {
  const total     = card.clues.length
  const isPlaying = soloPhase === 'playing'

  return (
    <div style={{ ...s.roundPanel, borderColor: 'rgba(99,102,241,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Solo badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 8, padding: '5px 12px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13 }}>🤖</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#818CF8', letterSpacing: '1px' }}>MODO SOLO</span>
        </div>

        {/* Current guesser */}
        {currentPlayer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: currentPlayer.color,
              boxShadow: `0 0 8px ${currentPlayer.color}`,
              flexShrink: 0,
            }}/>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>{currentPlayer.name}</span>
            <span style={{ fontSize: 12, color: '#4B6080' }}>chuta agora</span>
          </div>
        )}

        {/* Clue counter */}
        <div style={s.scorePill}>
          <span style={{ color: '#4B6080', fontSize: 10, fontWeight: 600 }}>DICAS</span>
          <span style={{ color: '#818CF8', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
            {revealedCount}/{total}
          </span>
        </div>
      </div>

      {/* Encerrar rodada antecipadamente */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNoWinner}
          disabled={!isPlaying}
          style={{ ...s.btnNoWinner, opacity: isPlaying ? 1 : 0.4 }}
        >
          Encerrar sem vencedor
        </button>
      </div>
    </div>
  )
}

// ── Solo answer input panel ──
function SoloAnswerPanel({ currentPlayer, answer, onAnswerChange, onSubmit, checking, wrong, disabled }) {
  return (
    <div style={solo.panel}>
      {/* Who's guessing */}
      {currentPlayer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: currentPlayer.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: 'white',
            flexShrink: 0,
            boxShadow: `0 0 10px ${currentPlayer.color}80`,
          }}>
            {currentPlayer.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', lineHeight: 1 }}>
              {currentPlayer.name}
            </span>
            <span style={{ fontSize: 10, color: '#4B6080', fontWeight: 500 }}>
              sua vez de adivinhar
            </span>
          </div>
        </div>
      )}

      {/* Input + submit */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={answer}
          onChange={e => onAnswerChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !disabled && onSubmit()}
          placeholder="Digite a resposta..."
          disabled={checking || disabled}
          style={{
            ...solo.input,
            borderColor: wrong
              ? 'rgba(248,113,113,0.5)'
              : 'rgba(99,102,241,0.3)',
            boxShadow: wrong ? '0 0 12px rgba(248,113,113,0.2)' : 'none',
          }}
          autoComplete="off"
          autoFocus
        />
        <button
          onClick={onSubmit}
          disabled={checking || !answer.trim() || disabled}
          style={{
            ...solo.submitBtn,
            opacity: (checking || !answer.trim() || disabled) ? 0.45 : 1,
          }}
        >
          {checking ? <SpinIcon/> : 'Confirmar'}
        </button>
      </div>

      {/* Wrong feedback */}
      {wrong && (
        <div style={solo.wrongMsg}>
          ❌ Errou! Próxima dica revelada…
        </div>
      )}
    </div>
  )
}

// ── Solo result panel (winner or no winner) ──
function SoloResultPanel({ result, card, activePlayers, onContinue }) {
  const hasWinner = result?.winnerId !== null && result?.winnerId !== undefined
  const winner    = hasWinner ? activePlayers.find(p => p.id === result.winnerId) : null
  const meta      = CATEGORY_META[card?.category] || {
    label: '', gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.3)',
  }

  return (
    <div style={solo.result}>
      {/* Icon */}
      <div style={{ fontSize: 52, lineHeight: 1 }}>
        {hasWinner ? '🏆' : '😔'}
      </div>

      {/* Headline */}
      <div style={solo.resultTitle}>
        {hasWinner ? 'CORRETO!' : 'NINGUÉM ACERTOU'}
      </div>

      {/* Winner info */}
      {hasWinner && winner && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={solo.resultWinner}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: winner.color,
              boxShadow: `0 0 10px ${winner.color}`,
              flexShrink: 0,
            }}/>
            <span style={{ color: winner.color }}>{winner.name}</span>
            <span style={{ color: '#94A3B8' }}>acertou!</span>
          </div>
          <div style={{ ...solo.resultScore, color: winner.color }}>
            +{result.score} {result.score === 1 ? 'casa' : 'casas'}
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
function RoundPanel({ reader, revealedCount, card, onEndRound }) {
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
          onClick={() => onEndRound(null)}
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
function PlayerRow({ player, isReader, card, currentReaderId, revealedCount, winnerScore, onEndRound, soloMode }) {
  const hasCard    = !!card
  const showTrophy = hasCard && currentReaderId !== null && player.active && !isReader && !soloMode

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
          onClick={() => onEndRound(player.id)}
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

// ── Timer bar ──
function TimerBar({ seconds, expired }) {
  const radius = 18
  const circ   = 2 * Math.PI * radius
  const offset = circ * (1 - (expired ? 0 : seconds / 60))

  const color = expired        ? '#EF4444'
    : seconds <= 10            ? '#EF4444'
    : seconds <= 20            ? '#F97316'
    : seconds <= 35            ? '#F59E0B'
    :                            '#10B981'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: expired ? 'rgba(127,29,29,0.25)' : 'rgba(13,21,48,0.7)',
      border: `1px solid ${expired ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, padding: '7px 14px',
      flexShrink: 0,
      animation: expired ? 'timerPulse 0.9s ease-in-out infinite' : 'none',
    }}>

      {/* Ring */}
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3"/>
        <circle
          cx="22" cy="22" r={radius} fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
          style={{ transition: expired ? 'none' : 'stroke-dashoffset 0.95s linear, stroke 0.4s' }}
        />
        <text x="22" y="27" textAnchor="middle"
          fontSize="13" fontWeight="900" fill={color}
          fontFamily="'Space Grotesk', sans-serif">
          {expired ? '!' : seconds}
        </text>
      </svg>

      {/* Label */}
      <div style={{ flex: 1 }}>
        {expired ? (
          <div style={{ color: '#EF4444', fontWeight: 800, fontSize: 14, letterSpacing: '0.5px' }}>
            ⏰ Tempo esgotado!
          </div>
        ) : (
          <>
            <div style={{ color: '#4B6080', fontSize: 9, fontWeight: 700, letterSpacing: '1.5px' }}>
              TEMPO POR DICA
            </div>
            <div style={{ color, fontSize: 17, fontWeight: 800, lineHeight: 1.2, transition: 'color 0.4s' }}>
              {seconds}s
            </div>
          </>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        flex: 2, height: 5, borderRadius: 3,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${expired ? 0 : (seconds / 60) * 100}%`,
          background: color, borderRadius: 3,
          transition: expired ? 'none' : 'width 0.95s linear, background-color 0.4s',
          boxShadow: `0 0 6px ${color}60`,
        }}/>
      </div>
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

// ── Leitor Draft Panel — TV mostra categoria + números + QR (sem nomes) ──
function LeitorDraftPanel({ data, onSelect, onCancel }) {
  const meta = CATEGORY_META[data.category] || {
    label: data.category, icon: '❓',
    gradient: 'linear-gradient(135deg,#374151,#6B7280)',
    color: '#6B7280', glow: 'rgba(107,114,128,0.4)',
  }

  // URL que o leitor escaneia no celular — contém as 4 opções com nomes
  const origin = window.location.origin
  const phoneUrl = (() => {
    const params = new URLSearchParams()
    params.set('leitor', '')
    params.set('mode', 'draft')
    params.set('c', data.category)
    data.options.forEach((opt, i) => params.set(`o${i + 1}`, opt))
    return `${origin}/?${params.toString()}`
  })()
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=0D1530&color=FFFFFF&qzone=1&data=${encodeURIComponent(phoneUrl)}`

  return (
    <div style={leitor.wrap}>
      {/* Category header */}
      <div style={{ ...leitor.catHeader, background: meta.gradient }}>
        <div style={leitor.catShine}/>
        <span style={leitor.catIcon}>{meta.icon}</span>
        <span style={leitor.catLabel}>{meta.label.toUpperCase()}</span>
        {data.pessoaSubtype && (
          <span style={leitor.catSub}>{data.pessoaSubtype.tipo}</span>
        )}
        <div style={leitor.catBadge}>👁 Modo Leitor</div>
      </div>

      {/* Body: blocks + QR side by side */}
      <div style={leitor.body}>
        {/* 4 numbered blocks */}
        <div style={leitor.blocksGrid}>
          {data.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onSelect(opt)}
              style={{ ...leitor.block, '--bc': meta.color }}
            >
              <div style={{ ...leitor.blockNum, background: meta.color, boxShadow: `0 0 20px ${meta.glow}` }}>
                {i + 1}
              </div>
              <span style={leitor.blockHint}>Clique para escolher</span>
            </button>
          ))}
        </div>

        {/* QR code */}
        <div style={leitor.qrSide}>
          <div style={leitor.qrFrame}>
            <img src={qrSrc} alt="QR" style={leitor.qrImg}/>
          </div>
          <div style={leitor.qrCaption}>
            <span style={leitor.qrTitle}>📱 Leitor: escaneie aqui</span>
            <span style={leitor.qrHint}>As 4 opções aparecem apenas no seu celular</span>
          </div>
        </div>
      </div>

      {/* Cancel */}
      <button onClick={onCancel} style={leitor.cancelBtn}>✕ Cancelar</button>
    </div>
  )
}


// ── Toast container ──
function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null
  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 8,
      zIndex: 500,
      pointerEvents: 'none',
      alignItems: 'center',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(13,21,48,0.98))',
          border: '2px solid rgba(99,102,241,0.6)',
          borderRadius: 16,
          padding: '15px 26px',
          fontSize: 16,
          fontWeight: 700,
          color: '#F1F5F9',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 32px rgba(99,102,241,0.25)',
          backdropFilter: 'blur(16px)',
          whiteSpace: 'nowrap',
          maxWidth: '88vw',
          letterSpacing: '0.2px',
          animation: t.exiting
            ? 'toastOut 0.4s ease forwards'
            : 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
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
  // Grupo de modos
  modeGroupBtns: {
    display: 'flex', alignItems: 'stretch',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, overflow: 'hidden',
  },
  modeBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '7px 12px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
    border: 'none', position: 'relative',
    letterSpacing: '0.3px',
  },
  modeBtnIcon: { fontSize: 13, lineHeight: 1 },
  onDot: {
    width: 5, height: 5, borderRadius: '50%',
    display: 'inline-block', flexShrink: 0,
    boxShadow: '0 0 6px currentColor',
  },
  topSep: {
    width: 1, height: 28, background: 'rgba(255,255,255,0.08)',
    flexShrink: 0, alignSelf: 'center',
  },
  btnGear: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#94A3B8', padding: '8px 11px',
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

// Leitor Draft Panel styles
const leitor = {
  wrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    borderRadius: 16, overflow: 'hidden',
    border: '1px solid rgba(236,72,153,0.25)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    background: 'linear-gradient(160deg, #0A1020 0%, #0D1530 100%)',
  },
  catHeader: {
    padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: 12,
    flexShrink: 0, position: 'relative', overflow: 'hidden',
  },
  catShine: {
    position: 'absolute', top: 0, left: '-15%',
    width: '50%', height: '100%',
    background: 'rgba(255,255,255,0.09)',
    transform: 'skewX(-20deg)', pointerEvents: 'none',
  },
  catIcon: { fontSize: 24, lineHeight: 1, position: 'relative' },
  catLabel: {
    fontSize: 18, fontWeight: 800, color: 'white',
    letterSpacing: 4, flex: 1, position: 'relative',
    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  catSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600,
    letterSpacing: 1, position: 'relative',
  },
  catBadge: {
    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
    border: '1px solid rgba(236,72,153,0.4)',
    borderRadius: 99, padding: '4px 12px',
    fontSize: 11, fontWeight: 700, color: '#F9A8D4',
    whiteSpace: 'nowrap', position: 'relative',
  },
  body: {
    flex: 1, display: 'flex', gap: 0, overflow: 'hidden',
  },
  blocksGrid: {
    flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 10, padding: 16, alignContent: 'center',
  },
  block: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '20px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '2px solid rgba(255,255,255,0.08)',
    borderRadius: 16, cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
    fontFamily: 'inherit',
    ':hover': { background: 'rgba(255,255,255,0.08)' },
  },
  blockNum: {
    width: 56, height: 56, borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, fontWeight: 900, color: 'white',
    flexShrink: 0,
  },
  blockHint: {
    fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.5px',
    textAlign: 'center',
  },
  qrSide: {
    width: 180, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 14,
    padding: '16px 16px 16px 0', flexShrink: 0,
  },
  qrFrame: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14, padding: 10,
  },
  qrImg: {
    width: 120, height: 120, borderRadius: 8, display: 'block',
  },
  qrCaption: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    textAlign: 'center',
  },
  qrTitle: {
    fontSize: 12, fontWeight: 700, color: '#F9A8D4',
  },
  qrHint: {
    fontSize: 10, color: '#4B6080', lineHeight: 1.4, maxWidth: 140,
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

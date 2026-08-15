// App shell — lobby vs game view, overlays, error toast.
import { useEffect, useState } from 'react'
import { connect, emit } from './socket'
import { useStore } from './store'
import { Lobby } from './components/Lobby'
import { Board } from './components/Board'
import { ShipMat } from './components/ShipMat'
import { AuctionPanel } from './components/AuctionPanel'
import { Scoreboard } from './components/Scoreboard'
import { GameLog } from './components/GameLog'
import { ScoreOverlay } from './components/ScoreOverlay'
import { ScoringReference } from './components/ScoringReference'
import { OptionsMenu } from './components/OptionsMenu'

export function App() {
  useEffect(() => {
    connect()
  }, [])

  const [showRules, setShowRules] = useState(false)
  const [outline, setOutline] = useState(() => localStorage.getItem('medici:outline') !== '0')
  const toggleOutline = (v: boolean) => {
    setOutline(v)
    localStorage.setItem('medici:outline', v ? '1' : '0')
  }
  const [piecesAsSymbols, setPiecesAsSymbols] = useState(() => localStorage.getItem('medici:pieces') === '1')
  const togglePieces = (v: boolean) => {
    setPiecesAsSymbols(v)
    localStorage.setItem('medici:pieces', v ? '1' : '0')
  }
  const [fastBots, setFastBots] = useState(() => localStorage.getItem('medici:fastBots') === '1')
  const toggleFastBots = (v: boolean) => {
    setFastBots(v)
    localStorage.setItem('medici:fastBots', v ? '1' : '0')
    emit('game:setSpeed', { fast: v })
  }

  const room = useStore((s) => s.room)
  const game = useStore((s) => s.game)
  const scoredGame = useStore((s) => s.scoredGame)
  const gameOver = useStore((s) => s.gameOver)
  const yourId = useStore((s) => s.yourId)
  const error = useStore((s) => s.error)
  const scheme = useStore((s) => s.playerScheme)
  const setScheme = useStore((s) => s.setPlayerScheme)
  const isHost = room?.hostId === yourId

  // Re-assert the speed preference whenever a room loads (new room or reload).
  useEffect(() => {
    if (room && fastBots) emit('game:setSpeed', { fast: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  if (!room || !game) {
    return (
      <>
        <Lobby />
        {error && <div className="toast">{error}</div>}
      </>
    )
  }

  const dayPhase =
    game.phase === 'scoring' ? 'Scoring…' : game.phase === 'game_over' ? 'Game over' : `Day ${game.day} of 3`

  // Out of the round: your ship is full, so you watch the rest of the day.
  const shipCapacity = game.playerOrder.length === 2 ? 7 : 5
  const me = game.players.find((p) => p.id === yourId)
  const outForDay =
    !!me && (game.phase === 'draw' || game.phase === 'auction') && me.ship.length >= shipCapacity

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">Medici</div>
        <div className="app-room">
          Room <strong>{room.code}</strong>
        </div>
        <div className="app-day">{dayPhase}</div>
        <div className="app-deck">
          Deck: {game.deckCount} · discarded {game.discarded.length}
        </div>
        <button className="btn btn-small btn-header" onClick={() => setShowRules(true)}>
          Scoring
        </button>
        <button
          className="btn btn-small btn-header btn-leave"
          onClick={() => emit('room:leave')}
          title="Leave this game"
        >
          Leave
        </button>
        {outForDay && (
          <button
            className={`btn btn-small btn-header btn-speed ${fastBots ? 'is-on' : ''}`}
            onClick={() => toggleFastBots(!fastBots)}
            title="Your ship is full — speed up the bots so the round finishes faster"
          >
            {fastBots ? 'Fast bots: on' : 'Speed up'}
          </button>
        )}
        <OptionsMenu
          outline={outline}
          onToggleOutline={toggleOutline}
          symbols={piecesAsSymbols}
          onToggleSymbols={togglePieces}
          scheme={scheme}
          onSchemeChange={setScheme}
        />
        <div className="app-players">
          {room.players.map((p) => (
            <span key={p.id} className={`app-player ${p.disconnected ? 'away' : ''}`}>
              {p.name}
              {p.id === yourId ? ' (you)' : ''}
            </span>
          ))}
        </div>
      </header>

      <Scoreboard game={game} yourId={yourId} />

      <main className="app-main">
        <div className="board-wrap">
          <Board game={game} outline={outline} piecesAsSymbols={piecesAsSymbols} />
        </div>
        <aside className="app-side">
          <AuctionPanel game={game} yourId={yourId} />
          <div className="ships">
            {game.playerOrder.map((id) => {
              const rp = room.players.find((p) => p.id === id)
              return (
                <ShipMat
                  key={id}
                  game={game}
                  playerId={id}
                  name={rp?.name ?? id}
                  isBot={!!rp?.isBot}
                  disconnected={!!rp?.disconnected}
                  isYou={id === yourId}
                />
              )
            })}
          </div>
          <GameLog game={game} />
        </aside>
      </main>

      {scoredGame && <ScoreOverlay game={scoredGame} yourId={yourId} isHost={isHost} onShowRules={() => setShowRules(true)} />}
      {gameOver && <ScoreOverlay game={gameOver} yourId={yourId} isHost={isHost} onShowRules={() => setShowRules(true)} />}
      {showRules && <ScoringReference onClose={() => setShowRules(false)} />}
      {error && <div className="toast">{error}</div>}
    </div>
  )
}

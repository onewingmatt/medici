// App shell — lobby vs game view, overlays, error toast.
import { useEffect } from 'react'
import { connect } from './socket'
import { useStore } from './store'
import { Lobby } from './components/Lobby'
import { Board } from './components/Board'
import { ShipMat } from './components/ShipMat'
import { AuctionPanel } from './components/AuctionPanel'
import { ScoreOverlay } from './components/ScoreOverlay'

export function App() {
  useEffect(() => {
    connect()
  }, [])

  const room = useStore((s) => s.room)
  const game = useStore((s) => s.game)
  const scoredGame = useStore((s) => s.scoredGame)
  const gameOver = useStore((s) => s.gameOver)
  const yourId = useStore((s) => s.yourId)
  const error = useStore((s) => s.error)

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
        <div className="app-players">
          {room.players.map((p) => (
            <span key={p.id} className={`app-player ${p.disconnected ? 'away' : ''}`}>
              {p.name}
              {p.id === yourId ? ' (you)' : ''}
            </span>
          ))}
        </div>
      </header>

      <main className="app-main">
        <div className="board-wrap">
          <Board game={game} />
        </div>
        <aside className="app-side">
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
          <AuctionPanel game={game} yourId={yourId} />
        </aside>
      </main>

      {scoredGame && <ScoreOverlay game={scoredGame} yourId={yourId} />}
      {gameOver && <ScoreOverlay game={gameOver} yourId={yourId} />}
      {error && <div className="toast">{error}</div>}
    </div>
  )
}

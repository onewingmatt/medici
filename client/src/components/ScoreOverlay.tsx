// Day scoring overlay — animates the scoring log, then the game-over screen
// with final standings.
import { COMMODITY_COLORS } from './Board'
import type { Commodity } from '../../../shared/constants'
import type { ClientGame } from '../types'
import { emit } from '../socket'
import { useStore } from '../store'

export function ScoreOverlay({
  game,
  yourId,
  onShowRules,
}: {
  game: ClientGame
  yourId: string | null
  onShowRules?: () => void
}) {
  const dismissScored = useStore((s) => s.dismissScored)
  const isGameOver = game.phase === 'game_over'
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id
  const you = game.players.find((p) => p.id === yourId)

  const dayTotals = game.scoringLog.filter((e) => e.type === 'day_total')
  const lastDay = dayTotals[dayTotals.length - 1]
  const shipEvents = game.scoringLog.filter((e) => e.type === 'ship_value')
  const shipLines = shipEvents[shipEvents.length - 1]
  const trackEvents = game.scoringLog.filter((e) => e.type === 'track')
  const lastTracks = trackEvents.slice(-5)

  return (
    <div className="overlay-backdrop">
      <div className="overlay-card">
        <h2 className="overlay-title">{isGameOver ? 'Game Over' : `Day ${game.day} scored`}</h2>

        {!isGameOver && shipLines?.type === 'ship_value' && (
          <div className="overlay-section">
            <h3>Ship values</h3>
            <table className="score-table">
              <tbody>
                {[...shipLines.lines]
                  .sort((a, b) => b.payment - a.payment)
                  .map((l) => (
                    <tr key={l.playerId}>
                      <td>{nameOf(l.playerId)}</td>
                      <td>value {l.shipValue}</td>
                      <td className="num">+{l.payment}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!isGameOver &&
          lastTracks.map((e) => {
            if (e.type !== 'track') return null
            const color = COMMODITY_COLORS[e.commodity as Commodity]
            return (
              <div className="overlay-section" key={e.commodity}>
                <h3 style={{ color }}>
                  {e.commodity.toUpperCase()}
                </h3>
                <table className="score-table">
                  <tbody>
                    {[...e.lines]
                      .sort((a, b) => b.total - a.total)
                      .map((l) => (
                        <tr key={l.playerId}>
                          <td>{nameOf(l.playerId)}</td>
                          <td>level {l.level}</td>
                          <td className="num">
                            +{l.award}
                            {l.bonus > 0 ? ` (+${l.bonus} bonus)` : ''}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )
          })}

        {!isGameOver && lastDay?.type === 'day_total' && (
          <div className="overlay-section">
            <h3>Totals</h3>
            <table className="score-table">
              <tbody>
                {[...lastDay.totals]
                  .sort((a, b) => b.money - a.money)
                  .map((t) => (
                    <tr key={t.playerId}>
                      <td>{nameOf(t.playerId)}</td>
                      <td className="num">{t.money} florins</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {isGameOver && (
          <div className="overlay-section">
            <h3>Final standings</h3>
            <table className="score-table">
              <tbody>
                {(game.finalResults ?? []).map((r, i) => {
                  const isWinner = i === 0 || r.money === game.finalResults?.[0]?.money
                  return (
                    <tr key={r.playerId} className={isWinner ? 'winner-row' : ''}>
                      <td>
                        {i + 1}. {nameOf(r.playerId)}
                        {isWinner ? ' — winner' : ''}
                      </td>
                      <td className="num">{r.money} florins</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="overlay-note">
              {you && game.finalResults && game.finalResults[0].money === you.money
                ? 'You win — the Medici fortunes smile on you!'
                : 'The richest merchant takes the day.'}
            </p>
          </div>
        )}

        <div className="overlay-actions">
          {isGameOver ? (
            <button className="btn btn-primary" onClick={() => emit('game:restart')}>
              Play again
            </button>
          ) : (
            <>
              {onShowRules && (
                <button className="btn" onClick={onShowRules}>
                  Scoring reference
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  dismissScored()
                  emit('game:continue')
                }}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

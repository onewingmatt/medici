// Scoring reference — quick rules lookup, available from the header and
// from the day-scoring overlay.
const SHIP_PAYMENTS: { players: number; pay: number[] }[] = [
  { players: 2, pay: [20, 0] },
  { players: 3, pay: [30, 15, 0] },
  { players: 4, pay: [30, 20, 10, 0] },
  { players: 5, pay: [30, 20, 10, 5, 0] },
  { players: 6, pay: [30, 20, 15, 10, 5, 0] },
]

export function ScoringReference({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-card rules-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="overlay-title">Scoring Reference</h2>

        <div className="overlay-section">
          <h3>1 · Ship value</h3>
          <p className="rules-note">Sum the values on your ship each day (gold counts). Rank highest to lowest:</p>
          <table className="score-table rules-table">
            <tbody>
              {SHIP_PAYMENTS.map((r) => (
                <tr key={r.players}>
                  <td>{r.players} players</td>
                  <td className="rules-pay">{r.pay.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overlay-section">
          <h3>2 · Commodity majority</h3>
          <p className="rules-note">
            For each of the five goods, move your marker up one step per card of that type on your ship (gold excluded). The
            highest position earns 10, second earns 5 (second earns 0 in a 2-player game).
          </p>
        </div>

        <div className="overlay-section">
          <h3>3 · Bonus levels</h3>
          <p className="rules-note">
            The top three levels of each commodity track pay a bonus: 5 · 10 · 20. Counters stay on the tracks across all three
            days.
          </p>
        </div>

        <div className="overlay-section">
          <h3>Ties</h3>
          <p className="rules-note">
            Ship payments and commodity awards: add the tied places' amounts and divide among the tied players, rounding down.
            Bonus levels: every player on the same bonus level receives the full bonus — it is not divided.
          </p>
        </div>

        <div className="overlay-section">
          <h3>Day end</h3>
          <p className="rules-note">
            When all but one ship are full, the last player fills their ship free from the top of the deck (no choices). The day
            also ends when the deck runs out.
          </p>
        </div>

        <div className="overlay-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

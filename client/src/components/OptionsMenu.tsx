// Options menu — header dropdown of display toggles.
import { useState } from 'react'
import { PLAYER_SCHEMES } from './Board'

export function OptionsMenu({
  outline,
  onToggleOutline,
  symbols,
  onToggleSymbols,
  scheme,
  onSchemeChange,
}: {
  outline: boolean
  onToggleOutline: (v: boolean) => void
  symbols: boolean
  onToggleSymbols: (v: boolean) => void
  scheme: string
  onSchemeChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="options">
      <button className="btn btn-small btn-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Options
      </button>
      {open && (
        <div className="options-menu">
          <label className="option-row">
            <input type="checkbox" checked={outline} onChange={(e) => onToggleOutline(e.target.checked)} />
            White outline on player counters
          </label>
          <label className="option-row">
            <input type="checkbox" checked={symbols} onChange={(e) => onToggleSymbols(e.target.checked)} />
            Player pieces as symbols (no circle)
          </label>
          <label className="option-row option-select">
            <span>Player colors</span>
            <select value={scheme} onChange={(e) => onSchemeChange(e.target.value)}>
              {Object.entries(PLAYER_SCHEMES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

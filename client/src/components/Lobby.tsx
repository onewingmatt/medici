// Lobby — create/join room, player list, add bots, start game.
import { useState } from 'react'
import { emit } from '../socket'
import { useStore } from '../store'

export function Lobby() {
  const room = useStore((s) => s.room)
  const yourId = useStore((s) => s.yourId)
  const connected = useStore((s) => s.connected)
  const [name, setName] = useState(() => localStorage.getItem('medici:name') ?? '')
  const [code, setCode] = useState('')

  const saveName = (n: string) => {
    setName(n)
    localStorage.setItem('medici:name', n)
  }

  if (!room) {
    return (
      <div className="lobby">
        <div className="lobby-title">
          <h1>Medici</h1>
          <p>An auction game of Renaissance trade — 2 to 6 players</p>
        </div>
        <div className="lobby-card">
          <label>Your name</label>
          <input
            value={name}
            onChange={(e) => saveName(e.target.value)}
            placeholder="Merchant name"
            maxLength={24}
          />
          <div className="lobby-buttons">
            <button
              className="btn btn-primary"
              disabled={!connected || !name.trim()}
              onClick={() => emit('room:create', { playerName: name.trim() })}
            >
              Create room
            </button>
            <div className="join-row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={5}
              />
              <button
                className="btn"
                disabled={!connected || !name.trim() || code.trim().length < 5}
                onClick={() => emit('room:join', { code: code.trim(), playerName: name.trim() })}
              >
                Join
              </button>
            </div>
          </div>
          {!connected && <p className="lobby-note">Connecting to server…</p>}
        </div>
      </div>
    )
  }

  const isHost = room.hostId === yourId
  const humans = room.players.filter((p) => !p.isBot).length

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="room-header">
          <h2>Room {room.code}</h2>
          <span className="room-share">
            Share this code with friends to play
          </span>
        </div>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === yourId ? 'me' : ''}>
              <span>
                {p.name}
                {p.isBot && <em> (bot · {p.difficulty})</em>}
                {p.id === yourId && <strong> — you</strong>}
              </span>
              {isHost && p.isBot && (
                <button className="btn btn-small" onClick={() => emit('remove_bot', { playerId: p.id })}>
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="lobby-bots">
            <span>Add bot:</span>
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <button
                key={d}
                className="btn btn-small"
                disabled={room.players.length >= 6}
                onClick={() => emit('add_bot', { difficulty: d })}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {isHost && (
          <button
            className="btn btn-primary"
            disabled={room.players.length < 2}
            onClick={() => emit('game:start')}
          >
            Start game ({room.players.length} player{room.players.length === 1 ? '' : 's'})
          </button>
        )}
        {!isHost && <p className="lobby-note">Waiting for the host to start…</p>}
        <p className="lobby-note">{humans} human · {room.players.length - humans} bot</p>
        <button className="btn btn-small lobby-leave" onClick={() => emit('room:leave')}>
          Leave room
        </button>
      </div>
    </div>
  )
}

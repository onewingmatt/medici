// Medici server entry — Express + Socket.IO.
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { registerHandlers } from './handlers'
import { restorePersistedRooms, setIo, startCleanupTimer } from './rooms'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
})

setIo(io)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Serve the built client in production.
const clientDist = join(__dirname, '..', 'client', 'dist')
if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

registerHandlers(io)

restorePersistedRooms()
startCleanupTimer()

httpServer.listen(PORT, () => {
  console.log(`[medici] server listening on :${PORT}`)
})

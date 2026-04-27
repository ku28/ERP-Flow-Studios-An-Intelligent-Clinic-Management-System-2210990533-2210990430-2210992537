/*
  Optional realtime speech backend service.
  - WebSocket streaming for partial/final transcripts
  - Google Speech-to-Text streaming for low-latency dictation
  - Whisper batch helper endpoint placeholder for recorded files

  Required env vars for Google mode:
  - GOOGLE_APPLICATION_CREDENTIALS

  Optional env vars:
  - SPEECH_PORT=8099
  - SPEECH_LANGUAGE=en-IN
  - WHISPER_CLI_PATH=whisper
*/

const http = require('http')
const { spawn } = require('child_process')

let WebSocketServer
try {
  WebSocketServer = require('ws').WebSocketServer
} catch (error) {
  console.error('Missing dependency: ws. Install with: pnpm add ws')
  process.exit(1)
}

let GoogleSpeechClient = null
try {
  GoogleSpeechClient = require('@google-cloud/speech').SpeechClient
} catch {
  // Google mode remains unavailable until dependency is installed.
}

const PORT = Number(process.env.SPEECH_PORT || 8099)
const LANGUAGE = process.env.SPEECH_LANGUAGE || 'en-IN'

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== 1) return
  ws.send(JSON.stringify(payload))
}

function createGoogleStream(ws) {
  if (!GoogleSpeechClient) {
    sendJson(ws, {
      type: 'error',
      message: 'Google Speech SDK missing. Install with: pnpm add @google-cloud/speech',
    })
    return null
  }

  const client = new GoogleSpeechClient()
  const request = {
    config: {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: LANGUAGE,
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    },
    interimResults: true,
  }

  const stream = client
    .streamingRecognize(request)
    .on('data', (data) => {
      const result = data.results && data.results[0]
      const alternative = result && result.alternatives && result.alternatives[0]
      const text = alternative && alternative.transcript ? String(alternative.transcript).trim() : ''
      if (!text) return

      sendJson(ws, {
        type: result.isFinal ? 'final' : 'partial',
        text,
      })
    })
    .on('error', (error) => {
      sendJson(ws, {
        type: 'error',
        message: `Google streaming error: ${error.message || String(error)}`,
      })
    })

  return stream
}

// Optional helper for non-realtime processing from saved audio file.
function transcribeWithWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    const binary = process.env.WHISPER_CLI_PATH || 'whisper'
    const args = [audioFilePath, '--language', 'en', '--output_format', 'txt']

    const child = spawn(binary, args)
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true })
      } else {
        reject(new Error(stderr || `Whisper exited with code ${code}`))
      }
    })
  })
}

const server = http.createServer((req, res) => {
  // Simple health endpoint for ERP app diagnostics.
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        googleStreamingAvailable: !!GoogleSpeechClient,
        whisperBatchAvailable: true,
      })
    )
    return
  }

  if (req.method === 'POST' && req.url === '/whisper/batch') {
    let body = ''
    req.on('data', (chunk) => {
      body += String(chunk)
    })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const audioFilePath = String(payload.audioFilePath || '')
        if (!audioFilePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'audioFilePath is required' }))
          return
        }

        await transcribeWithWhisper(audioFilePath)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, message: 'Whisper batch job completed' }))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: error.message || String(error) }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'Not Found' }))
})

const wss = new WebSocketServer({ server, path: '/stream' })

wss.on('connection', (ws) => {
  const googleStream = createGoogleStream(ws)

  ws.on('message', (message, isBinary) => {
    if (!googleStream) return

    // Client sends JSON control frames and binary audio chunks.
    if (!isBinary) {
      try {
        const payload = JSON.parse(String(message || '{}'))
        if (payload.type === 'stop') {
          googleStream.end()
          sendJson(ws, { type: 'stopped' })
        }
      } catch {
        // Ignore malformed control messages.
      }
      return
    }

    try {
      googleStream.write(message)
    } catch (error) {
      sendJson(ws, {
        type: 'error',
        message: `Streaming write failed: ${error.message || String(error)}`,
      })
    }
  })

  ws.on('close', () => {
    if (googleStream) googleStream.end()
  })

  ws.on('error', () => {
    if (googleStream) googleStream.end()
  })
})

server.listen(PORT, () => {
  console.log(`[speech] realtime speech server listening on port ${PORT}`)
  console.log(`[speech] websocket endpoint: ws://localhost:${PORT}/stream`)
})

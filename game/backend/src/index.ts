import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT ?? 3000)
const backendDir = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(backendDir, '../public')
const indexHtml = path.join(publicDir, 'index.html')

app.get('/api/hello', (_request, response) => {
  response.json({ message: 'Hello world' })
})

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use(express.static(publicDir))
app.get('*', (_request, response, next) => {
  response.sendFile(indexHtml, (error) => {
    if (error) next(error)
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Game server listening on port ${port}`)
})

// Juan Manuel Ortiz Pabón - 2210093
// Servidor TCP

const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { Worker, isMainThread, parentPort } = require('worker_threads')

// ==========================================
// LÓGICA DE LOS WORKERS (Hilos)
// ==========================================
if (!isMainThread) {
  
  // Función auxiliar para verificar si es primo
  const isPrime = (num) => {
    if (num <= 1) return false; // 0 y 1 no son primos
    if (num === 2) return true; // 2 es primo
    if (num % 2 === 0) return false; // Pares > 2 no son primos
    
    // Comprobamos impares desde 3 hasta la raíz cuadrada del número
    const sqrt = Math.sqrt(num);
    for (let i = 3; i <= sqrt; i += 2) {
      if (num % i === 0) return false;
    }
    return true;
  }

  parentPort.on('message', ({ text, returnPort }) => {
    try {
      // Lógica intensiva (CPU Bound)
      // Aseguramos que haya texto
      if (!text || text.length === 0) throw new Error("Texto vacío");

      const lastChar = text[text.length - 1]
      let count = 0
      
      // Contamos coincidencias (case-sensitive)
      for (const char of text) {
        if (char === lastChar) count++
      }

      // Verificamos si el conteo es primo
      const isCountPrime = isPrime(count);

      // Enviamos el resultado completo
      returnPort.postMessage({ 
        status: 'ok', 
        result: { 
          text, 
          lastChar, 
          count, 
          isCountPrime 
        } 
      })

    } catch (error) {
      returnPort.postMessage({ status: 'error', error: error.message })
    } finally {
      returnPort.close()
    }
  })

  return 
}

// ==========================================
// LÓGICA DEL SERVIDOR (Main Thread)
// ==========================================

const PORT = 5050
const LOG_FILE = path.join(__dirname, 'server_log.txt')

// Thread Pool
const numCPUs = os.cpus().length
const workers = []
let currentWorkerIndex = 0

console.log(`Iniciando Thread Pool con ${numCPUs} hilos...`)

for (let i = 0; i < numCPUs; i++) {
  const worker = new Worker(__filename)
  workers.push(worker)
}

function getWorker() {
  const worker = workers[currentWorkerIndex]
  currentWorkerIndex = (currentWorkerIndex + 1) % workers.length
  return worker
}

function processTextInThread(text) {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel()
    const worker = getWorker()

    port1.on('message', (msg) => {
      if (msg.status === 'ok') resolve(msg.result)
      else reject(new Error(msg.error))
      port1.close()
    })
    worker.postMessage({ text, returnPort: port2 }, [port2])
  })
}

// Configuracion del servidor TCP
const server = net.createServer((socket) => {
  console.log(`Cliente conectado: ${socket.remoteAddress}:${socket.remotePort}`)

  let buffer = ''

  socket.on('data', async (data) => { 
    buffer += data.toString()

    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index)

      const text = line.replace(/\r/g, '').trim() 
      buffer = buffer.slice(index + 1)

      if (!text) continue;

      try {
        console.log(`Enviando al Thread Pool: "${text}"`)

        const { lastChar, count, isCountPrime } = await processTextInThread(text)

        const now = new Date()
        const timestamp = now.toLocaleString('es-ES', { timeZone: 'America/Bogota' }) 
        
        const primeText = isCountPrime ? 'Es numero primo' : 'No es numero primo';
        
        const logEntry = `[${timestamp}] Cadena: "${text}" | Última letra: '${lastChar}' | Repeticiones: ${count} | ${primeText}\n`

        fs.appendFile(LOG_FILE, logEntry, (err) => {
          if (err) console.error('Error log:', err)
        })

        // Respuesta al cliente
        socket.write(
          `La cadena termina en '${lastChar}'.\n` +
          `Aparece ${count} veces.\n` +
          `¿Es el número ${count} primo?: ${isCountPrime ? 'Si' : 'No'}\n`
        )
        socket.end() // Cerramos conexión tras responder
        return

      } catch (err) {
        console.error('Error procesando:', err.message)
        socket.write('Error interno procesando la solicitud\n')
        socket.end()
      }
    }
  })

  socket.on('end', () => {
    console.log('Cliente desconectado')
  })

  socket.on('error', (err) => {
    if(err.code !== 'ECONNRESET') console.error('Error socket:', err.message)
  })
})

server.listen(PORT, () => {
  console.log(`Servidor TCP escuchando en el puerto ${PORT}`)
  console.log(`Log guardado en: ${LOG_FILE}`)
})
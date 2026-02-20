const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const CIRCUITS_FILE = path.join(__dirname, 'data', 'circuits.json');
const RAFFLES_FILE = path.join(__dirname, 'data', 'raffles.json');

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

io.on('connection', (socket) => {
  console.log('Un cliente se ha conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Automated Raffle Logic
cron.schedule('* * * * *', () => {
  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath);
  if (!config || !config.dates || !config.raffleTime) return;

  const now = new Date();

  // Format current time as HH:MM to match config.raffleTime
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  // Create local date string matching YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const currentDateStr = `${year}-${month}-${day}`;

  // Check if today is a race day and time matches
  if (config.dates.includes(currentDateStr) && config.raffleTime === currentTimeStr) {

    // Check if we already raffled today
    const rafflesData = readJSON(RAFFLES_FILE) || { raffles: [], currentRound: 1 };

    const todayRaffle = rafflesData.raffles.find(r => {
      const raffleDate = new Date(r.date);
      return raffleDate.getFullYear() === year &&
        String(raffleDate.getMonth() + 1).padStart(2, '0') === month &&
        String(raffleDate.getDate()).padStart(2, '0') === day;
    });

    if (todayRaffle) {
      return; // Already triggered for today
    }

    console.log(`[CRON] Es la hora del sorteo (${currentTimeStr}). ¡Iniciando sorteo automático!`);

    const circuits = readJSON(CIRCUITS_FILE);
    if (!circuits || !circuits.circuits || circuits.circuits.length === 0) {
      console.error('[CRON] No circuits available for raffle.');
      return;
    }

    const usedCircuits = rafflesData.raffles.map(r => r.circuitId);
    const availableCircuits = circuits.circuits.filter(c => !usedCircuits.includes(c.id));

    if (availableCircuits.length === 0) {
      console.error('[CRON] All circuits have been used.');
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableCircuits.length);
    const selectedCircuit = availableCircuits[randomIndex];

    const newRaffle = {
      id: Date.now(),
      round: rafflesData.currentRound,
      circuitId: selectedCircuit.id,
      circuitName: selectedCircuit.name,
      date: new Date().toISOString(),
      revealed: true
    };

    rafflesData.raffles.push(newRaffle);
    rafflesData.currentRound++;
    writeJSON(RAFFLES_FILE, rafflesData);

    // Emit event to ALL connected clients to start spinning
    io.emit('raffleStarted', { raffle: newRaffle, circuit: selectedCircuit });
  }
});

app.get('/api/circuits', (req, res) => {
  const data = readJSON(CIRCUITS_FILE);
  if (!data) return res.status(404).json({ error: 'No circuits found' });
  res.json(data);
});

app.get('/api/raffles', (req, res) => {
  const data = readJSON(RAFFLES_FILE) || { raffles: [], currentRound: 1 };
  res.json(data);
});

app.get('/api/config', (req, res) => {
  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath) || {
    raffleTime: '20:00',
    totalRounds: 10,
    championshipName: 'RSR Championship'
  };
  res.json(config);
});

server.listen(PORT, () => {
  console.log(`🏎️ RSR Dark Race server running at http://localhost:${PORT}`);
});

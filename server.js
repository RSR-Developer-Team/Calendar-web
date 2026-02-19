const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
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

app.get('/api/circuits', (req, res) => {
  const data = readJSON(CIRCUITS_FILE);
  if (!data) return res.status(404).json({ error: 'No circuits found' });
  res.json(data);
});

app.get('/api/raffles', (req, res) => {
  const data = readJSON(RAFFLES_FILE) || { raffles: [], currentRound: 1 };
  res.json(data);
});

app.post('/api/raffle', (req, res) => {
  const circuits = readJSON(CIRCUITS_FILE);
  if (!circuits || !circuits.circuits || circuits.circuits.length === 0) {
    return res.status(400).json({ error: 'No circuits available' });
  }

  const rafflesData = readJSON(RAFFLES_FILE) || { raffles: [], currentRound: 1 };
  
  const usedCircuits = rafflesData.raffles.map(r => r.circuitId);
  const availableCircuits = circuits.circuits.filter(c => !usedCircuits.includes(c.id));
  
  if (availableCircuits.length === 0) {
    return res.status(400).json({ error: 'All circuits have been used' });
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

  res.json({ success: true, raffle: newRaffle, circuit: selectedCircuit });
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

app.listen(PORT, () => {
  console.log(`🏎️ RSR Dark Race server running at http://localhost:${PORT}`);
});

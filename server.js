const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3005;


app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/config.js', (req, res) => {
  const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
  res.type('application/javascript');
  res.send(`window.BACKEND_URL = "${backendUrl}";`);
});

const CIRCUITS_FILE = path.join(__dirname, 'data', 'circuits.json');
const RAFFLES_FILE = path.join(__dirname, 'data', 'raffles.json');

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Database Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

// Fallback for local development if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  pool.options.user = 'postgres';
  pool.options.host = 'localhost';
  pool.options.database = 'postgres';
  pool.options.password = 'password';
  pool.options.port = 5432;
}

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS race_results (
        id TEXT PRIMARY KEY,
        track TEXT,
        date TIMESTAMPTZ,
        championship_id TEXT,
        results JSONB
      )
    `);
    console.log('✅ Base de datos conectada y tabla race_results lista.');
  } catch (err) {
    console.error('❌ Error inicializando DB:', err.message);
  }
}

initDB();

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

  // Get current time in Madrid timezone
  const madridTimeStr = now.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
  const madridNow = new Date(madridTimeStr);

  // Format current time as HH:MM to match config.raffleTime
  const currentHours = String(madridNow.getHours()).padStart(2, '0');
  const currentMinutes = String(madridNow.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  // Create local date string matching YYYY-MM-DD
  const year = madridNow.getFullYear();
  const month = String(madridNow.getMonth() + 1).padStart(2, '0');
  const day = String(madridNow.getDate()).padStart(2, '0');
  const currentDateStr = `${year}-${month}-${day}`;

  // Check if today is a race day and time matches
  if (config.dates.includes(currentDateStr) && config.raffleTime === currentTimeStr) {

    // Check if we already raffled today
    const rafflesData = readJSON(RAFFLES_FILE) || { raffles: [], currentRound: 1 };

    const todayRaffle = rafflesData.raffles.find(r => {
      // Parse raffle date in Madrid timezone for fair comparison
      const raffleDateRaw = new Date(r.date);
      const raffleMadridStr = raffleDateRaw.toLocaleString("en-US", { timeZone: "Europe/Madrid" });
      const raffleDate = new Date(raffleMadridStr);

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

// --- Background Race Result Cache ---
let raceResultsCache = [];
let isRefreshingCache = false;

async function refreshResultCache() {
  if (isRefreshingCache) return;
  isRefreshingCache = true;

  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath) || {};
  const emperorUrl = config.emperorServerUrl;
  const mainChampId = config.championshipId;
  const historyChamps = (config.historicalChampionships || []).map(c => c.id);
  const allChampIds = [mainChampId, ...historyChamps].filter(id => id && id !== "insert_championship_id_here");

  if (!emperorUrl || allChampIds.length === 0) {
    isRefreshingCache = false;
    return;
  }

  console.log(`[CACHE] Refrescando caché de resultados para ${allChampIds.length} campeonatos...`);

  try {
    const baseUrl = emperorUrl.replace(/\/+$/, '');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // 1. Get the list of recent results
    const response = await fetch(`${baseUrl}/api/results/list.json?q=RACE&sort=date`);
    if (!response.ok) throw new Error("No se pudo obtener la lista de resultados");

    const data = await response.json();
    const latestRaces = data.results || [];

    // We'll check the last 30 races to find those belonging to our championships
    const filteredRaces = [];

    // Limits the number of concurrent fetches to avoid overwhelming the server
    for (const race of latestRaces.slice(0, 30)) {
      try {
        const resPath = race.results_json_url;
        // The resPath already starts with /results/download/, so we don't need /api prefix
        // based on manual testing.
        const resResponse = await fetch(`${baseUrl}${resPath}`);
        if (!resResponse.ok) {
          console.warn(`[CACHE] No se pudo obtener detalle para ${resPath}: ${resResponse.status}`);
          continue;
        }

        const resJson = await resResponse.json();
        const raceChampId = resJson.ChampionshipID;

        if (raceChampId && allChampIds.includes(raceChampId)) {
          // It's a championship race!
          filteredRaces.push({
            id: race.results_json_url, // Use the URL as ID since 'id' is missing
            track: race.track,
            date: race.date,
            championshipId: raceChampId,
            results: resJson.Result || []
          });

          if (filteredRaces.length >= 20) break; // We have enough for recent history
        }
      } catch (e) {
        console.error(`Error procesando carrera ${race.id}:`, e);
      }
    }

    raceResultsCache = filteredRaces;

    // Opt-in DB migration (keeping it simple for now)
    for (const race of filteredRaces) {
      try {
        await pool.query(
          'INSERT INTO race_results (id, track, date, championship_id, results) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET results = $5',
          [race.id, race.track, race.date, race.championshipId, JSON.stringify(race.results)]
        );
      } catch (e) {
        // Silent error for now as requested to keep it "empty/pre-configured"
      }
    }

    console.log(`[CACHE] Caché actualizado. Encontradas ${raceResultsCache.length} carreras de campeonato.`);
  } catch (error) {
    console.error('[CACHE] Error actualizando caché:', error);
  } finally {
    isRefreshingCache = false;
  }
}

// Initial refresh and then every 10 minutes
refreshResultCache();
cron.schedule('*/10 * * * *', refreshResultCache);

app.get('/api/entrants', async (req, res) => {
  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath) || {};
  const emperorUrl = config.emperorServerUrl;
  const champId = config.championshipId;

  if (!emperorUrl || !champId) {
    return res.status(400).json({ error: 'Falta configuración' });
  }

  try {
    const baseUrl = emperorUrl.replace(/\/+$/, '');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const fetchUrl = `${baseUrl}/championship/${champId}`;
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Status: ${response.status}`);

    const html = await response.text();
    const entrantsSection = html.match(/id="entrants"[\s\S]*?<\/tbody>/);

    const entrants = [];
    if (entrantsSection) {
      const rows = entrantsSection[0].match(/<tr[\s\S]*?<\/tr>/g);
      if (rows) {
        rows.forEach(row => {
          const cols = row.match(/<td>([\s\S]*?)<\/td>/g);
          if (cols && cols.length >= 3) {
            const name = cols[1].replace(/<[\s\S]*?>/g, '').trim();
            const team = cols[2].replace(/<[\s\S]*?>/g, '').trim();
            entrants.push({ Name: name, Team: team });
          }
        });
      }
    }
    res.json({ Entrants: entrants });
  } catch (error) {
    console.error('Error scraping entrants:', error);
    res.status(500).json({ error: 'Error scraping entrants' });
  }
});

app.get('/api/standings', async (req, res) => {

  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath) || {};

  const emperorUrl = config.emperorServerUrl;
  const champId = config.championshipId;

  if (!emperorUrl || !champId || champId === "insert_championship_id_here") {
    return res.status(400).json({ error: 'Falta configurar emperorServerUrl o championshipId en config.json' });
  }

  try {
    // Normalizar URL (quitar barras al final si las hay) para evitar el error 404 por doble barra
    const baseUrl = emperorUrl.replace(/\/+$/, '');

    // En Node 18+ (Fetch nativo), para ignorar certificados auto-firmados del VPS
    // lo más directo es desactivar la verificación de TLS para esta petición.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const fetchUrl = `${baseUrl}/api/championship/${champId}/standings.json`;
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`Emperor Servers API respondió con un error: ${response.status} en ${fetchUrl}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error al conectar con Emperor Servers API:', error);
    res.status(500).json({ error: 'Error interno conectando con Emperor Servers' });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const dbResults = await pool.query('SELECT * FROM race_results ORDER BY date DESC LIMIT 20');
    // Map back to the expected format
    const results = dbResults.rows.map(r => ({
      id: r.id,
      track: r.track,
      date: r.date,
      championshipId: r.championship_id,
      results: r.results
    }));
    res.json({ results });
  } catch (e) {
    // Fallback to cache if DB fails
    res.json({ results: raceResultsCache });
  }
});

app.get('/api/results/:guid', async (req, res) => {
  const guid = req.params.guid;

  try {
    // Search directly in JSONB for efficiency
    const dbResults = await pool.query(`
      SELECT * FROM race_results 
      WHERE results @? '$[*] ? (@.Driver.Guid == $guid)'
      ORDER BY date DESC LIMIT 10
    `, { guid });

    const driverResults = dbResults.rows.map(r => {
      const driverResult = r.results.find(res => res.Driver && res.Driver.Guid === guid);
      return {
        id: r.id,
        track: r.track,
        date: r.date,
        pos: r.results.indexOf(driverResult) + 1,
        championshipId: r.championship_id
      };
    });
    res.json({ results: driverResults });
  } catch (e) {
    // Fallback exactly like before
    const driverResults = raceResultsCache.map(race => {
      const driverResult = race.results.find(r => r.Driver && r.Driver.Guid === guid);
      if (!driverResult) return null;

      return {
        id: race.id,
        track: race.track,
        date: race.date,
        pos: race.results.indexOf(driverResult) + 1,
        championshipId: race.championshipId
      };
    }).filter(Boolean).slice(0, 10);
    res.json({ results: driverResults });
  }
});

app.get('/api/laptimes', async (req, res) => {
  try {
    // We aggregate from the cache/DB. Since refreshResultCache already populates raceResultsCache
    // and the DB, we can use the cache for speed or query the DB for consistency.
    // Let's use the DB if available, fallback to cache.
    let historicalResults = [];
    try {
      const dbResults = await pool.query('SELECT * FROM race_results');
      historicalResults = dbResults.rows.map(r => ({
        track: r.track,
        results: r.results
      }));
    } catch (e) {
      historicalResults = raceResultsCache;
    }

    const lapTimesMap = {};

    historicalResults.forEach(race => {
      const trackName = race.track;
      if (!race.results) return;

      race.results.forEach(entry => {
        if (!entry.Driver || !entry.Driver.Name || !entry.BestLap) return;

        const driverId = entry.Driver.Guid || entry.Driver.Name;
        const lapTime = entry.BestLap;
        const carModel = entry.Car?.Model || entry.CarModel || "N/A";

        const key = `${driverId}_${trackName}`;

        if (!lapTimesMap[key] || lapTime < lapTimesMap[key].bestLap) {
          lapTimesMap[key] = {
            driverId: driverId,
            driverName: entry.Driver.Name,
            track: trackName,
            bestLap: lapTime,
            car: carModel,
            team: entry.Driver.Team || "Independiente"
          };
        }
      });
    });

    const laptimes = Object.values(lapTimesMap).sort((a, b) => a.bestLap - b.bestLap);
    res.json({ laptimes });
  } catch (error) {
    console.error('Error fetching laptimes:', error);
    res.status(500).json({ error: 'Error processing lap times' });
  }
});

app.get('/api/profiles', (req, res) => {
  const profilesPath = path.join(__dirname, 'data', 'profiles.json');
  const data = readJSON(profilesPath) || { drivers: {}, teams: {} };
  res.json(data);
});

app.get('/api/history', async (req, res) => {
  const configPath = path.join(__dirname, 'data', 'config.json');
  const config = readJSON(configPath) || {};
  const emperorUrl = config.emperorServerUrl;
  const historyChamps = config.historicalChampionships || [];

  if (!emperorUrl || !historyChamps.length) {
    return res.json({ history: {} });
  }

  const results = {};

  try {
    const baseUrl = emperorUrl.replace(/\/+$/, '');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    for (const champ of historyChamps) {
      try {
        const response = await fetch(`${baseUrl}/api/championship/${champ.id}/standings.json`);
        if (!response.ok) continue;

        const data = await response.json();
        if (data && data.DriverStandings) {
          Object.keys(data.DriverStandings).forEach(className => {
            const standings = data.DriverStandings[className];
            standings.forEach((entry, index) => {
              if (entry.Car && entry.Car.Driver) {
                const guid = entry.Car.Driver.Guid;
                if (!results[guid]) results[guid] = [];

                results[guid].push({
                  championshipName: champ.name,
                  pos: index + 1,
                  points: entry.Points || 0,
                  team: entry.Car.Driver.Team || entry.Car.Model || "Independiente"
                });
              }
            });
          });
        }
      } catch (e) {
        console.error(`Error fetching history for ${champ.id}:`, e);
      }
    }

    res.json({ history: results });
  } catch (error) {
    console.error('Error al obtener histórico:', error);
    res.status(500).json({ error: 'Error al conectar con servidor histórico' });
  }
});

server.listen(PORT, () => {
  console.log(`🏎️ RSR Dark Race server running at http://localhost:${PORT}`);
});

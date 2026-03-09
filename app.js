let config = null;
let circuits = [];
let rafflesData = null;
let teamsData = [];
let driversData = [];
let resultsData = [];
let countdownInterval = null;
let hasRevealedThisSession = false;
let profilesData = { drivers: {}, teams: {} };
let recentResults = [];
let historyData = {};

// Determine backend URL
// If running locally, connect to localhost:3000. Give priority to Render URL for GitHub Pages.
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3005'

  : 'https://ws-rs-calendar.onrender.com'; // Backend URL provided by Render

// Initialize Socket.io
const socket = io(BACKEND_URL);

// Listen for global raffle event
socket.on('raffleStarted', (data) => {
  if (data && data.circuit) {
    // If the animation is already running for this client, don't trigger it again
    if (!document.getElementById('slotMachine').classList.contains('hidden')) return;

    startRaffleAnimation(data.circuit);
  }
});

socket.on('raffleError', (data) => {
  alert(data.error);
});

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playTickSound() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'square';

  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.05);
}

function playRevealSound() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 440;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/${endpoint}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    return null;
  }
}

async function postAPI(endpoint, data = {}) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error(`Error posting ${endpoint}:`, error);
    return null;
  }
}

function getNextRaffleDate() {
  if (!config?.dates || config.dates.length === 0) return null;

  const now = new Date();
  const [hours, minutes] = (config.raffleTime || '20:00').split(':').map(Number);

  for (const dateStr of config.dates) {
    const targetDate = new Date(dateStr);
    targetDate.setHours(hours, minutes, 0, 0);

    if (targetDate > now) {
      return targetDate;
    }
  }

  return null;
}

function getCurrentRaffleDate() {
  if (!config?.dates || config.dates.length === 0) return null;

  const now = new Date();
  const [hours, minutes] = (config.raffleTime || '20:00').split(':').map(Number);

  for (const dateStr of config.dates) {
    const targetDate = new Date(dateStr);
    targetDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    if (now >= targetDate && now <= endDate) {
      return targetDate;
    }
  }

  return null;
}

function updateCountdown() {
  const now = new Date();
  const targetDate = getNextRaffleDate();
  const currentRaffleDate = getCurrentRaffleDate();

  if (currentRaffleDate && !hasRevealedThisSession) {
    const todayRaffle = rafflesData?.raffles?.find(r => {
      const raffleDate = new Date(r.date);
      return raffleDate.toDateString() === now.toDateString();
    });

    if (!todayRaffle) {
      showRaffleButton();
      return;
    }
  }

  if (!targetDate) {
    document.getElementById('days').textContent = '--';
    document.getElementById('hours').textContent = '--';
    document.getElementById('minutes').textContent = '--';
    document.getElementById('seconds').textContent = '--';
    return;
  }

  const diff = targetDate - now;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  document.getElementById('days').textContent = String(days).padStart(2, '0');
  document.getElementById('hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
  document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');

  const secondsContainer = document.getElementById('secondsContainer');
  if (days === 0 && hours === 0 && minutes < 60) {
    secondsContainer.classList.add('urgent');
  } else {
    secondsContainer.classList.remove('urgent');
  }
}

function showRaffleButton() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  document.getElementById('countdownContainer').classList.add('hidden');
  document.getElementById('preRaffle').classList.add('hidden');
  document.getElementById('raffleWaiting').classList.remove('hidden');

  updateServerStatus('pending', 'LISTO PARA SORTEAR');
}

function updateServerStatus(status, text) {
  const statusEl = document.getElementById('serverStatus');
  const textEl = statusEl.querySelector('.status-text');

  statusEl.className = 'server-status ' + status;
  textEl.textContent = text;
}

function renderCircuitsGrid() {
  const grid = document.getElementById('circuitsGrid');
  grid.innerHTML = circuits.map(circuit => {
    const usedRaffle = rafflesData?.raffles?.find(r => r.circuitId === circuit.id);
    const isUsed = !!usedRaffle;
    const roundAttr = isUsed ? `data-round="Ronda ${usedRaffle.round}"` : '';

    return `
    <div class="circuit-card ${isUsed ? 'used' : ''}" data-id="${circuit.id}" ${roundAttr}>
      <img src="img/circuits/${circuit.id}.svg" class="circuit-layout" alt="Trazado de ${circuit.name}" onerror="this.style.display='none'">
      <div class="circuit-name">${circuit.name}</div>
      <div class="circuit-country">${circuit.country}</div>
    </div>
  `}).join('');
}

function renderCalendar() {
  const tbody = document.getElementById('calendarBody');
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const rows = [];
  const dates = config?.dates || [];

  dates.forEach((dateStr, i) => {
    const roundDate = new Date(dateStr);
    const roundDateEnd = new Date(dateStr);
    roundDateEnd.setHours(23, 59, 59, 999);

    const raffle = rafflesData?.raffles?.find(r => r.round === i + 1);

    let status, statusClass, circuitName, circuitClass;

    if (raffle && raffle.circuitName) {
      status = 'Sorteado';
      statusClass = 'completed';
      circuitName = raffle.circuitName;
      circuitClass = '';
    } else if (roundDateEnd < now) {
      status = 'Finalizado';
      statusClass = 'completed';
      circuitName = 'N/A';
      circuitClass = '';
    } else if (roundDate.toDateString() === now.toDateString()) {
      status = 'Hoy';
      statusClass = 'today';
      circuitName = '¿?';
      circuitClass = 'secret';
    } else {
      status = 'Próximamente';
      statusClass = 'upcoming';
      circuitName = 'Oculto';
      circuitClass = 'hidden-circuit';
    }

    const dateDisplay = roundDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

    rows.push(`
      <tr>
        <td>${dateDisplay}</td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td class="circuit-name-cell ${circuitClass}">${circuitName}</td>
      </tr>
    `);
  });

  tbody.innerHTML = rows.join('');
}

async function startRaffleAnimation(finalCircuit) {
  const availableCircuits = circuits.filter(c =>
    !rafflesData?.raffles?.some(r => r.circuitId === c.id)
  );

  // Fallback to ensuring the finalCircuit is in the list
  if (availableCircuits.length === 0 && !finalCircuit) {
    return;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  document.getElementById('raffleWaiting').classList.add('hidden');
  document.getElementById('countdownContainer').classList.add('hidden');
  document.getElementById('preRaffle').classList.add('hidden');

  const slotMachine = document.getElementById('slotMachine');
  const slotReel = document.getElementById('slotReel');
  slotMachine.classList.remove('hidden');

  const totalSpins = 30;
  const itemsPerView = 10;

  let reelContent = '';
  // Populate animation items
  const slotsPool = availableCircuits.length > 0 ? availableCircuits : circuits;
  for (let i = 0; i < totalSpins + itemsPerView; i++) {
    const circuit = slotsPool[i % slotsPool.length];
    reelContent += `<div class="slot-item">${circuit.name}</div>`;
  }
  // Guarantee the last visible item is the winner
  reelContent += `<div class="slot-item" style="color: var(--accent-primary);">${finalCircuit.name}</div>`;
  // Add some padding items
  for (let i = 0; i < 5; i++) {
    reelContent += `<div class="slot-item">${slotsPool[i % slotsPool.length].name}</div>`;
  }

  slotReel.innerHTML = reelContent;

  let currentPosition = 0;
  let spinIndex = 0;
  const itemHeight = 120;

  audioContext.resume().catch(() => { });

  const tickInterval = setInterval(() => {
    playTickSound();
  }, 80);

  const spinInterval = setInterval(() => {
    currentPosition += itemHeight;
    slotReel.style.transform = `translateY(-${currentPosition}px)`;
    spinIndex++;

    if (spinIndex >= totalSpins + itemsPerView) {
      clearInterval(spinInterval);
      clearInterval(tickInterval);

      setTimeout(async () => {
        slotMachine.classList.add('hidden');

        hasRevealedThisSession = true;
        showResult(finalCircuit);
        rafflesData = await fetchAPI('raffles');
        renderCircuitsGrid();
        renderCalendar();
        updateServerStatus('revealed', 'CIRCUITO REVELADO');
        playRevealSound();
      }, 500);
    }
  }, 80);
}

function showResult(circuit) {
  const resultContainer = document.getElementById('resultContainer');
  const resultCircuit = document.getElementById('resultCircuit');
  const resultDetails = document.getElementById('resultDetails');

  document.getElementById('raffleWaiting').classList.add('hidden');
  document.getElementById('countdownContainer').classList.add('hidden');
  document.getElementById('preRaffle').classList.add('hidden');

  resultCircuit.textContent = circuit.name;

  let detailsHTML = `
    <div class="detail-item">
      <span class="detail-label">PAÍS</span>
      <span class="detail-value">${circuit.country}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">LONGITUD</span>
      <span class="detail-value">${circuit.length}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">CURVAS</span>
      <span class="detail-value">${circuit.turns}</span>
    </div>
  `;

  if (circuit.description) {
    detailsHTML += `
      <div class="detail-item" style="flex-basis: 100%; margin-top: 10px; text-align: center;">
        <span class="detail-label">INFO.</span>
        <span class="detail-value" style="font-size: 0.9rem; color: var(--text-secondary);">${circuit.description}</span>
      </div>
    `;
  }

  detailsHTML += `
    <div class="detail-item" style="flex-basis: 100%; margin-top: 15px;">
      <a href="https://acstuff.club/s/q:race/online/join?ip=116.202.87.185&httpPort=28140" target="_blank" class="download-btn">
        🎮 ENTRAR AL SERVIDOR
      </a>
      <div class="branding-text" style="margin-top: 15px;">Powered by Proyingel</div>
    </div>
  `;

  resultDetails.innerHTML = detailsHTML;

  resultContainer.classList.remove('hidden');
  resultCircuit.classList.add('neon-flicker');
}

async function checkExistingRaffle() {
  const now = new Date();
  const currentRaffleDate = getCurrentRaffleDate();

  const todayRaffle = rafflesData?.raffles?.find(r => {
    const raffleDate = new Date(r.date);
    return raffleDate.toDateString() === now.toDateString();
  });

  if (todayRaffle) {
    document.getElementById('countdownContainer').classList.add('hidden');
    document.getElementById('preRaffle').classList.add('hidden');
    document.getElementById('raffleWaiting').classList.add('hidden');

    const circuit = circuits.find(c => c.id === todayRaffle.circuitId);
    if (circuit) {
      showResult(circuit);
    }

    updateServerStatus('revealed', 'CIRCUITO REVELADO');
    hasRevealedThisSession = true;
    return;
  }

  if (currentRaffleDate && !hasRevealedThisSession) {
    showRaffleButton();
  } else if (!todayRaffle) {
    updateServerStatus('revealed', 'SERVIDOR ACTIVO');
  }
}

async function init() {
  config = await fetchAPI('config');
  circuits = (await fetchAPI('circuits'))?.circuits || [];
  rafflesData = await fetchAPI('raffles');

  if (config) {
    if (config.championshipName) {
      const parts = config.championshipName.split(' ');
      if (parts.length > 1) {
        document.getElementById('championshipName').innerHTML = `<span class="logo-highlight">${parts[0]}</span><span class="logo-secondary">${parts.slice(1).join(' ')}</span>`;
      } else {
        document.getElementById('championshipName').innerHTML = `<span class="logo-highlight">${config.championshipName}</span>`;
      }
    } else {
      document.getElementById('championshipName').innerHTML = `<span class="logo-highlight">RSR</span>`;
    }
    document.getElementById('totalRounds').textContent = config.totalRounds || config.dates?.length || 10;
    document.getElementById('raffleTimeDisplay').textContent = config.raffleTime || '20:00';

    if (config.season) {
      document.querySelector('.footer-content').innerHTML = `
        <span>${config.championshipName} © 2026</span>
        <span class="footer-divider">|</span>
        <span>${config.season}</span>
        <span class="footer-divider">|</span>
        <span class="branding-footer">Powered by Proyingel</span>
      `;
    }
  }

  if (rafflesData) {
    document.getElementById('currentRound').textContent = rafflesData.currentRound || 1;
  }
  try {
    const [standingsResponse, entrantsResponse] = await Promise.all([
      fetchAPI('standings'),
      fetchAPI('entrants')
    ]);

    console.log("Emperor Standings Response:", standingsResponse);
    console.log("Scraped Entrants Response:", entrantsResponse);

    teamsData = [];
    driversData = [];
    resultsData = [];

    // Check if Emperor Servers returned HTML (API not public)
    if (typeof standingsResponse === 'string' && standingsResponse.includes('<html')) {
      console.warn('Emperor Servers returned HTML instead of JSON. Please enable Public Access -> Championships - Api Standings in your Server Manager.');
      return;
    }

    if (standingsResponse || entrantsResponse) {
      const TEAM_COLORS = {
        'ferrari': '#e00000',       // Ferrari Red
        'red bull': '#0600ef',      // Red Bull Blue
        'mercedes': '#00d2be',      // Mercedes Turquoise
        'mclaren': '#ff8700',       // McLaren Orange
        'aston martin': '#00665e',  // Aston Martin British Racing Green
        'alpine': '#0090ff',        // Alpine Blue
        'williams': '#005aff',      // Williams Blue
        'kick sauber': '#1eff00',   // Kick Sauber Neon Green
        'stake': '#1eff00',         // Stake/Sauber Neon Green
        'visa cash': '#0000ff',     // VCARB Blue
        'racing bulls': '#6692ff',  // Official VCARB Light Blue
        'haas': '#ffffff'           // Haas White

      };

      const processEntry = (entry, forcePoints = undefined) => {
        let teamName = entry.Car && entry.Car.Driver && entry.Car.Driver.Team ? entry.Car.Driver.Team : (entry.Car && entry.Car.Model ? entry.Car.Model : (entry.Team || 'Independiente'));
        let teamId = teamName.toLowerCase().replace(/\s+/g, '-');

        let finalColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        const lowerTeamName = teamName.toLowerCase();
        for (const [key, val] of Object.entries(TEAM_COLORS)) {
          if (lowerTeamName.includes(key)) {
            finalColor = val;
            break;
          }
        }

        if (!teamsData.find(t => t.id === teamId)) {
          teamsData.push({ id: teamId, name: teamName, color: finalColor });
        }

        const name = entry.Name || (entry.Car && entry.Car.Driver ? entry.Car.Driver.Name : null);
        const guid = entry.Guid || (entry.Car && entry.Car.Driver ? entry.Car.Driver.Guid : null);

        // Extract number from entry or skin name fallback
        let number = 0;
        if (entry.Car && entry.Car.Driver && entry.Car.Driver.CarNumber) {
          number = entry.Car.Driver.CarNumber;
        } else if (entry.Car && entry.Car.Skin) {
          // Try to extract number from skin name like "Sauber_C45_5_Bortoletto" or "Haas_VF-25_31_Oco"
          const skinParts = entry.Car.Skin.split('_');
          for (const part of skinParts) {
            // Check if the part is a number (and not part of year 2025)
            if (!isNaN(part) && part !== "" && part !== "2024" && part !== "2025") {
              number = parseInt(part);
              break;
            }
          }
        }

        if (!name) return;

        // Deduplication Logic:
        // Try to find by GUID first, then by Normalized Name
        const normalizedName = name.toLowerCase().trim();
        let driver = driversData.find(d => {
          if (guid && d.id === guid) return true;
          return d.name.toLowerCase().trim() === normalizedName;
        });

        if (!driver) {
          driver = {
            id: guid || name, // Prefer GUID as ID, fallback to Name
            name: name,
            number: number,
            teamId: teamId,
            _emperorTotalPoints: forcePoints !== undefined ? forcePoints : 0
          };
          driversData.push(driver);
        } else {
          // Update GUID if missing (e.g. if we first found them via Scraped Entrants)
          if (guid && !driver.id.includes('7656')) { // Simple check for SteamID/GUID format
            driver.id = guid;
          }
          // Update Team if it was missing or different
          if (teamId !== 'independiente') driver.teamId = teamId;
          // Update Number if we now have a real one (non-zero)
          if (number !== 0) driver.number = number;
        }



        // Update points if this call comes from standings
        if (entry.Points !== undefined) {
          driver._emperorTotalPoints = entry.Points;
        } else if (forcePoints !== undefined) {
          driver._emperorTotalPoints = Math.max(driver._emperorTotalPoints, forcePoints);
        }
      };


      // 1. Process Scraped Entrants (Ensure everyone is present even with 0 points)
      if (entrantsResponse && entrantsResponse.Entrants) {
        entrantsResponse.Entrants.forEach(e => processEntry(e, 0));
      }

      // 2. Process Current Standings (Actual classification/points)
      if (standingsResponse && standingsResponse.DriverStandings) {
        Object.keys(standingsResponse.DriverStandings).forEach(className => {
          const drivers = standingsResponse.DriverStandings[className];
          if (Array.isArray(drivers)) {
            drivers.forEach(processEntry);
          }
        });
      }
    }

    if (standingsResponse && standingsResponse.Events) {
      resultsData = standingsResponse.Events.map(event => ({
        completed: true,
        standings: []
      }));
    }

  } catch (e) {
    console.error("Error fetching standings or entrants:", e);
  }

  profilesData = await fetchAPI('profiles') || { drivers: {}, teams: {} };
  recentResults = (await fetchAPI('results'))?.results || [];
  historyData = (await fetchAPI('history'))?.history || {};

  renderCircuitsGrid();
  renderCalendar();
  renderStandings();

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);

  checkExistingRaffle();
}

document.addEventListener('DOMContentLoaded', init);

function switchStandingsTab(tabName) {
  document.querySelectorAll('.standings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.standings-container').forEach(c => c.classList.remove('active', 'hidden'));
  document.querySelectorAll('.standings-container').forEach(c => c.classList.add('hidden'));

  if (tabName === 'drivers') {
    document.getElementById('tabDrivers').classList.add('active');
    document.getElementById('driversStandingsContainer').classList.remove('hidden');
    document.getElementById('driversStandingsContainer').classList.add('active');
  } else {
    document.getElementById('tabTeams').classList.add('active');
    document.getElementById('teamsStandingsContainer').classList.remove('hidden');
    document.getElementById('teamsStandingsContainer').classList.add('active');
  }
}

function renderStandings() {
  const driverPoints = {};
  const teamPoints = {};

  // Initialize
  driversData.forEach(d => driverPoints[d.id] = 0);
  teamsData.forEach(t => teamPoints[t.id] = 0);

  // Aggregate points
  resultsData.forEach(race => {
    if (race.completed && race.standings) {
      race.standings.forEach(result => {
        if (driverPoints[result.driverId] !== undefined) {
          driverPoints[result.driverId] += result.points;

          const driver = driversData.find(d => d.id === result.driverId);
          if (driver && teamPoints[driver.teamId] !== undefined) {
            teamPoints[driver.teamId] += result.points;
          }
        }
      });
    }
  });

  // Sort Drivers
  const sortedDrivers = driversData.map(d => {
    const team = teamsData.find(t => t.id === d.teamId);
    return {
      ...d,
      points: d._emperorTotalPoints !== undefined ? d._emperorTotalPoints : driverPoints[d.id],
      teamName: team ? team.name : 'Independiente',
      teamColor: team ? team.color : '#fff'
    };
  }).sort((a, b) => b.points - a.points);

  // Render Drivers
  const driversBody = document.getElementById('driversBody');
  driversBody.innerHTML = sortedDrivers.map((d, index) => {
    const pos = index + 1;
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    return `
      <tr>
        <td><span class="pos-badge ${posClass}">${pos}</span></td>
        <td onclick="showProfile('${d.id}', 'driver')">
          <div class="driver-name">
            <div class="color-bar" style="background-color: ${d.teamColor}"></div>
            <span>${d.name} <span style="color: var(--text-muted); font-size: 0.8em">#${d.number}</span></span>
          </div>
        </td>
        <td class="hide-mobile" style="color: ${d.teamColor}" onclick="showProfile('${d.teamId}', 'team')">${d.teamName}</td>
        <td class="points-cell">${d.points}</td>
      </tr>
    `;
  }).join('');

  // Sort Teams
  // If Emperor API gives TeamStandings directly, we could use that, otherwise we sum driver points here:
  const sortedTeams = teamsData.map(t => {
    // Sum points for all drivers in this team that have Emperor points
    const aggregatedTeamPoints = driversData
      .filter(d => d.teamId === t.id && d._emperorTotalPoints !== undefined)
      .reduce((sum, d) => sum + d._emperorTotalPoints, 0);

    return {
      ...t,
      // Use existing reduce logic fallback if emperorTotalPoints are not used
      points: aggregatedTeamPoints || teamPoints[t.id] || 0
    };
  }).sort((a, b) => b.points - a.points);

  // Render Teams
  const teamsBody = document.getElementById('teamsBody');
  teamsBody.innerHTML = sortedTeams.map((t, index) => {
    const pos = index + 1;
    const posClass = pos <= 3 ? `pos-${pos}` : '';
    return `
      <tr>
        <td><span class="pos-badge ${posClass}">${pos}</span></td>
        <td onclick="showProfile('${t.id}', 'team')">
          <div class="team-name">
            <div class="color-bar" style="background-color: ${t.color}"></div>
            <span style="color: ${t.color}; font-weight: bold;">${t.name}</span>
          </div>
        </td>
        <td class="points-cell">${t.points}</td>
      </tr>
    `;
  }).join('');
}

async function showProfile(id, type) {
  const modal = document.getElementById('profileModal');
  const details = document.getElementById('profileDetails');

  details.innerHTML = '<div class="profile-loading">Cargando perfil...</div>';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  let name = "";
  let subtitle = "";
  let bio = "Este perfil aún no tiene una biografía definida.";
  let palmares = [];
  let photo = "img/drivers/default.png";
  let color = "var(--accent-primary)";
  let relevantResults = [];

  if (type === 'driver') {
    const driver = driversData.find(d => d.id === id);
    if (!driver) return;

    const team = teamsData.find(t => t.id === driver.teamId);
    name = driver.name;
    subtitle = team ? team.name : "Piloto Independiente";
    color = team ? team.color : "var(--accent-primary)";

    const profile = profilesData.drivers[id];
    if (profile) {
      bio = profile.bio || bio;
      palmares = [...(profile.palmares || [])];
      photo = profile.photo || photo;
    }

    // Fetch filtered championship results for this driver
    try {
      const response = await fetch(`${BACKEND_URL}/api/results/${id}`);
      const data = await response.json();
      relevantResults = data.results || [];
    } catch (e) {
      console.error("Error fetching results:", e);
    }
  } else {
    const team = teamsData.find(t => t.id === id);
    if (!team) return;

    name = team.name;
    subtitle = "Escudería Oficial";
    color = team.color;

    const profile = profilesData.teams[id];
    if (profile) {
      bio = profile.bio || bio;
      palmares = [...(profile.palmares || [])];
      photo = profile.logo || "img/teams/default.png";
    }

    // Find current drivers for this team (deduplicated by ID)
    const teamDriversMap = new Map();
    driversData
      .filter(d => d.teamId === id)
      .forEach(d => teamDriversMap.set(d.id, d));
    const teamDrivers = Array.from(teamDriversMap.values());

    if (teamDrivers.length > 0) {
      const driversListHTML = teamDrivers.map(d => `
        <div class="team-driver-item" onclick="event.stopPropagation(); showProfile('${d.id}', 'driver')" style="cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); margin-bottom: 5px; transition: background 0.2s;">
           <div style="width: 25px; height: 25px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold; color: #000;">#${d.number || 0}</div>
           <span style="font-weight: 500;">${d.name}</span>
           <i class="fas fa-chevron-right" style="margin-left: auto; font-size: 0.8rem; opacity: 0.5;"></i>
        </div>
      `).join('');

      bio += `
        <div style="margin-top: 15px;">
          <strong style="color: ${color}; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">Pilotos Actuales:</strong>
          <div style="margin-top: 8px;">${driversListHTML}</div>
        </div>
      `;
    }

    relevantResults = (recentResults || []).slice(0, 5);
  }

  // Automated Trayectoria and Palmarés from history
  let trayectoriaHTML = `<p class="profile-bio">${bio}</p>`;
  let automatedPalmares = [...palmares];

  if (type === 'driver') {
    const driver = driversData.find(d => d.id === id);
    let driverHistory = historyData[id] || [];

    // If history is empty and id is a GUID, try lookup by name
    if (driverHistory.length === 0 && driver) {
      const foundByName = Object.entries(historyData).find(([key, val]) =>
        key.toLowerCase().trim() === driver.name.toLowerCase().trim()
      );
      if (foundByName) driverHistory = foundByName[1];
    }

    // If history is empty and id is a Name, try lookup by any GUID that matches this name in history
    if (driverHistory.length === 0 && driver && !id.includes('7656')) {
      // This is already covered by the logic above actually, but let's be explicit if needed
    }

    // Group history into stints (consecutive championships with same team)
    const stints = [];
    if (driver && driver.teamId) {
      const currentTeam = teamsData.find(t => t.id === driver.teamId);
      if (currentTeam) {
        stints.push({
          team: currentTeam.name,
          startYear: 2026,
          endYear: "Presente",
          isCurrent: true
        });
      }
    }

    // Process history but exclude the current stint (we'll merge it later)
    const sortedHistory = [...driverHistory].sort((a, b) => {
      const yearA = parseInt(a.championshipName.match(/\d{4}/)?.[0] || "0");
      const yearB = parseInt(b.championshipName.match(/\d{4}/)?.[0] || "0");
      return yearB - yearA;
    });

    sortedHistory.forEach(h => {
      const year = parseInt(h.championshipName.match(/\d{4}/)?.[0] || "2025");
      const lastStint = stints[stints.length - 1];

      if (lastStint && lastStint.team === h.team) {
        // Extend existing stint
        if (typeof lastStint.startYear === 'number' && year < lastStint.startYear) {
          lastStint.startYear = year;
        }
      } else {
        // New stint
        stints.push({
          team: h.team,
          startYear: year,
          endYear: year,
          isCurrent: false
        });
      }
    });

    const stintEntries = stints.map(s => {
      const range = s.startYear === s.endYear ? `${s.startYear}` : `${s.startYear} - ${s.endYear}`;
      const colorStyle = s.isCurrent ? `color: ${color}; font-weight: bold;` : `color: var(--text-secondary);`;
      const icon = s.isCurrent ? `<i class="fas fa-check-circle" style="margin-right: 5px; font-size: 0.8rem;"></i>` : '';
      return `
        <div class="career-stint" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="${colorStyle}">${icon}${s.team}</span>
          <span style="font-size: 0.85rem; opacity: 0.7;">${range}</span>
        </div>`;
    }).join('');

    trayectoriaHTML = `
      <p class="profile-bio">${bio}</p>
      <div class="profile-career" style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1);">
        <strong style="color: var(--accent-primary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 12px;">Trayectoria en Equipos:</strong>
        <div class="career-timeline">${stintEntries || '<div style="opacity: 0.5; font-style: italic;">Sin historial previo</div>'}</div>
      </div>
    `;

    driverHistory.forEach(h => {
      automatedPalmares.push(`${h.pos}º en ${h.championshipName} (${h.points} pts)`);
    });

  } else {
    // Automated team palmares calculation from historyData
    const teamName = name;
    const championshipStats = {}; // { championshipName: { teamName: points } }

    Object.values(historyData).forEach(entries => {
      entries.forEach(e => {
        if (!championshipStats[e.championshipName]) championshipStats[e.championshipName] = {};
        if (!championshipStats[e.championshipName][e.team]) championshipStats[e.championshipName][e.team] = 0;
        championshipStats[e.championshipName][e.team] += e.points;
      });
    });

    Object.keys(championshipStats).forEach(champName => {
      const rankings = Object.entries(championshipStats[champName])
        .sort((a, b) => b[1] - a[1]);

      const teamRankIndex = rankings.findIndex(r => r[0] === teamName);
      if (teamRankIndex !== -1) {
        const pos = teamRankIndex + 1;
        const pts = rankings[teamRankIndex][1];
        automatedPalmares.push(`${pos}º en ${champName} (${pts} pts)`);
      }
    });
  }

  details.innerHTML = `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-image-container" style="border-color: ${color}">
          <img src="${photo}" alt="${name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=222&color=fff'">
        </div>
        <div class="profile-title-info">
          <h2>${name}</h2>
          <div class="profile-subtitle" style="color: ${color}">${subtitle}</div>
        </div>
      </div>

      <div class="profile-section">
        <div class="profile-section-title">TRAYECTORIA</div>
        <div class="profile-bio">${trayectoriaHTML}</div>
      </div>

      ${automatedPalmares.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">PALMARÉS E HISTORIAL</div>
        <div class="palmares-list">
          ${automatedPalmares.map(item => `
            <div class="palmares-item" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <i class="fas fa-trophy" style="color: ${item.startsWith('1º') ? '#ffd700' : 'rgba(255,255,255,0.3)'}; font-size: 0.8rem;"></i>
              <span>${item}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `;
}


function closeProfile() {
  document.getElementById('profileModal').classList.add('hidden');
  document.body.style.overflow = 'auto';
}

// Close modal on background click
window.onclick = function (event) {
  const modal = document.getElementById('profileModal');
  if (event.target == modal) {
    closeProfile();
  }
}

let config = null;
let circuits = [];
let rafflesData = null;
let countdownInterval = null;
let hasRevealedThisSession = false;

// Initialize Socket.io
const socket = io();

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
    const response = await fetch(`/api/${endpoint}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    return null;
  }
}

async function postAPI(endpoint, data = {}) {
  try {
    const response = await fetch(`/api/${endpoint}`, {
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

  renderCircuitsGrid();
  renderCalendar();

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);

  checkExistingRaffle();
}

document.addEventListener('DOMContentLoaded', init);

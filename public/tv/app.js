/**
 * app.js – Lógica principal de la pantalla TV
 * Conecta Socket.IO, YouTube Player, MediaPipe Gestures
 */
(function () {
  'use strict';

  const socket = io();
  const player = window.karaokePlayer;
  const notifications = window.notificationManager;
  const gestures = window.gestureDetector;

  // --- Elementos del DOM ---
  const connectionStatus = document.getElementById('connection-status');
  const statusDot = connectionStatus.querySelector('.status-dot');
  const statusText = connectionStatus.querySelector('span');
  const nowPlaying = document.getElementById('now-playing');
  const currentTitle = document.getElementById('current-title');
  const currentArtist = document.getElementById('current-artist');
  const playerOverlay = document.getElementById('player-overlay');
  const lyricsContent = document.getElementById('lyrics-content');
  const queueList = document.getElementById('queue-list');
  const queueCount = document.getElementById('queue-count');

  let currentState = null;
  let lastLoadedVideoId = null;

  // --- Socket.IO Connection ---
  socket.on('connect', () => {
    console.log('[Socket] Conectado:', socket.id);
    statusDot.classList.add('connected');
    statusText.textContent = 'Conectado';
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Desconectado');
    statusDot.classList.remove('connected');
    statusText.textContent = 'Desconectado';
  });

  // --- Sincronización de estado ---
  socket.on('sync-state', (state) => {
    currentState = state;
    updateUI(state);
  });

  // --- Notificaciones ---
  socket.on('notification', (data) => {
    notifications.show(data);
  });

  // --- Actualizar UI ---
  function updateUI(state) {
    // Cola
    renderQueue(state.queue, state.currentIndex);
    queueCount.textContent = state.queue.length;

    // Canción actual
    if (state.currentIndex >= 0 && state.currentIndex < state.queue.length) {
      const song = state.queue[state.currentIndex];
      currentTitle.textContent = song.title;
      currentArtist.textContent = song.artist;
      nowPlaying.classList.remove('hidden');
      playerOverlay.classList.add('hidden');

      // Cargar video si es diferente al actual
      if (song.youtubeId && song.youtubeId !== lastLoadedVideoId) {
        lastLoadedVideoId = song.youtubeId;
        player.loadVideo(song.youtubeId);
        loadLyrics(song.artist, song.title);
      }

      // Play/Pause
      if (state.isPlaying) {
        player.play();
      } else {
        player.pause();
      }

      // Mute
      if (state.isMuted) {
        player.mute();
      } else {
        player.unmute();
      }

      // Volumen
      player.setVolume(state.volume);

    } else {
      // No hay canción
      nowPlaying.classList.add('hidden');
      playerOverlay.classList.remove('hidden');
      currentTitle.textContent = '—';
      currentArtist.textContent = '—';
      lastLoadedVideoId = null;
      lyricsContent.innerHTML = '<p class="lyrics-placeholder">Las letras aparecerán aquí cuando se reproduzca una canción...</p>';
    }
  }

  // --- Renderizar cola ---
  function renderQueue(queue, currentIndex) {
    if (queue.length === 0) {
      queueList.innerHTML = '<p class="queue-placeholder">Sin canciones en cola</p>';
      return;
    }

    queueList.innerHTML = queue.map((song, i) => `
      <div class="queue-item ${i === currentIndex ? 'playing' : ''}">
        <span class="queue-number">${i === currentIndex ? '▶' : i + 1}</span>
        <div class="queue-item-info">
          <div class="queue-item-title">${song.title}</div>
          <div class="queue-item-artist">${song.artist}</div>
        </div>
      </div>
    `).join('');
  }

  // --- Cargar letras ---
  async function loadLyrics(artist, title) {
    lyricsContent.innerHTML = '<p class="lyrics-placeholder">Cargando letras...</p>';

    try {
      const response = await fetch(`/api/lyrics/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
      if (!response.ok) throw new Error('No encontradas');

      const data = await response.json();
      if (data.lyrics) {
        const lines = data.lyrics.split('\n').filter(l => l.trim() !== '');
        lyricsContent.innerHTML = lines.map((line, i) =>
          `<div class="lyrics-line" data-index="${i}">${line}</div>`
        ).join('');

        // Auto-scroll simple
        startLyricsScroll(lines.length);
      } else {
        throw new Error('Sin letras');
      }
    } catch (err) {
      console.warn('[Letras] No disponibles:', err.message);
      lyricsContent.innerHTML = '<p class="lyrics-placeholder">🎵 Letra no disponible para esta canción.<br>¡Canta de memoria! 🎤</p>';
    }
  }

  // --- Auto-scroll de letras (simplificado) ---
  let scrollInterval = null;
  function startLyricsScroll(totalLines) {
    if (scrollInterval) clearInterval(scrollInterval);

    let currentLine = 0;
    const linesEls = lyricsContent.querySelectorAll('.lyrics-line');
    if (linesEls.length === 0) return;

    // Estimar duración: ~4 segundos por línea promedio
    const intervalMs = 4000;

    scrollInterval = setInterval(() => {
      // Quitar clase active de la anterior
      linesEls.forEach(el => el.classList.remove('active'));

      if (currentLine < linesEls.length) {
        linesEls[currentLine].classList.add('active');
        linesEls[currentLine].scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        currentLine++;
      } else {
        clearInterval(scrollInterval);
      }
    }, intervalMs);
  }

  // --- YouTube: cuando termina una canción ---
  player.onEnded(() => {
    if (scrollInterval) clearInterval(scrollInterval);
    socket.emit('song-ended');
  });

  // --- MediaPipe Gestures ---
  gestures.onGesture((data) => {
    socket.emit('gesture-detected', data);
  });

  // Iniciar detección de gestos
  gestures.start();

  console.log('[TV] App inicializada');
})();

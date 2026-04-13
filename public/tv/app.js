/**
 * app.js – Lógica principal de la pantalla TV
 * Conecta: Socket.IO, YouTube Player, MediaPipe Gestures, Clap Detector
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
  const queueList = document.getElementById('queue-list');
  const queueCount = document.getElementById('queue-count');

  let currentState = null;
  let lastLoadedVideoId = null;

  // =============================================
  // SOCKET.IO
  // =============================================
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

  // --- Reiniciar canción (desde doble aplauso u otros) ---
  socket.on('restart-song', () => {
    console.log('[App] Reiniciando canción actual');
    player.restart();
  });

  // --- Notificaciones ---
  socket.on('notification', (data) => {
    notifications.show(data);
  });

  // =============================================
  // ACTUALIZAR UI
  // =============================================
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
    }
  }

  // =============================================
  // COLA
  // =============================================
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

  // =============================================
  // YOUTUBE PLAYER
  // =============================================
  player.onEnded(() => {
    socket.emit('song-ended');
  });

  // Manejar errores de vídeo
  player.onError((code, message) => {
    console.error(`[App] Error de vídeo: ${message}`);
    notifications.show({
      type: 'control',
      message: `❌ Error de vídeo: ${message}`,
      icon: '❌',
      duration: 5000
    });

    // Auto-skip al siguiente si el vídeo no funciona
    setTimeout(() => {
      socket.emit('song-ended');
    }, 3000);
  });

  // =============================================
  // MEDIAPIPE GESTURES (Stop=Pause, OK=Resume, X=Clear queue)
  // =============================================
  gestures.onGesture((data) => {
    socket.emit('gesture-detected', data);
  });

  gestures.start();

  console.log('[TV] App inicializada – Gestos + YouTube');
})();

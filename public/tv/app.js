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
  const claps = window.clapDetector;

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
  const clapStatus = document.getElementById('clap-status');

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
    // Reiniciar scroll de letras
    if (currentState && currentState.currentIndex >= 0) {
      const song = currentState.queue[currentState.currentIndex];
      if (song) {
        restartLyricsScroll();
      }
    }
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
  // LETRAS
  // =============================================
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

        startLyricsScroll();
      } else {
        throw new Error('Sin letras');
      }
    } catch (err) {
      console.warn('[Letras] No disponibles:', err.message);
      lyricsContent.innerHTML = '<p class="lyrics-placeholder">🎵 Letra no disponible para esta canción.<br>¡Canta de memoria! 🎤</p>';
    }
  }

  // --- Auto-scroll de letras ---
  let scrollInterval = null;
  let currentLyricsLine = 0;

  function startLyricsScroll() {
    if (scrollInterval) clearInterval(scrollInterval);
    currentLyricsLine = 0;

    const linesEls = lyricsContent.querySelectorAll('.lyrics-line');
    if (linesEls.length === 0) return;

    const intervalMs = 4000;

    scrollInterval = setInterval(() => {
      linesEls.forEach(el => el.classList.remove('active'));

      if (currentLyricsLine < linesEls.length) {
        linesEls[currentLyricsLine].classList.add('active');
        linesEls[currentLyricsLine].scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        currentLyricsLine++;
      } else {
        clearInterval(scrollInterval);
      }
    }, intervalMs);
  }

  function restartLyricsScroll() {
    currentLyricsLine = 0;
    const linesEls = lyricsContent.querySelectorAll('.lyrics-line');
    linesEls.forEach(el => el.classList.remove('active'));
    if (linesEls.length > 0) {
      linesEls[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    startLyricsScroll();
  }

  // =============================================
  // YOUTUBE PLAYER
  // =============================================
  player.onEnded(() => {
    if (scrollInterval) clearInterval(scrollInterval);
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
  // MEDIAPIPE GESTURES (Stop + OK)
  // =============================================
  gestures.onGesture((data) => {
    socket.emit('gesture-detected', data);
  });

  gestures.start();

  // =============================================
  // DOBLE APLAUSO (Clap Detector)
  // =============================================
  claps.onDoubleClap(() => {
    console.log('[App] ¡Doble aplauso! → Reiniciar canción');

    socket.emit('gesture-detected', {
      gesture: 'double-clap',
      action: 'restart',
      message: '👏👏 Doble aplauso → Reiniciando canción',
      icon: '👏',
      source: 'tv-microphone'
    });

    // También emitir restart directamente
    socket.emit('restart');
  });

  // Feedback visual de clap individual (debug)
  claps.onClap(() => {
    // Pequeño flash visual en el indicador
    if (clapStatus) {
      clapStatus.style.borderColor = 'rgba(244, 114, 182, 0.6)';
      setTimeout(() => {
        clapStatus.style.borderColor = '';
      }, 200);
    }
  });

  // Iniciar detección de aplausos
  claps.start().then(success => {
    if (success) {
      clapStatus.classList.remove('inactive');
      console.log('[App] Detector de aplausos activo');
    } else {
      clapStatus.classList.add('inactive');
      clapStatus.querySelector('span').textContent = 'Micrófono no disponible';
    }
  });

  console.log('[TV] App inicializada – Gestos + Aplausos + YouTube');
})();

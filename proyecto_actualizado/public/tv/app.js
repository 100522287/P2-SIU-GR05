/**
 * app.js – Lógica principal de la pantalla TV
 * 
 * FIXES APLICADOS:
 * - Catálogo de canciones visible en la TV con navegación por gestos
 * - Letras sincronizadas con el progreso real del vídeo (no intervalo fijo)
 * - YouTube player se inicializa y reproduce correctamente
 * - Clap detector no interfiere con gestos de mano
 * - Mejor manejo de estados play/pause/mute
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

  // Catálogo en TV
  const tvCatalog = document.getElementById('tv-catalog');
  const catalogGrid = document.getElementById('catalog-grid');

  let currentState = null;
  let lastLoadedVideoId = null;
  let tvSelectedIndex = 0;
  let tvBrowseActive = false;

  // =============================================
  // SOCKET.IO
  // =============================================
  socket.on('connect', () => {
    console.log('[Socket] Conectado:', socket.id);
    statusDot.classList.add('connected');
    statusText.textContent = 'Conectado';
  });

  socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Desconectado';
  });

  socket.on('sync-state', (state) => {
    currentState = state;
    updateUI(state);

    // Sincronizar estado de browse
    if (state.tvBrowse) {
      if (state.tvBrowse.active !== tvBrowseActive) {
        tvBrowseActive = state.tvBrowse.active;
        toggleCatalogView(tvBrowseActive);
      }
    }
  });

  socket.on('restart-song', () => {
    console.log('[App] Reiniciando canción actual');
    player.restart();
    restartLyricsScroll();
  });

  socket.on('notification', (data) => {
    notifications.show(data);
  });

  // Navegación en catálogo TV
  socket.on('tv-browse-nav', (direction) => {
    navigateCatalog(direction);
  });

  socket.on('tv-browse-confirm', () => {
    selectCatalogSong();
  });

  // =============================================
  // ACTUALIZAR UI
  // =============================================
  function updateUI(state) {
    renderQueue(state.queue, state.currentIndex);
    queueCount.textContent = state.queue.length;

    if (state.currentIndex >= 0 && state.currentIndex < state.queue.length) {
      const song = state.queue[state.currentIndex];
      currentTitle.textContent = song.title;
      currentArtist.textContent = song.artist;
      nowPlaying.classList.remove('hidden');
      playerOverlay.classList.add('hidden');

      // Cargar video si es diferente al actual
      if (song.youtubeId && song.youtubeId !== lastLoadedVideoId) {
        lastLoadedVideoId = song.youtubeId;
        console.log(`[App] Cargando nuevo vídeo: ${song.youtubeId} - ${song.title}`);
        player.loadVideo(song.youtubeId);
        loadLyrics(song.artist, song.title);
        
        // Informar al clap detector que hay música
        claps.setMusicPlaying(true);
      }

      // Control de reproducción
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
      nowPlaying.classList.add('hidden');
      playerOverlay.classList.remove('hidden');
      currentTitle.textContent = '—';
      currentArtist.textContent = '—';
      lastLoadedVideoId = null;
      claps.setMusicPlaying(false);
      lyricsContent.innerHTML = '<p class="lyrics-placeholder">Las letras aparecerán aquí cuando se reproduzca una canción...</p>';
    }
  }

  // =============================================
  // CATÁLOGO EN TV (navegación por gestos)
  // =============================================
  function renderCatalog() {
    if (!catalogGrid) return;
    const catalog = window.SONG_CATALOG || [];
    
    catalogGrid.innerHTML = catalog.map((song, i) => `
      <div class="catalog-item ${i === tvSelectedIndex ? 'selected' : ''}" data-index="${i}">
        <div class="catalog-item-emoji">🎵</div>
        <div class="catalog-item-info">
          <div class="catalog-item-title">${escapeHtml(song.title)}</div>
          <div class="catalog-item-artist">${escapeHtml(song.artist)}</div>
        </div>
      </div>
    `).join('');
  }

  function toggleCatalogView(show) {
    if (!tvCatalog) return;
    tvBrowseActive = show;
    if (show) {
      tvCatalog.classList.remove('hidden');
      tvSelectedIndex = 0;
      renderCatalog();
      notifications.show({
        type: 'info',
        message: '📋 Catálogo abierto – Usa gestos para navegar',
        icon: '📋',
        duration: 3000
      });
    } else {
      tvCatalog.classList.add('hidden');
    }
  }

  function navigateCatalog(direction) {
    if (!tvBrowseActive) return;
    const catalog = window.SONG_CATALOG || [];
    const columns = 2; // Grid de 2 columnas

    switch (direction) {
      case 'up':
        tvSelectedIndex = Math.max(0, tvSelectedIndex - columns);
        break;
      case 'down':
        tvSelectedIndex = Math.min(catalog.length - 1, tvSelectedIndex + columns);
        break;
      case 'left':
        tvSelectedIndex = Math.max(0, tvSelectedIndex - 1);
        break;
      case 'right':
        tvSelectedIndex = Math.min(catalog.length - 1, tvSelectedIndex + 1);
        break;
    }

    renderCatalog();

    // Scroll al elemento seleccionado
    const selectedEl = catalogGrid.querySelector('.catalog-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function selectCatalogSong() {
    if (!tvBrowseActive) return;
    const catalog = window.SONG_CATALOG || [];
    if (tvSelectedIndex < 0 || tvSelectedIndex >= catalog.length) return;

    const song = catalog[tvSelectedIndex];
    socket.emit('add-to-queue', {
      title: song.title,
      artist: song.artist,
      youtubeId: song.youtubeId,
      id: Date.now()
    });

    // Flash visual en el elemento seleccionado
    const selectedEl = catalogGrid.querySelector('.catalog-item.selected');
    if (selectedEl) {
      selectedEl.classList.add('added');
      setTimeout(() => selectedEl.classList.remove('added'), 1000);
    }

    notifications.show({
      type: 'queue',
      message: `🎵 "${song.title}" añadida a la cola`,
      icon: '🎵'
    });
  }

  // Renderizar catálogo inicial
  renderCatalog();

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
          <div class="queue-item-title">${escapeHtml(song.title)}</div>
          <div class="queue-item-artist">${escapeHtml(song.artist)}</div>
        </div>
      </div>
    `).join('');
  }

  // =============================================
  // LETRAS - SINCRONIZADAS CON VIDEO
  // =============================================
  let lyricsLines = [];
  let lyricsScrollInterval = null;
  let currentLyricsLine = 0;

  async function loadLyrics(artist, title) {
    lyricsContent.innerHTML = '<p class="lyrics-placeholder">Cargando letras...</p>';
    lyricsLines = [];
    currentLyricsLine = 0;

    if (lyricsScrollInterval) {
      clearInterval(lyricsScrollInterval);
      lyricsScrollInterval = null;
    }

    try {
      const response = await fetch(`/api/lyrics/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
      if (!response.ok) throw new Error('No encontradas');

      const data = await response.json();
      if (data.lyrics) {
        lyricsLines = data.lyrics.split('\n').filter(l => l.trim() !== '');
        lyricsContent.innerHTML = lyricsLines.map((line, i) =>
          `<div class="lyrics-line" data-index="${i}">${escapeHtml(line)}</div>`
        ).join('');

        // Iniciar sincronización basada en progreso del vídeo
        startSyncedLyricsScroll();
      } else {
        throw new Error('Sin letras');
      }
    } catch (err) {
      console.warn('[Letras] No disponibles:', err.message);
      lyricsContent.innerHTML = '<p class="lyrics-placeholder">🎵 Letra no disponible para esta canción.<br>¡Canta de memoria! 🎤</p>';
    }
  }

  /**
   * Scroll de letras sincronizado con el progreso del vídeo
   * En lugar de un intervalo fijo, usamos el porcentaje de progreso del vídeo
   */
  function startSyncedLyricsScroll() {
    if (lyricsScrollInterval) clearInterval(lyricsScrollInterval);
    currentLyricsLine = 0;

    const lineElements = lyricsContent.querySelectorAll('.lyrics-line');
    if (lineElements.length === 0) return;

    // Esperar a que el vídeo tenga duración
    let checkCount = 0;
    const waitForDuration = setInterval(() => {
      checkCount++;
      const duration = player.getDuration();
      
      if (duration > 0) {
        clearInterval(waitForDuration);
        
        // Calcular tiempo por línea basado en duración real del vídeo
        const timePerLine = (duration / lineElements.length) * 1000; // en ms
        const minInterval = 2000;  // Mínimo 2 segundos por línea
        const maxInterval = 6000;  // Máximo 6 segundos por línea
        const interval = Math.max(minInterval, Math.min(maxInterval, timePerLine));

        console.log(`[Letras] Duración: ${duration}s, Líneas: ${lineElements.length}, Intervalo: ${interval}ms`);

        lyricsScrollInterval = setInterval(() => {
          // Solo avanzar si el vídeo está reproduciéndose
          if (player.getPlayerState() !== 1) return;

          lineElements.forEach(el => el.classList.remove('active'));

          if (currentLyricsLine < lineElements.length) {
            lineElements[currentLyricsLine].classList.add('active');
            lineElements[currentLyricsLine].scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
            currentLyricsLine++;
          } else {
            clearInterval(lyricsScrollInterval);
          }
        }, interval);

      } else if (checkCount > 30) {
        // Fallback: si no se puede obtener duración, usar intervalo fijo
        clearInterval(waitForDuration);
        console.log('[Letras] No se pudo obtener duración, usando intervalo fijo');
        
        lyricsScrollInterval = setInterval(() => {
          if (player.getPlayerState() !== 1) return;

          lineElements.forEach(el => el.classList.remove('active'));
          if (currentLyricsLine < lineElements.length) {
            lineElements[currentLyricsLine].classList.add('active');
            lineElements[currentLyricsLine].scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
            currentLyricsLine++;
          } else {
            clearInterval(lyricsScrollInterval);
          }
        }, 3500);
      }
    }, 500);
  }

  function restartLyricsScroll() {
    currentLyricsLine = 0;
    const lineElements = lyricsContent.querySelectorAll('.lyrics-line');
    lineElements.forEach(el => el.classList.remove('active'));
    if (lineElements.length > 0) {
      lineElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    startSyncedLyricsScroll();
  }

  // =============================================
  // YOUTUBE PLAYER
  // =============================================
  player.onEnded(() => {
    if (lyricsScrollInterval) clearInterval(lyricsScrollInterval);
    claps.setMusicPlaying(false);
    socket.emit('song-ended');
  });

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
  // MEDIAPIPE GESTURES
  // =============================================
  gestures.onGesture((data) => {
    socket.emit('gesture-detected', data);
  });

  gestures.start();

  // =============================================
  // DOBLE APLAUSO
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

    socket.emit('restart');
  });

  claps.onClap(() => {
    if (clapStatus) {
      clapStatus.style.borderColor = 'rgba(244, 114, 182, 0.6)';
      setTimeout(() => {
        clapStatus.style.borderColor = '';
      }, 200);
    }
  });

  claps.start().then(success => {
    if (success && clapStatus) {
      clapStatus.classList.remove('inactive');
      console.log('[App] Detector de aplausos activo');
    } else if (clapStatus) {
      clapStatus.classList.add('inactive');
      const span = clapStatus.querySelector('span');
      if (span) span.textContent = 'Micrófono no disponible';
    }
  });

  // =============================================
  // HELPERS
  // =============================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  console.log('[TV] App inicializada – Gestos + Aplausos + YouTube + Catálogo');
})();

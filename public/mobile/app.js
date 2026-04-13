/**
 * app.js – Lógica principal del controlador móvil
 * Conecta: Socket.IO, búsqueda, gestos de movimiento, comandos de voz
 */
(function () {
  'use strict';

  const socket = io();
  const motion = window.motionDetector;
  const voice = window.voiceCommands;
  const search = window.searchEngine;

  // --- Elementos del DOM ---
  const connectionBadge = document.getElementById('connection-badge');
  const connDot = connectionBadge.querySelector('.conn-dot');
  const connText = document.getElementById('conn-text');

  // Tabs
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  const tabQueueBadge = document.getElementById('tab-queue-badge');

  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const catalogList = document.getElementById('catalog-list');
  const searchResults = document.getElementById('search-results');
  const modeText = document.getElementById('mode-text');
  const modeSemantic = document.getElementById('mode-semantic');
  const semanticStatus = document.getElementById('semantic-status');

  // Controls
  const mobileCurrentTitle = document.getElementById('mobile-current-title');
  const mobileCurrentArtist = document.getElementById('mobile-current-artist');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const playPauseLabel = document.getElementById('play-pause-label');
  const btnSkip = document.getElementById('btn-skip');
  const btnPrevious = document.getElementById('btn-previous');
  const btnMute = document.getElementById('btn-mute');
  const muteIcon = document.getElementById('mute-icon');
  const volumeSlider = document.getElementById('volume-slider');

  // Voice
  const btnVoice = document.getElementById('btn-voice');
  const voiceFeedback = document.getElementById('voice-feedback');
  const voiceResult = document.getElementById('voice-result');
  const btnVoiceContinuous = document.getElementById('btn-voice-continuous');
  const continuousStatus = document.getElementById('continuous-status');

  // Queue
  const mobileQueueList = document.getElementById('mobile-queue-list');

  // Gesture flash
  const gestureFlash = document.getElementById('gesture-flash');
  const flashIcon = document.getElementById('flash-icon');
  const flashText = document.getElementById('flash-text');

  // Mobile notifications
  const mobileNotifs = document.getElementById('mobile-notifications');

  let currentState = null;

  // =============================================
  // SOCKET.IO
  // =============================================
  socket.on('connect', () => {
    console.log('[Socket] Conectado:', socket.id);
    connDot.classList.add('connected');
    connText.textContent = 'Conectado';
  });

  socket.on('disconnect', () => {
    connDot.classList.remove('connected');
    connText.textContent = 'Desconectado';
  });

  socket.on('sync-state', (state) => {
    currentState = state;
    updateControlsUI(state);
    updateQueueUI(state);
    tabQueueBadge.textContent = state.queue.length;
  });

  socket.on('notification', (data) => {
    showMobileNotification(data.icon + ' ' + data.message);
  });

  // =============================================
  // TAB NAVIGATION
  // =============================================
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`panel-${targetTab}`).classList.add('active');
    });
  });

  // =============================================
  // SEARCH
  // =============================================
  search.init(window.SONG_CATALOG);

  // Renderizar catálogo inicial
  renderSongList(window.SONG_CATALOG, catalogList);

  // Búsqueda en tiempo real
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    searchClear.classList.toggle('hidden', query === '');

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const results = await search.search(query);
      if (query === '') {
        searchResults.innerHTML = '<h3 class="section-title">🎵 Catálogo de canciones</h3><div id="catalog-list" class="song-list"></div>';
        renderSongList(window.SONG_CATALOG, document.getElementById('catalog-list'));
      } else {
        searchResults.innerHTML = `<h3 class="section-title">🔍 Resultados (${results.length})</h3><div id="catalog-list" class="song-list"></div>`;
        renderSongList(results, document.getElementById('catalog-list'));
      }
    }, 300);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    searchResults.innerHTML = '<h3 class="section-title">🎵 Catálogo de canciones</h3><div id="catalog-list" class="song-list"></div>';
    renderSongList(window.SONG_CATALOG, document.getElementById('catalog-list'));
  });

  // Modo de búsqueda
  modeText.addEventListener('click', () => {
    modeText.classList.add('active');
    modeSemantic.classList.remove('active');
    search.setMode('text');
    semanticStatus.classList.add('hidden');
  });

  modeSemantic.addEventListener('click', async () => {
    modeSemantic.classList.add('active');
    modeText.classList.remove('active');
    search.setMode('semantic');

    if (!search.isModelLoaded && !search.isLoading) {
      semanticStatus.classList.remove('hidden');
      semanticStatus.classList.remove('ready');
      semanticStatus.innerHTML = '<div class="loading-spinner"></div><span>Cargando modelo de IA... (primera vez puede tardar ~30s)</span>';

      try {
        await search.loadModel((progress) => {
          semanticStatus.innerHTML = `<div class="loading-spinner"></div><span>Descargando modelo... ${progress}%</span>`;
        });
        semanticStatus.classList.add('ready');
        semanticStatus.innerHTML = '<span>✅ Modelo IA cargado – Búsqueda semántica activa</span>';
      } catch (err) {
        semanticStatus.innerHTML = '<span>❌ Error al cargar el modelo. Usando búsqueda por texto.</span>';
        search.setMode('text');
        modeText.classList.add('active');
        modeSemantic.classList.remove('active');
      }
    } else if (search.isModelLoaded) {
      semanticStatus.classList.remove('hidden');
      semanticStatus.classList.add('ready');
      semanticStatus.innerHTML = '<span>✅ Modelo IA cargado – Búsqueda semántica activa</span>';
    }
  });

  // =============================================
  // RENDER SONG LIST
  // =============================================
  function renderSongList(songs, container) {
    if (!container) return;
    if (songs.length === 0) {
      container.innerHTML = '<p class="empty-message">No se encontraron canciones</p>';
      return;
    }

    container.innerHTML = songs.map((song, i) => `
      <div class="song-card" data-index="${i}" data-title="${escapeHtml(song.title)}" data-artist="${escapeHtml(song.artist)}" data-yt="${song.youtubeId || ''}">
        <div class="song-emoji">🎵</div>
        <div class="song-info">
          <div class="song-name">${escapeHtml(song.title)}</div>
          <div class="song-artist-name">${escapeHtml(song.artist)}</div>
        </div>
        <button class="song-add-btn" title="Añadir a la cola">+</button>
      </div>
    `).join('');

    container.querySelectorAll('.song-card').forEach(card => {
      const addBtn = card.querySelector('.song-add-btn');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addSong(card);
      });
      card.addEventListener('click', () => {
        addSong(card);
      });
    });
  }

  function addSong(card) {
    const song = {
      title: card.dataset.title,
      artist: card.dataset.artist,
      youtubeId: card.dataset.yt,
      id: Date.now()
    };

    socket.emit('add-to-queue', song);

    card.classList.add('added');
    const btn = card.querySelector('.song-add-btn');
    btn.textContent = '✓';
    setTimeout(() => {
      card.classList.remove('added');
      btn.textContent = '+';
    }, 1500);

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    showMobileNotification(`🎵 "${song.title}" añadida a la cola`);
  }

  // =============================================
  // CONTROLS
  // =============================================
  function updateControlsUI(state) {
    if (state.currentIndex >= 0 && state.currentIndex < state.queue.length) {
      const song = state.queue[state.currentIndex];
      mobileCurrentTitle.textContent = song.title;
      mobileCurrentArtist.textContent = song.artist;
    } else {
      mobileCurrentTitle.textContent = 'Sin reproducción';
      mobileCurrentArtist.textContent = 'Añade canciones para empezar';
    }

    if (state.isPlaying) {
      playPauseIcon.textContent = '⏸️';
      playPauseLabel.textContent = 'Pausa';
    } else {
      playPauseIcon.textContent = '▶️';
      playPauseLabel.textContent = 'Play';
    }

    if (state.isMuted) {
      muteIcon.textContent = '🔊';
      btnMute.classList.add('muted');
    } else {
      muteIcon.textContent = '🔇';
      btnMute.classList.remove('muted');
    }

    volumeSlider.value = state.volume;
  }

  btnPlayPause.addEventListener('click', () => {
    if (currentState && currentState.isPlaying) {
      socket.emit('pause');
    } else {
      socket.emit('play');
    }
  });

  btnSkip.addEventListener('click', () => {
    socket.emit('skip');
    if (navigator.vibrate) navigator.vibrate(30);
  });

  btnPrevious.addEventListener('click', () => {
    socket.emit('previous');
    if (navigator.vibrate) navigator.vibrate(30);
  });

  btnMute.addEventListener('click', () => {
    socket.emit('mute');
  });

  volumeSlider.addEventListener('input', () => {
    socket.emit('set-volume', parseInt(volumeSlider.value));
  });

  // =============================================
  // QUEUE
  // =============================================
  function updateQueueUI(state) {
    if (state.queue.length === 0) {
      mobileQueueList.innerHTML = '<p class="empty-message">No hay canciones en la cola.<br>¡Busca y añade desde la pestaña de búsqueda!</p>';
      return;
    }

    mobileQueueList.innerHTML = state.queue.map((song, i) => `
      <div class="queue-song-card ${i === state.currentIndex ? 'playing' : ''}">
        <span class="q-number">${i === state.currentIndex ? '▶' : i + 1}</span>
        <div class="q-info">
          <div class="q-title">${escapeHtml(song.title)}</div>
          <div class="q-artist">${escapeHtml(song.artist)}</div>
        </div>
        <button class="q-remove" data-index="${i}" title="Eliminar">✕</button>
      </div>
    `).join('');

    mobileQueueList.querySelectorAll('.q-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        socket.emit('remove-from-queue', index);
        if (navigator.vibrate) navigator.vibrate(30);
      });
    });
  }

  // =============================================
  // VOICE COMMANDS
  // =============================================

  // --- Botón de escucha manual (pulsación única) ---
  btnVoice.addEventListener('click', () => {
    if (!voice.isSupported) {
      showMobileNotification('❌ Tu navegador no soporta reconocimiento de voz');
      return;
    }

    if (voice.manualMode && voice.isListening) {
      voice.stopListening();
      btnVoice.classList.remove('listening');
    } else {
      voice.startListening();
      btnVoice.classList.add('listening');
      voiceFeedback.classList.add('hidden');

      setTimeout(() => {
        btnVoice.classList.remove('listening');
      }, 5000);
    }
  });

  // --- Botón de escucha continua (toggle) ---
  btnVoiceContinuous.addEventListener('click', () => {
    if (!voice.isSupported) {
      showMobileNotification('❌ Tu navegador no soporta reconocimiento de voz');
      return;
    }

    if (voice.isContinuousActive) {
      voice.stopContinuousListening();
      btnVoiceContinuous.classList.remove('active');
      continuousStatus.classList.add('hidden');
      showMobileNotification('🎙️ Escucha continua desactivada');
    } else {
      voice.startContinuousListening();
      btnVoiceContinuous.classList.add('active');
      continuousStatus.classList.remove('hidden');
      showMobileNotification('🎙️ Escucha continua activada – Di "karaoke" + comando');
    }
  });

  // --- Callback de comandos de voz ---
  voice.onCommand((cmd) => {
    btnVoice.classList.remove('listening');
    voiceFeedback.classList.remove('hidden');
    voiceFeedback.classList.remove('error');

    if (cmd.action === 'unknown' || cmd.action === 'error') {
      voiceFeedback.classList.add('error');
      voiceResult.textContent = cmd.message;
      return;
    }

    const wakeLabel = cmd.wakeWord ? ' (voz continua)' : '';
    voiceResult.textContent = `${cmd.icon} ${cmd.message}${wakeLabel}`;

    // Enviar comando al servidor
    socket.emit('voice-command', { command: cmd.keyword || cmd.action });

    // Ejecutar la acción
    const gestureData = {
      gesture: `voice-${cmd.action}`,
      action: cmd.action,
      message: `🎤 Voz: "${cmd.keyword}" → ${cmd.message}`,
      icon: '🎤',
      source: 'mobile-voice'
    };

    switch (cmd.action) {
      case 'skip':
        socket.emit('gesture-detected', gestureData);
        break;
      case 'pause':
        socket.emit('gesture-detected', gestureData);
        break;
      case 'play':
        socket.emit('gesture-detected', gestureData);
        break;
      case 'mute':
        socket.emit('gesture-detected', gestureData);
        break;
      case 'previous':
        socket.emit('gesture-detected', {
          ...gestureData,
          action: 'previous'
        });
        break;
    }

    if (navigator.vibrate) navigator.vibrate(50);
  });

  // =============================================
  // MOTION GESTURES (Shake + Drop)
  // =============================================
  motion.onShake(() => {
    console.log('[App] Shake detectado → Skip');
    showGestureFlash('📱', '¡Agitar! → Siguiente canción');

    socket.emit('gesture-detected', {
      gesture: 'shake',
      action: 'skip',
      message: '📱 Agitar → Siguiente canción',
      icon: '📱',
      source: 'mobile-motion'
    });

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    highlightGestureCard('gesture-shake');
  });


  // Iniciar detección de movimiento
  motion.start();

  // =============================================
  // UI HELPERS
  // =============================================
  function showGestureFlash(icon, text) {
    flashIcon.textContent = icon;
    flashText.textContent = text;
    gestureFlash.classList.remove('hidden');
    gestureFlash.classList.add('visible');

    setTimeout(() => {
      gestureFlash.classList.remove('visible');
      setTimeout(() => {
        gestureFlash.classList.add('hidden');
      }, 300);
    }, 1500);
  }

  function highlightGestureCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
      card.classList.add('triggered');
      setTimeout(() => card.classList.remove('triggered'), 1000);
    }
  }

  function showMobileNotification(message) {
    const el = document.createElement('div');
    el.className = 'mobile-notif';
    el.textContent = message;
    mobileNotifs.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 1500);

    while (mobileNotifs.children.length > 3) {
      mobileNotifs.removeChild(mobileNotifs.firstChild);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  console.log('[Mobile] App inicializada');
})();

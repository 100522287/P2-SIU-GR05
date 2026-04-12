/**
 * youtube-player.js – Control del reproductor YouTube IFrame API
 * 
 * FIXES APLICADOS:
 * - El player ahora usa autoplay correctamente
 * - loadVideoById se llama solo cuando el player está ready
 * - Manejo robusto de errores de vídeo con auto-skip
 * - origin parameter correcto para evitar postMessage errors
 * - Reintentos de API con fallback
 */
class KaraokePlayer {
  constructor() {
    this.player = null;
    this.ready = false;
    this.currentVideoId = null;
    this.onEndedCallback = null;
    this.onErrorCallback = null;
    this._pendingCommands = [];
    this._retryCount = 0;
    this._maxRetries = 3;
    this._apiLoaded = false;
    this._playerCreated = false;
    this._initAPI();
  }

  _initAPI() {
    // Si ya existe la API de YouTube
    if (window.YT && window.YT.Player) {
      console.log('[YouTube] API ya disponible');
      this._apiLoaded = true;
      this._createPlayer();
      return;
    }

    // Registrar callback ANTES de insertar el script
    window.onYouTubeIframeAPIReady = () => {
      console.log('[YouTube] API cargada correctamente');
      this._apiLoaded = true;
      this._createPlayer();
    };

    this._loadScript();

    // Timeout de seguridad
    setTimeout(() => {
      if (!this._apiLoaded) {
        console.warn('[YouTube] Timeout cargando API, reintentando...');
        this._retryLoadAPI();
      }
    }, 10000);
  }

  _loadScript() {
    const existing = document.getElementById('yt-iframe-api');
    if (existing) existing.remove();

    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      console.error('[YouTube] Error cargando script');
      this._retryLoadAPI();
    };
    document.head.appendChild(tag);
  }

  _retryLoadAPI() {
    this._retryCount++;
    if (this._retryCount <= this._maxRetries) {
      console.log(`[YouTube] Reintento ${this._retryCount}/${this._maxRetries}...`);
      setTimeout(() => this._loadScript(), 2000 * this._retryCount);
    } else {
      console.error('[YouTube] No se pudo cargar la API');
    }
  }

  _createPlayer() {
    if (this._playerCreated) return;

    const container = document.getElementById('youtube-player');
    if (!container) {
      console.error('[YouTube] Contenedor #youtube-player no encontrado');
      return;
    }

    const origin = window.location.origin;

    try {
      this._playerCreated = true;
      this.player = new YT.Player('youtube-player', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,          // CAMBIO: autoplay activado
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 1,
          origin: origin,
          enablejsapi: 1,
          widget_referrer: origin
        },
        events: {
          onReady: (event) => {
            console.log('[YouTube] Player listo ✓');
            this.ready = true;
            this._flushPendingCommands();
          },
          onStateChange: (event) => this._onStateChange(event),
          onError: (event) => this._onError(event)
        }
      });

    } catch (err) {
      console.error('[YouTube] Error creando player:', err);
      this._playerCreated = false;
    }
  }

  _onStateChange(event) {
    switch (event.data) {
      case YT.PlayerState.ENDED: // 0
        console.log('[YouTube] Canción terminada');
        if (this.onEndedCallback) {
          this.onEndedCallback();
        }
        break;
      case YT.PlayerState.PLAYING: // 1
        console.log('[YouTube] Reproduciendo');
        break;
      case YT.PlayerState.PAUSED: // 2
        console.log('[YouTube] Pausado');
        break;
      case YT.PlayerState.BUFFERING: // 3
        console.log('[YouTube] Buffering...');
        break;
      case YT.PlayerState.CUED: // 5
        console.log('[YouTube] Vídeo cargado (cued)');
        break;
    }
  }

  _onError(event) {
    const errorCodes = {
      2: 'ID de vídeo inválido',
      5: 'Error interno del reproductor HTML5',
      100: 'Vídeo no encontrado (eliminado o privado)',
      101: 'Vídeo no permite reproducción embebida',
      150: 'Vídeo no permite reproducción embebida'
    };

    const errorMsg = errorCodes[event.data] || `Error desconocido (${event.data})`;
    console.error(`[YouTube] Error: ${errorMsg}`);

    if (this.onErrorCallback) {
      this.onErrorCallback(event.data, errorMsg);
    }
  }

  _queueCommand(fn) {
    if (this.ready && this.player) {
      try {
        fn();
      } catch (e) {
        console.warn('[YouTube] Error ejecutando comando:', e);
      }
    } else {
      this._pendingCommands.push(fn);
    }
  }

  _flushPendingCommands() {
    const commands = [...this._pendingCommands];
    this._pendingCommands = [];
    for (const cmd of commands) {
      try { cmd(); } catch (e) { console.warn('[YouTube] Error en comando pendiente:', e); }
    }
  }

  /**
   * Cargar y reproducir un video por ID
   * FIX: Asegurar que el vídeo se carga Y se reproduce
   */
  loadVideo(videoId) {
    if (!videoId) {
      console.warn('[YouTube] No se proporcionó ID de vídeo');
      return;
    }

    this.currentVideoId = videoId;
    console.log(`[YouTube] Solicitando cargar vídeo: ${videoId}`);

    this._queueCommand(() => {
      try {
        // Usar loadVideoById que auto-reproduce
        this.player.loadVideoById({
          videoId: videoId,
          suggestedQuality: 'default'
        });
        
        const overlay = document.getElementById('player-overlay');
        if (overlay) overlay.classList.add('hidden');
        
        console.log(`[YouTube] Vídeo cargado: ${videoId}`);
      } catch (err) {
        console.error('[YouTube] Error al cargar vídeo:', err);
      }
    });
  }

  /**
   * Reiniciar la canción actual desde el principio
   */
  restart() {
    this._queueCommand(() => {
      try {
        this.player.seekTo(0, true);
        this.player.playVideo();
        console.log('[YouTube] Reiniciando canción');
      } catch (err) {
        console.error('[YouTube] Error al reiniciar:', err);
      }
    });
  }

  /**
   * Obtener el tiempo actual de reproducción en segundos
   */
  getCurrentTime() {
    if (this.ready && this.player && typeof this.player.getCurrentTime === 'function') {
      try {
        return this.player.getCurrentTime();
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Obtener la duración total del vídeo
   */
  getDuration() {
    if (this.ready && this.player && typeof this.player.getDuration === 'function') {
      try {
        return this.player.getDuration();
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  play() {
    this._queueCommand(() => {
      try { this.player.playVideo(); } catch (e) { /* ignore */ }
    });
  }

  pause() {
    this._queueCommand(() => {
      try { this.player.pauseVideo(); } catch (e) { /* ignore */ }
    });
  }

  stop() {
    this._queueCommand(() => {
      try { this.player.stopVideo(); } catch (e) { /* ignore */ }
    });
  }

  mute() {
    this._queueCommand(() => {
      try { this.player.mute(); } catch (e) { /* ignore */ }
    });
  }

  unmute() {
    this._queueCommand(() => {
      try { this.player.unMute(); } catch (e) { /* ignore */ }
    });
  }

  setVolume(vol) {
    this._queueCommand(() => {
      try { this.player.setVolume(vol); } catch (e) { /* ignore */ }
    });
  }

  getPlayerState() {
    if (this.ready && this.player) {
      try { return this.player.getPlayerState(); } catch (e) { return -1; }
    }
    return -1;
  }

  isPlaying() {
    return this.getPlayerState() === 1;
  }

  onEnded(callback) {
    this.onEndedCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }
}

// Singleton global
window.karaokePlayer = new KaraokePlayer();

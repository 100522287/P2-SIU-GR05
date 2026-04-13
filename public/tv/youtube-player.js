/**
 * youtube-player.js – Control del reproductor YouTube IFrame API
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
    this._initAPI();
  }

  _initAPI() {
    if (window.YT && window.YT.Player) {
      console.log('[YouTube] API ya disponible, creando player...');
      this._apiLoaded = true;
      this._createPlayer();
      return;
    }
    window.onYouTubeIframeAPIReady = () => {
      console.log('[YouTube] API cargada');
      this._apiLoaded = true;
      this._createPlayer();
    };
    this._loadScript();
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
      console.error('[YouTube] Error cargando script de la API');
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
      console.error('[YouTube] No se pudo cargar la API después de varios intentos');
      this._showError('No se pudo cargar el reproductor de YouTube. Comprueba tu conexión a internet.');
    }
  }

  _createPlayer() {
    const container = document.getElementById('youtube-player');
    if (!container) {
      console.error('[YouTube] Contenedor #youtube-player no encontrado');
      return;
    }
    const origin = window.location.origin;
    try {
      this.player = new YT.Player('youtube-player', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0, controls: 1, modestbranding: 1, rel: 0, fs: 1,
          iv_load_policy: 3, cc_load_policy: 0, playsinline: 1,
          origin: origin, enablejsapi: 1, widget_referrer: origin
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
      setTimeout(() => {
        if (!this.ready) {
          console.warn('[YouTube] Player no se inicializó en 15s, recreando...');
          this._recreatePlayer();
        }
      }, 15000);
    } catch (err) {
      console.error('[YouTube] Error creando player:', err);
      this._recreatePlayer();
    }
  }

  _recreatePlayer() {
    if (this._retryCount >= this._maxRetries) return;
    this._retryCount++;
    const oldPlayer = document.getElementById('youtube-player');
    if (oldPlayer && oldPlayer.tagName === 'IFRAME') {
      const newDiv = document.createElement('div');
      newDiv.id = 'youtube-player';
      oldPlayer.replaceWith(newDiv);
    }
    this.player = null;
    this.ready = false;
    console.log(`[YouTube] Recreando player... intento ${this._retryCount}`);
    setTimeout(() => this._createPlayer(), 1000);
  }

  _onStateChange(event) {
    switch (event.data) {
      case 0:
        console.log('[YouTube] Canción terminada');
        if (this.onEndedCallback) this.onEndedCallback();
        break;
      case 1: console.log('[YouTube] Reproduciendo'); break;
      case 2: console.log('[YouTube] Pausado'); break;
      case -1: console.log('[YouTube] Estado: no iniciado'); break;
    }
  }

  _onError(event) {
    const errorCodes = {
      2: 'ID de vídeo inválido', 5: 'Error interno del reproductor HTML5',
      100: 'Vídeo no encontrado (eliminado o privado)',
      101: 'Vídeo no permite reproducción embebida',
      150: 'Vídeo no permite reproducción embebida'
    };
    const errorMsg = errorCodes[event.data] || `Error desconocido (${event.data})`;
    console.error(`[YouTube] Error: ${errorMsg}`);
    if (this.onErrorCallback) this.onErrorCallback(event.data, errorMsg);
  }

  _showError(message) {
    const overlay = document.getElementById('player-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.querySelector('.overlay-text').textContent = message;
      overlay.querySelector('.overlay-subtext').textContent = 'Recarga la página para reintentar';
    }
  }

  _queueCommand(fn) {
    if (this.ready && this.player) { fn(); }
    else { this._pendingCommands.push(fn); }
  }

  _flushPendingCommands() {
    while (this._pendingCommands.length > 0) {
      const cmd = this._pendingCommands.shift();
      try { cmd(); } catch (e) { console.warn('[YouTube] Error ejecutando comando pendiente:', e); }
    }
  }

  loadVideo(videoId) {
    if (!videoId) { console.warn('[YouTube] No se proporcionó ID de vídeo'); return; }
    this.currentVideoId = videoId;
    this._queueCommand(() => {
      try {
        this.player.loadVideoById({ videoId: videoId, suggestedQuality: 'default' });
        document.getElementById('player-overlay').classList.add('hidden');
        console.log(`[YouTube] Cargando vídeo: ${videoId}`);
      } catch (err) { console.error('[YouTube] Error al cargar vídeo:', err); }
    });
  }

  restart() {
    this._queueCommand(() => {
      try { this.player.seekTo(0, true); this.player.playVideo(); console.log('[YouTube] Reiniciando canción'); }
      catch (err) { console.error('[YouTube] Error al reiniciar:', err); }
    });
  }

  play() { this._queueCommand(() => { try { this.player.playVideo(); } catch(e) {} }); }
  pause() { this._queueCommand(() => { try { this.player.pauseVideo(); } catch(e) {} }); }
  stop() { this._queueCommand(() => { try { this.player.stopVideo(); } catch(e) {} }); }
  mute() { this._queueCommand(() => { try { this.player.mute(); } catch(e) {} }); }
  unmute() { this._queueCommand(() => { try { this.player.unMute(); } catch(e) {} }); }
  setVolume(vol) { this._queueCommand(() => { try { this.player.setVolume(vol); } catch(e) {} }); }

  isPlaying() {
    if (this.ready && this.player) {
      try { return this.player.getPlayerState() === 1; } catch(e) { return false; }
    }
    return false;
  }

  onEnded(callback) { this.onEndedCallback = callback; }
  onError(callback) { this.onErrorCallback = callback; }
}

window.karaokePlayer = new KaraokePlayer();

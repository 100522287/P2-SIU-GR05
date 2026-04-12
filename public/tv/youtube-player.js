/**
 * youtube-player.js – Control del reproductor YouTube IFrame API
 */
class KaraokePlayer {
  constructor() {
    this.player = null;
    this.ready = false;
    this.currentVideoId = null;
    this.onEndedCallback = null;
    this._initAPI();
  }

  _initAPI() {
    // Cargar YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);

    // Callback global que YouTube llama cuando la API está lista
    window.onYouTubeIframeAPIReady = () => {
      this.player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 1,
          iv_load_policy: 3,
          cc_load_policy: 0
        },
        events: {
          onReady: () => {
            console.log('[YouTube] Player listo');
            this.ready = true;
          },
          onStateChange: (event) => this._onStateChange(event),
          onError: (event) => {
            console.error('[YouTube] Error:', event.data);
          }
        }
      });
    };
  }

  _onStateChange(event) {
    // YT.PlayerState.ENDED === 0
    if (event.data === 0) {
      console.log('[YouTube] Canción terminada');
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    }
  }

  /**
   * Cargar y reproducir un video por ID
   */
  loadVideo(videoId) {
    if (!this.ready || !this.player) {
      console.warn('[YouTube] Player no listo aún');
      return;
    }
    this.currentVideoId = videoId;
    this.player.loadVideoById(videoId);
    document.getElementById('player-overlay').classList.add('hidden');
  }

  play() {
    if (this.ready && this.player) {
      this.player.playVideo();
    }
  }

  pause() {
    if (this.ready && this.player) {
      this.player.pauseVideo();
    }
  }

  stop() {
    if (this.ready && this.player) {
      this.player.stopVideo();
    }
  }

  mute() {
    if (this.ready && this.player) {
      this.player.mute();
    }
  }

  unmute() {
    if (this.ready && this.player) {
      this.player.unMute();
    }
  }

  setVolume(vol) {
    if (this.ready && this.player) {
      this.player.setVolume(vol);
    }
  }

  isPlaying() {
    if (this.ready && this.player) {
      return this.player.getPlayerState() === 1;
    }
    return false;
  }

  /**
   * Registrar callback cuando termina la canción
   */
  onEnded(callback) {
    this.onEndedCallback = callback;
  }
}

// Singleton global
window.karaokePlayer = new KaraokePlayer();

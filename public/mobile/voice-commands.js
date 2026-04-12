/**
 * voice-commands.js – Comandos de voz con Web Speech API
 * Reconoce: "siguiente", "pausa", "reproducir"/"play", "silencio"/"mute"
 */
class VoiceCommands {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.onCommandCallback = null;

    // Comandos soportados y sus acciones
    this.commands = {
      'siguiente':    { action: 'skip',    message: 'Siguiente canción',  icon: '⏭️' },
      'next':         { action: 'skip',    message: 'Siguiente canción',  icon: '⏭️' },
      'saltar':       { action: 'skip',    message: 'Saltar canción',     icon: '⏭️' },
      'pausa':        { action: 'pause',   message: 'Pausar',             icon: '⏸️' },
      'pausar':       { action: 'pause',   message: 'Pausar',             icon: '⏸️' },
      'para':         { action: 'pause',   message: 'Pausar',             icon: '⏸️' },
      'parar':        { action: 'pause',   message: 'Pausar',             icon: '⏸️' },
      'stop':         { action: 'pause',   message: 'Pausar',             icon: '⏸️' },
      'reproducir':   { action: 'play',    message: 'Reproducir',         icon: '▶️' },
      'play':         { action: 'play',    message: 'Reproducir',         icon: '▶️' },
      'continuar':    { action: 'play',    message: 'Reproducir',         icon: '▶️' },
      'silencio':     { action: 'mute',    message: 'Silenciar',          icon: '🔇' },
      'mute':         { action: 'mute',    message: 'Silenciar',          icon: '🔇' },
      'callar':       { action: 'mute',    message: 'Silenciar',          icon: '🔇' },
      'silenciar':    { action: 'mute',    message: 'Silenciar',          icon: '🔇' },
    };

    this._init();
  }

  _init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[Voz] Web Speech API no soportada en este navegador');
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => this._onResult(event);
    this.recognition.onerror = (event) => this._onError(event);
    this.recognition.onend = () => {
      this.isListening = false;
    };

    console.log('[Voz] Web Speech API inicializada');
  }

  /**
   * Empezar a escuchar un comando
   */
  startListening() {
    if (!this.isSupported || this.isListening) return;

    try {
      this.recognition.start();
      this.isListening = true;
      console.log('[Voz] Escuchando...');
    } catch (err) {
      console.error('[Voz] Error al iniciar:', err);
    }
  }

  /**
   * Parar de escuchar
   */
  stopListening() {
    if (!this.isSupported || !this.isListening) return;

    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (err) {
      // Ignorar
    }
  }

  /**
   * Procesar resultado del reconocimiento
   */
  _onResult(event) {
    const results = event.results[0];
    let matchedCommand = null;

    // Buscar en todas las alternativas
    for (let i = 0; i < results.length; i++) {
      const transcript = results[i].transcript.toLowerCase().trim();
      console.log(`[Voz] Reconocido (alt ${i}): "${transcript}"`);

      // Buscar coincidencia con comandos
      for (const [keyword, cmd] of Object.entries(this.commands)) {
        if (transcript.includes(keyword)) {
          matchedCommand = { ...cmd, transcript: transcript, keyword: keyword };
          break;
        }
      }
      if (matchedCommand) break;
    }

    if (matchedCommand) {
      console.log(`[Voz] Comando detectado: ${matchedCommand.action}`);
      if (this.onCommandCallback) {
        this.onCommandCallback(matchedCommand);
      }
    } else {
      const transcript = results[0].transcript;
      console.log(`[Voz] No se reconoció comando en: "${transcript}"`);
      if (this.onCommandCallback) {
        this.onCommandCallback({
          action: 'unknown',
          message: `No entendido: "${transcript}"`,
          icon: '❓',
          transcript: transcript
        });
      }
    }
  }

  _onError(event) {
    console.warn('[Voz] Error:', event.error);
    this.isListening = false;

    if (event.error === 'not-allowed') {
      if (this.onCommandCallback) {
        this.onCommandCallback({
          action: 'error',
          message: 'Permiso de micrófono denegado',
          icon: '🚫'
        });
      }
    }
  }

  /**
   * Registrar callback para comandos detectados
   */
  onCommand(callback) {
    this.onCommandCallback = callback;
  }
}

// Singleton
window.voiceCommands = new VoiceCommands();

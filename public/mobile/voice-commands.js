/**
 * voice-commands.js – Comandos de voz con Web Speech API
 * 
 * MODO DUAL:
 *   1. Pulsar botón → escucha un comando directamente
 *   2. Escucha continua → detecta la palabra clave "karaoke" seguida de un comando
 *      Ejemplo: "karaoke siguiente", "karaoke pausa"
 * 
 * Comandos: "siguiente", "pausa", "reproducir"/"play", "silencio"/"mute", "anterior"
 */
class VoiceCommands {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.onCommandCallback = null;

    // Modo de escucha
    this.continuousMode = false;     // Si está en escucha continua (wake word)
    this.manualMode = false;         // Si está en escucha manual (botón)
    this._restartTimeout = null;
    this._isStopping = false;

    // Comandos soportados y sus acciones
    this.commands = {
      'siguiente':    { action: 'skip',     message: 'Siguiente canción',  icon: '⏭️' },
      'next':         { action: 'skip',     message: 'Siguiente canción',  icon: '⏭️' },
      'saltar':       { action: 'skip',     message: 'Saltar canción',     icon: '⏭️' },
      'pausa':        { action: 'pause',    message: 'Pausar',             icon: '⏸️' },
      'pausar':       { action: 'pause',    message: 'Pausar',             icon: '⏸️' },
      'para':         { action: 'pause',    message: 'Pausar',             icon: '⏸️' },
      'parar':        { action: 'pause',    message: 'Pausar',             icon: '⏸️' },
      'stop':         { action: 'pause',    message: 'Pausar',             icon: '⏸️' },
      'reproducir':   { action: 'play',     message: 'Reproducir',         icon: '▶️' },
      'play':         { action: 'play',     message: 'Reproducir',         icon: '▶️' },
      'continuar':    { action: 'play',     message: 'Reproducir',         icon: '▶️' },
      'silencio':     { action: 'mute',     message: 'Silenciar',          icon: '🔇' },
      'mute':         { action: 'mute',     message: 'Silenciar',          icon: '🔇' },
      'callar':       { action: 'mute',     message: 'Silenciar',          icon: '🔇' },
      'silenciar':    { action: 'mute',     message: 'Silenciar',          icon: '🔇' },
      'anterior':     { action: 'previous', message: 'Canción anterior',   icon: '⏮️' },
      'atrás':        { action: 'previous', message: 'Canción anterior',   icon: '⏮️' },
      'previous':     { action: 'previous', message: 'Canción anterior',   icon: '⏮️' },
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
    this._createRecognition();

    console.log('[Voz] Web Speech API inicializada');
  }

  /**
   * Crear instancia de reconocimiento de voz
   */
  _createRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = true;        // Escucha continua
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => this._onResult(event);
    this.recognition.onerror = (event) => this._onError(event);
    this.recognition.onend = () => this._onEnd();
  }

  /**
   * Iniciar escucha continua (modo wake word "karaoke + comando")
   */
  startContinuousListening() {
    if (!this.isSupported) return;

    this.continuousMode = true;
    this.manualMode = false;
    this._isStopping = false;
    this._startRecognition();
    console.log('[Voz] Escucha continua activada (palabra clave: "karaoke")');
  }

  /**
   * Detener escucha continua
   */
  stopContinuousListening() {
    this.continuousMode = false;
    this._isStopping = true;
    this._stopRecognition();
    console.log('[Voz] Escucha continua desactivada');
  }

  /**
   * Empezar a escuchar un comando manual (por botón)
   */
  startListening() {
    if (!this.isSupported || this.isListening) return;

    this.manualMode = true;
    // Temporalmente pausar la escucha continua
    const wasContinuous = this.continuousMode;
    if (wasContinuous) {
      this.continuousMode = false;
      this._stopRecognition();
    }

    // Crear reconocimiento nuevo en modo single-shot
    setTimeout(() => {
      this._createSingleShotRecognition();
      this._startRecognition();

      // Restaurar escucha continua cuando termine
      if (wasContinuous) {
        this._restoreAfterManual = true;
      }
    }, 300);
  }

  /**
   * Crear reconocimiento en modo single-shot (para botón)
   */
  _createSingleShotRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = false;        // Single shot
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => this._onResult(event);
    this.recognition.onerror = (event) => this._onError(event);
    this.recognition.onend = () => this._onEnd();
  }

  /**
   * Parar de escuchar
   */
  stopListening() {
    if (!this.isSupported || !this.isListening) return;
    this.manualMode = false;
    this._isStopping = true;
    this._stopRecognition();
  }

  _startRecognition() {
    try {
      if (this.isListening) {
        this.recognition.stop();
        setTimeout(() => {
          try { this.recognition.start(); } catch(e) {}
        }, 200);
      } else {
        this.recognition.start();
      }
      this.isListening = true;
      console.log('[Voz] Escuchando...');
    } catch (err) {
      console.error('[Voz] Error al iniciar:', err);
      // Reintentar
      setTimeout(() => {
        try { this.recognition.start(); this.isListening = true; } catch(e) {}
      }, 500);
    }
  }

  _stopRecognition() {
    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (err) {
      // Ignorar
    }
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout);
      this._restartTimeout = null;
    }
  }

  /**
   * Cuando termina el reconocimiento, reiniciar si estamos en modo continuo
   */
  _onEnd() {
    this.isListening = false;

    // Si estábamos en modo manual y hay que restaurar continuo
    if (this._restoreAfterManual) {
      this._restoreAfterManual = false;
      this.manualMode = false;
      this.continuousMode = true;
      this._createRecognition();
      this._restartTimeout = setTimeout(() => {
        if (this.continuousMode) {
          this._startRecognition();
        }
      }, 500);
      return;
    }

    // Si estamos en modo continuo, reiniciar la escucha automáticamente
    if (this.continuousMode && !this._isStopping) {
      this._restartTimeout = setTimeout(() => {
        if (this.continuousMode) {
          console.log('[Voz] Reiniciando escucha continua...');
          this._createRecognition();
          this._startRecognition();
        }
      }, 300);
    }
  }

  /**
   * Procesar resultado del reconocimiento
   */
  _onResult(event) {
    // Procesar solo los resultados nuevos
    for (let r = event.resultIndex; r < event.results.length; r++) {
      const results = event.results[r];
      if (!results.isFinal) continue;

      let matchedCommand = null;

      for (let i = 0; i < results.length; i++) {
        const transcript = results[i].transcript.toLowerCase().trim();
        console.log(`[Voz] Reconocido (alt ${i}): "${transcript}"`);

        if (this.manualMode) {
          // Modo manual: buscar comando directamente (sin necesidad de wake word)
          matchedCommand = this._findCommand(transcript);
        } else if (this.continuousMode) {
          // Modo continuo: buscar "karaoke" + comando
          matchedCommand = this._findWakeWordCommand(transcript);
        }

        if (matchedCommand) break;
      }

      if (matchedCommand) {
        console.log(`[Voz] Comando detectado: ${matchedCommand.action}`);
        if (this.onCommandCallback) {
          this.onCommandCallback(matchedCommand);
        }
      } else if (this.manualMode) {
        // Solo notificar "no entendido" en modo manual
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
      // En modo continuo, si no se dice "karaoke", simplemente lo ignora
    }
  }

  /**
   * Buscar un comando directo en el transcript
   */
  _findCommand(transcript) {
    for (const [keyword, cmd] of Object.entries(this.commands)) {
      if (transcript.includes(keyword)) {
        return { ...cmd, transcript: transcript, keyword: keyword };
      }
    }
    return null;
  }

  /**
   * Buscar "karaoke" + comando en el transcript
   */
  _findWakeWordCommand(transcript) {
    // Verificar que contiene la palabra clave "karaoke"
    if (!transcript.includes('karaoke')) return null;

    // Buscar el comando después de "karaoke"
    const afterKaraoke = transcript.substring(transcript.indexOf('karaoke') + 7).trim();

    // Buscar en la parte posterior a "karaoke"
    for (const [keyword, cmd] of Object.entries(this.commands)) {
      if (afterKaraoke.includes(keyword)) {
        return { ...cmd, transcript: transcript, keyword: keyword, wakeWord: true };
      }
    }

    // También buscar en todo el transcript (por si el orden no es perfecto)
    for (const [keyword, cmd] of Object.entries(this.commands)) {
      if (transcript.includes(keyword)) {
        return { ...cmd, transcript: transcript, keyword: keyword, wakeWord: true };
      }
    }

    return null;
  }

  _onError(event) {
    console.warn('[Voz] Error:', event.error);

    if (event.error === 'not-allowed') {
      this.isListening = false;
      this.continuousMode = false;
      if (this.onCommandCallback) {
        this.onCommandCallback({
          action: 'error',
          message: 'Permiso de micrófono denegado',
          icon: '🚫'
        });
      }
      return;
    }

    // Para errores recuperables (no-speech, network, aborted), reiniciar si estamos en modo continuo
    if (event.error === 'no-speech' || event.error === 'network' || event.error === 'aborted') {
      this.isListening = false;
      // _onEnd se encargará de reiniciar
    }
  }

  /**
   * Registrar callback para comandos detectados
   */
  onCommand(callback) {
    this.onCommandCallback = callback;
  }

  /**
   * Verificar si la escucha continua está activa
   */
  get isContinuousActive() {
    return this.continuousMode;
  }
}

// Singleton
window.voiceCommands = new VoiceCommands();

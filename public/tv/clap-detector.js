/**
 * clap-detector.js – Detección de doble aplauso con Web Audio API
 * 
 * Detecta dos aplausos rápidos consecutivos para reiniciar la canción actual.
 * Usa el micrófono del PC (TV) a través de Web Audio API para analizar
 * picos de amplitud (impulsos cortos y fuertes).
 */
class ClapDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.isActive = false;

    // Parámetros de detección
    this.clapThreshold = 0.35;       // Umbral de amplitud para considerar un "clap" (0 a 1)
    this.doubleClapWindow = 700;     // Ventana máxima entre dos claps (ms)
    this.doubleClapMinGap = 100;     // Gap mínimo entre claps para evitar rebote (ms)
    this.cooldownMs = 3000;          // Cooldown entre detecciones de doble aplauso
    this.silenceThreshold = 0.05;    // Nivel por debajo del cual se considera silencio

    // Estado interno
    this.lastClapTime = 0;
    this.lastDoubleClapTime = 0;
    this.wasLoud = false;            // Para detección de flanco (rising edge)

    // Callbacks
    this.onDoubleClapCallback = null;
    this.onClapCallback = null;      // Para debug/feedback visual de clap individual

    // Buffer de análisis
    this._dataArray = null;
    this._animFrameId = null;
  }

  /**
   * Iniciar la detección de aplausos usando el micrófono
   */
  async start() {
    try {
      console.log('[Clap] Solicitando acceso al micrófono...');

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,   // No queremos suprimir los aplausos
          autoGainControl: false
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this._dataArray = new Float32Array(this.analyser.fftSize);

      this.isActive = true;
      this._detect();

      console.log('[Clap] Detección de aplausos activa ✓');
      return true;

    } catch (err) {
      console.error('[Clap] Error al acceder al micrófono:', err.message);
      this.isActive = false;
      return false;
    }
  }

  /**
   * Bucle de detección (via requestAnimationFrame)
   */
  _detect() {
    if (!this.isActive) return;

    this.analyser.getFloatTimeDomainData(this._dataArray);

    // Calcular RMS (Root Mean Square) de la amplitud
    let sumSquares = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      sumSquares += this._dataArray[i] * this._dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / this._dataArray.length);

    // Calcular también el pico máximo para detectar impulsos
    let peak = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      const abs = Math.abs(this._dataArray[i]);
      if (abs > peak) peak = abs;
    }

    const now = Date.now();
    const isLoud = peak > this.clapThreshold && rms > this.silenceThreshold;

    // Detección de flanco ascendente (rising edge): de silencio a fuerte
    if (isLoud && !this.wasLoud) {
      this._onClapDetected(now);
    }

    this.wasLoud = isLoud;

    this._animFrameId = requestAnimationFrame(() => this._detect());
  }

  /**
   * Procesar un clap individual detectado
   */
  _onClapDetected(now) {
    const timeSinceLastClap = now - this.lastClapTime;

    // Feedback visual de clap individual (para debug)
    if (this.onClapCallback) {
      this.onClapCallback();
    }

    // Verificar si es un doble aplauso
    if (timeSinceLastClap >= this.doubleClapMinGap &&
        timeSinceLastClap <= this.doubleClapWindow) {

      // ¡Doble aplauso detectado!
      if ((now - this.lastDoubleClapTime) > this.cooldownMs) {
        this.lastDoubleClapTime = now;
        console.log('[Clap] ¡DOBLE APLAUSO detectado!');

        if (this.onDoubleClapCallback) {
          this.onDoubleClapCallback();
        }
      }

      // Resetear para el siguiente par
      this.lastClapTime = 0;
    } else {
      // Primer clap del par potencial
      this.lastClapTime = now;
    }
  }

  /**
   * Registrar callback para doble aplauso
   */
  onDoubleClap(callback) {
    this.onDoubleClapCallback = callback;
  }

  /**
   * Registrar callback para clap individual (feedback visual)
   */
  onClap(callback) {
    this.onClapCallback = callback;
  }

  /**
   * Ajustar sensibilidad del detector
   */
  setSensitivity(level) {
    // level: 'low', 'medium', 'high'
    switch (level) {
      case 'low':
        this.clapThreshold = 0.5;
        break;
      case 'medium':
        this.clapThreshold = 0.35;
        break;
      case 'high':
        this.clapThreshold = 0.2;
        break;
    }
    console.log(`[Clap] Sensibilidad: ${level} (umbral: ${this.clapThreshold})`);
  }

  /**
   * Detener la detección
   */
  stop() {
    this.isActive = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    console.log('[Clap] Detección detenida');
  }
}

// Singleton
window.clapDetector = new ClapDetector();

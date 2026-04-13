/**
 * clap-detector.js – Detección de doble aplauso con Web Audio API
 * 
 * Detecta dos aplausos rápidos consecutivos para reiniciar la canción actual.
 * Usa el micrófono del PC (TV) a través de Web Audio API para analizar
 * picos de amplitud (impulsos cortos y fuertes).
 * 
 * UMBRAL ALTO para evitar falsos positivos con ruido ambiente.
 */
class ClapDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.isActive = false;

    // Parámetros de detección – UMBRALES ALTOS para evitar falsos positivos
    this.clapThreshold = 0.65;       // Umbral de pico de amplitud (0 a 1) – MUY ALTO
    this.rmsThreshold = 0.12;        // Umbral RMS mínimo para considerar un sonido fuerte
    this.doubleClapWindow = 600;     // Ventana máxima entre dos claps (ms)
    this.doubleClapMinGap = 150;     // Gap mínimo entre claps para evitar rebote (ms)
    this.cooldownMs = 3000;          // Cooldown entre detecciones de doble aplauso
    this.silenceThreshold = 0.08;    // Nivel por debajo del cual se considera silencio

    // Detección de impulso corto: un aplauso es un sonido MUY corto y fuerte
    this.impulseDurationMax = 150;   // Un aplauso no dura más de 150ms
    this.impulseStartTime = 0;
    this.isInImpulse = false;

    // Estado interno
    this.lastClapTime = 0;
    this.lastDoubleClapTime = 0;
    this.wasLoud = false;

    // Historial de amplitud para detectar la forma del sonido
    this.recentPeaks = [];           // Últimos picos para verificar el patrón de aplauso
    this.maxRecentPeaks = 5;

    // Callbacks
    this.onDoubleClapCallback = null;
    this.onClapCallback = null;

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
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.2;  // Menos suavizado para captar impulsos rápidos

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this._dataArray = new Float32Array(this.analyser.fftSize);

      this.isActive = true;
      this._detect();

      console.log('[Clap] Detección de aplausos activa ✓ (umbral alto: ' + this.clapThreshold + ')');
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

    // Calcular RMS
    let sumSquares = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      sumSquares += this._dataArray[i] * this._dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / this._dataArray.length);

    // Calcular el pico máximo
    let peak = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      const abs = Math.abs(this._dataArray[i]);
      if (abs > peak) peak = abs;
    }

    const now = Date.now();
    const isLoud = peak > this.clapThreshold && rms > this.rmsThreshold;

    // --- Detección de impulso corto (patrón de aplauso) ---
    if (isLoud && !this.wasLoud) {
      // Inicio de un sonido fuerte
      this.isInImpulse = true;
      this.impulseStartTime = now;
    }

    if (this.isInImpulse && !isLoud && this.wasLoud) {
      // Fin del sonido fuerte – verificar si fue un impulso corto (aplauso)
      const impulseDuration = now - this.impulseStartTime;
      this.isInImpulse = false;

      if (impulseDuration <= this.impulseDurationMax && impulseDuration >= 10) {
        // ¡Impulso corto y fuerte! Es un posible aplauso
        this._onClapDetected(now, peak);
      }
      // Si el impulso dura demasiado (voz, música, etc.) lo ignoramos
    }

    // Timeout: si el impulso lleva demasiado tiempo, cancelar
    if (this.isInImpulse && (now - this.impulseStartTime) > this.impulseDurationMax * 2) {
      this.isInImpulse = false;
    }

    this.wasLoud = isLoud;

    this._animFrameId = requestAnimationFrame(() => this._detect());
  }

  /**
   * Procesar un clap individual detectado
   */
  _onClapDetected(now, peak) {
    const timeSinceLastClap = now - this.lastClapTime;

    // Guardar en historial de picos
    this.recentPeaks.push({ time: now, peak: peak });
    if (this.recentPeaks.length > this.maxRecentPeaks) {
      this.recentPeaks.shift();
    }

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
        console.log('[Clap] ¡DOBLE APLAUSO detectado! (intervalo: ' + timeSinceLastClap + 'ms)');

        if (this.onDoubleClapCallback) {
          this.onDoubleClapCallback();
        }
      }

      this.lastClapTime = 0;
    } else {
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
    switch (level) {
      case 'low':
        this.clapThreshold = 0.8;
        this.rmsThreshold = 0.15;
        break;
      case 'medium':
        this.clapThreshold = 0.65;
        this.rmsThreshold = 0.12;
        break;
      case 'high':
        this.clapThreshold = 0.45;
        this.rmsThreshold = 0.08;
        break;
    }
    console.log(`[Clap] Sensibilidad: ${level} (umbral pico: ${this.clapThreshold}, rms: ${this.rmsThreshold})`);
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

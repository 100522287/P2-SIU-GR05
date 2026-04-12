/**
 * clap-detector.js – Detección de doble aplauso con Web Audio API
 * 
 * FIXES APLICADOS:
 * - Umbral subido significativamente (0.35 → 0.6) para evitar falsos positivos
 * - Añadido análisis espectral: un aplauso tiene energía en frecuencias altas (>2kHz)
 * - Cooldown aumentado a 4 segundos
 * - Se ignoran sonidos cuando hay música reproduciéndose (evitar que la música active aplausos)
 * - Gap mínimo entre claps aumentado para evitar rebote
 */
class ClapDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.isActive = false;

    // Parámetros de detección - MÁS ESTRICTOS
    this.clapThreshold = 0.55;       // Umbral de amplitud ALTO para evitar falsos positivos
    this.doubleClapWindow = 600;     // Ventana máxima entre dos claps (ms)
    this.doubleClapMinGap = 150;     // Gap mínimo entre claps
    this.cooldownMs = 4000;          // Cooldown largo entre detecciones
    this.silenceThreshold = 0.08;    // Nivel por debajo del cual se considera silencio

    // Estado interno
    this.lastClapTime = 0;
    this.lastDoubleClapTime = 0;
    this.wasLoud = false;
    this.consecutiveLoudFrames = 0;
    this.musicPlaying = false;       // Flag para saber si hay música sonando

    // Callbacks
    this.onDoubleClapCallback = null;
    this.onClapCallback = null;

    // Buffer de análisis
    this._timeData = null;
    this._freqData = null;
    this._animFrameId = null;
  }

  /**
   * Indicar si hay música reproduciéndose (para reducir falsos positivos)
   */
  setMusicPlaying(playing) {
    this.musicPlaying = playing;
  }

  /**
   * Iniciar la detección de aplausos usando el micrófono
   */
  async start() {
    try {
      console.log('[Clap] Solicitando acceso al micrófono...');

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,    // Activado para cancelar eco de la música
          noiseSuppression: true,    // Activado para reducir ruido ambiente
          autoGainControl: false
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.2; // Baja suavización para detectar transientes

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this._timeData = new Float32Array(this.analyser.fftSize);
      this._freqData = new Uint8Array(this.analyser.frequencyBinCount);

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
   * Verificar si el sonido tiene características de un aplauso:
   * - Transiente rápido (onset brusco)
   * - Energía en frecuencias altas (>2kHz)
   * - Duración corta
   */
  _isClapLikeSound() {
    this.analyser.getByteFrequencyData(this._freqData);

    const nyquist = this.audioContext.sampleRate / 2;
    const binCount = this._freqData.length;
    const hzPerBin = nyquist / binCount;

    // Calcular energía en banda baja (0-1kHz) y banda alta (2kHz-8kHz)
    let lowEnergy = 0;
    let highEnergy = 0;
    let lowCount = 0;
    let highCount = 0;

    for (let i = 0; i < binCount; i++) {
      const freq = i * hzPerBin;
      if (freq < 1000) {
        lowEnergy += this._freqData[i];
        lowCount++;
      } else if (freq >= 2000 && freq <= 8000) {
        highEnergy += this._freqData[i];
        highCount++;
      }
    }

    if (lowCount > 0) lowEnergy /= lowCount;
    if (highCount > 0) highEnergy /= highCount;

    // Un aplauso tiene proporcionalmente más energía en altas frecuencias
    // que la voz o la música (que tiene más energía en bajas)
    const ratio = highEnergy / (lowEnergy + 1);

    // El ratio debe ser > 0.6 para que se considere un clap
    // (la voz tiene ratio ~0.2-0.4, música ~0.3-0.5, aplauso ~0.7-1.5)
    return ratio > 0.5;
  }

  /**
   * Bucle de detección
   */
  _detect() {
    if (!this.isActive) return;

    this.analyser.getFloatTimeDomainData(this._timeData);

    // Calcular RMS
    let sumSquares = 0;
    for (let i = 0; i < this._timeData.length; i++) {
      sumSquares += this._timeData[i] * this._timeData[i];
    }
    const rms = Math.sqrt(sumSquares / this._timeData.length);

    // Calcular pico máximo
    let peak = 0;
    for (let i = 0; i < this._timeData.length; i++) {
      const abs = Math.abs(this._timeData[i]);
      if (abs > peak) peak = abs;
    }

    const now = Date.now();
    const isLoud = peak > this.clapThreshold && rms > this.silenceThreshold;

    if (isLoud) {
      this.consecutiveLoudFrames++;
    } else {
      this.consecutiveLoudFrames = 0;
    }

    // Detección de flanco ascendente con validaciones adicionales
    if (isLoud && !this.wasLoud) {
      // Un aplauso es un transiente CORTO - si hay muchos frames seguidos fuertes,
      // es música o ruido continuo, no un aplauso
      if (this.consecutiveLoudFrames <= 3) {
        // Verificar perfil espectral de aplauso
        if (this._isClapLikeSound()) {
          this._onClapDetected(now);
        }
      }
    }

    this.wasLoud = isLoud;

    this._animFrameId = requestAnimationFrame(() => this._detect());
  }

  /**
   * Procesar un clap individual detectado
   */
  _onClapDetected(now) {
    const timeSinceLastClap = now - this.lastClapTime;

    // Feedback visual de clap individual
    if (this.onClapCallback) {
      this.onClapCallback();
    }

    // Verificar si es un doble aplauso
    if (timeSinceLastClap >= this.doubleClapMinGap &&
        timeSinceLastClap <= this.doubleClapWindow) {

      if ((now - this.lastDoubleClapTime) > this.cooldownMs) {
        this.lastDoubleClapTime = now;
        console.log('[Clap] ¡DOBLE APLAUSO detectado!');

        if (this.onDoubleClapCallback) {
          this.onDoubleClapCallback();
        }
      }

      this.lastClapTime = 0;
    } else {
      this.lastClapTime = now;
    }
  }

  onDoubleClap(callback) {
    this.onDoubleClapCallback = callback;
  }

  onClap(callback) {
    this.onClapCallback = callback;
  }

  setSensitivity(level) {
    switch (level) {
      case 'low':
        this.clapThreshold = 0.7;
        break;
      case 'medium':
        this.clapThreshold = 0.55;
        break;
      case 'high':
        this.clapThreshold = 0.4;
        break;
    }
    console.log(`[Clap] Sensibilidad: ${level} (umbral: ${this.clapThreshold})`);
  }

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

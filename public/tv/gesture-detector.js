/**
 * gesture-detector.js – Detección de gestos con MediaPipe Hands
 * Detecta: Gesto de STOP (palma abierta) y gesto de OK (pulgar+índice en círculo)
 */
class GestureDetector {
  constructor() {
    this.hands = null;
    this.camera = null;
    this.videoEl = document.getElementById('webcam');
    this.canvasEl = document.getElementById('gesture-canvas');
    this.gestureIndicator = document.getElementById('gesture-indicator');
    this.gestureIcon = document.getElementById('gesture-icon');
    this.gestureLabel = document.getElementById('gesture-label');
    this.gestureStatus = document.getElementById('gesture-status');

    this.lastGesture = null;
    this.gestureStartTime = 0;
    this.gestureCooldown = 2000; // ms entre detecciones
    this.lastGestureTime = 0;
    this.holdThreshold = 600;   // ms que hay que mantener el gesto

    this.onGestureCallback = null;
    this.isActive = false;
  }

  /**
   * Iniciar detección de gestos con webcam
   */
  async start() {
    try {
      console.log('[Gestos] Inicializando MediaPipe Hands...');

      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => this._onResults(results));

      // Iniciar la cámara
      this.camera = new Camera(this.videoEl, {
        onFrame: async () => {
          if (this.hands) {
            await this.hands.send({ image: this.videoEl });
          }
        },
        width: 320,
        height: 240
      });

      await this.camera.start();
      this.isActive = true;
      this.gestureStatus.classList.remove('inactive');
      console.log('[Gestos] Cámara y detección activas');

    } catch (err) {
      console.error('[Gestos] Error al iniciar:', err);
      this.gestureStatus.classList.add('inactive');
      this.gestureStatus.querySelector('span').textContent = 'Cámara no disponible';
    }
  }

  /**
   * Procesar resultados de MediaPipe
   */
  _onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.lastGesture = null;
      this.gestureStartTime = 0;
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const gesture = this._detectGesture(landmarks);
    const now = Date.now();

    if (gesture) {
      if (gesture === this.lastGesture) {
        // Mismo gesto mantenido
        const holdDuration = now - this.gestureStartTime;
        if (holdDuration >= this.holdThreshold && (now - this.lastGestureTime) > this.gestureCooldown) {
          this._triggerGesture(gesture);
          this.lastGestureTime = now;
          this.lastGesture = null;
          this.gestureStartTime = 0;
        }
      } else {
        // Nuevo gesto detectado
        this.lastGesture = gesture;
        this.gestureStartTime = now;
      }
    } else {
      this.lastGesture = null;
      this.gestureStartTime = 0;
    }
  }

  /**
   * Detectar qué gesto se está haciendo
   */
  _detectGesture(landmarks) {
    if (this._isStopGesture(landmarks)) {
      return 'stop';
    }
    if (this._isOkGesture(landmarks)) {
      return 'ok';
    }
    return null;
  }

  /**
   * Detectar gesto de STOP: palma abierta con todos los dedos extendidos
   */
  _isStopGesture(lm) {
    // Verificar que todos los dedos están extendidos
    const fingersExtended = this._countExtendedFingers(lm);
    // Palma abierta = 5 dedos extendidos
    if (fingersExtended < 5) return false;

    // Verificar que la mano está orientada hacia la cámara (palma frontal)
    // La muñeca (0) debe estar más cerca en Z que las puntas de los dedos
    const wrist = lm[0];
    const middleTip = lm[12];
    // Si la diferencia en Y entre la muñeca y la punta del dedo medio es suficiente
    const handHeight = Math.abs(wrist.y - middleTip.y);
    return handHeight > 0.12;
  }

  /**
   * Detectar gesto de OK: pulgar e índice formando un círculo
   */
  _isOkGesture(lm) {
    const thumbTip = lm[4];
    const indexTip = lm[8];

    // Distancia entre pulgar e índice
    const distance = this._distance(thumbTip, indexTip);

    // Los otros dedos deben estar extendidos (medio, anular, meñique)
    const middleExtended = lm[12].y < lm[10].y;
    const ringExtended = lm[16].y < lm[14].y;
    const pinkyExtended = lm[20].y < lm[18].y;

    // OK = pulgar e índice juntos + otros dedos extendidos
    return distance < 0.06 && middleExtended && ringExtended && pinkyExtended;
  }

  /**
   * Contar dedos extendidos
   */
  _countExtendedFingers(lm) {
    let count = 0;

    // Pulgar: comparar posición x de la punta (4) con la articulación (3)
    // (simplificado, funciona para mano derecha/izquierda)
    const thumbExtended = Math.abs(lm[4].x - lm[3].x) > 0.02;
    if (thumbExtended) count++;

    // Índice: punta (8) más arriba que articulación PIP (6)
    if (lm[8].y < lm[6].y) count++;

    // Medio: punta (12) más arriba que articulación PIP (10)
    if (lm[12].y < lm[10].y) count++;

    // Anular: punta (16) más arriba que articulación PIP (14)
    if (lm[16].y < lm[14].y) count++;

    // Meñique: punta (20) más arriba que articulación PIP (18)
    if (lm[20].y < lm[18].y) count++;

    return count;
  }

  /**
   * Distancia euclidiana entre dos landmarks
   */
  _distance(a, b) {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  /**
   * Disparar el gesto detectado
   */
  _triggerGesture(gesture) {
    console.log(`[Gestos] ¡Gesto detectado: ${gesture}!`);

    let action, message, icon;

    switch (gesture) {
      case 'stop':
        action = 'toggle-play';
        message = '✋ Gesto de STOP – Pausar/Reanudar';
        icon = '✋';
        break;
      case 'ok':
        action = 'confirm';
        message = '👌 Gesto OK – Confirmado';
        icon = '👌';
        break;
      default:
        return;
    }

    // Mostrar indicador visual
    this._showIndicator(icon, message);

    // Notificar via callback
    if (this.onGestureCallback) {
      this.onGestureCallback({
        gesture: gesture,
        action: action,
        message: message,
        icon: icon,
        source: 'tv-webcam'
      });
    }
  }

  /**
   * Mostrar indicador visual de gesto
   */
  _showIndicator(icon, label) {
    this.gestureIcon.textContent = icon;
    this.gestureLabel.textContent = label;
    this.gestureIndicator.classList.remove('hidden');
    this.gestureIndicator.classList.add('visible');

    setTimeout(() => {
      this.gestureIndicator.classList.remove('visible');
      setTimeout(() => {
        this.gestureIndicator.classList.add('hidden');
      }, 300);
    }, 1500);
  }

  /**
   * Registrar callback para cuando se detecta un gesto
   */
  onGesture(callback) {
    this.onGestureCallback = callback;
  }

  /**
   * Detener detección
   */
  stop() {
    if (this.camera) {
      this.camera.stop();
    }
    this.isActive = false;
    this.gestureStatus.classList.add('inactive');
  }
}

// Singleton
window.gestureDetector = new GestureDetector();

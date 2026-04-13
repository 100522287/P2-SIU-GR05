/**
 * gesture-detector.js – Detección de gestos con MediaPipe Hands
 * Detecta:
 * - STOP (palma abierta) → Pausar reproducción
 * - OK (pulgar+índice en círculo) → Reanudar reproducción
 * - X (muñecas cruzadas) → Eliminar canciones posteriores de la cola
 * - THUMBS UP (👍 pulgar arriba) → Reiniciar canción desde el principio
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
    this.gestureCooldown = 2500; // ms entre detecciones
    this.lastGestureTime = 0;
    this.holdThreshold = 800;    // ms que hay que mantener el gesto

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

      // maxNumHands: 2 para poder detectar el gesto de X (dos manos)
      this.hands.setOptions({
        maxNumHands: 2,
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

    const gesture = this._detectGestureFromResults(results);
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
   * Detectar qué gesto se está haciendo (soporta 1 o 2 manos)
   */
  _detectGestureFromResults(results) {
    const hands = results.multiHandLandmarks;

    // --- Gesto de X: dos manos con muñecas cruzadas ---
    if (hands.length === 2) {
      if (this._isXGesture(hands[0], hands[1])) {
        return 'x-cross';
      }
    }

    // --- Gestos de una mano (usar la primera detectada) ---
    const landmarks = hands[0];
    if (this._isStopGesture(landmarks)) {
      return 'stop';
    }
    if (this._isOkGesture(landmarks)) {
      return 'ok';
    }
    if (this._isThumbsUpGesture(landmarks)) {
      return 'thumbs-up';
    }
    return null;
  }

  /**
   * Detectar gesto de X: muñecas cruzadas (X pequeña frente a la cámara)
   * Se detecta cuando las dos muñecas están muy próximas entre sí en ambos ejes
   */
  _isXGesture(lm1, lm2) {
    const wrist1 = lm1[0];
    const wrist2 = lm2[0];

    // Calculamos la distancia entre las dos muñecas en ambos ejes (X e Y)
    const distanceX = Math.abs(wrist1.x - wrist2.x);
    const distanceY = Math.abs(wrist1.y - wrist2.y);

    // Si las muñecas están muy juntas en pantalla (formando una X pequeña)
    // El valor 0.15 indica un 15% del tamaño de la pantalla.
    if (distanceX < 0.15 && distanceY < 0.15) {
      return true;
    }

    return false;
  }

  /**
   * Detectar gesto de STOP: palma abierta con todos los dedos extendidos
   */
  _isStopGesture(lm) {
    const fingersExtended = this._countExtendedFingers(lm);
    if (fingersExtended < 5) return false;

    const wrist = lm[0];
    const middleTip = lm[12];
    const handHeight = Math.abs(wrist.y - middleTip.y);
    return handHeight > 0.12;
  }

  /**
   * Detectar gesto de OK: pulgar e índice formando un círculo
   */
  _isOkGesture(lm) {
    const thumbTip = lm[4];
    const indexTip = lm[8];

    const distance = this._distance(thumbTip, indexTip);

    const middleExtended = lm[12].y < lm[10].y;
    const ringExtended = lm[16].y < lm[14].y;
    const pinkyExtended = lm[20].y < lm[18].y;

    return distance < 0.06 && middleExtended && ringExtended && pinkyExtended;
  }

  /**
   * Detectar gesto de THUMBS UP (👍): pulgar extendido hacia arriba,
   * con todos los demás dedos cerrados (puño cerrado con pulgar arriba).
   *
   * Condiciones:
   * 1. El pulgar apunta hacia arriba: thumb tip (4) está claramente por encima
   *    del thumb IP joint (3) y de la muñeca (0).
   * 2. Los 4 dedos restantes están cerrados: las puntas de los dedos (8,12,16,20)
   *    están por debajo de sus respectivos nudillos PIP (6,10,14,18).
   */
  _isThumbsUpGesture(lm) {
    const thumbTip = lm[4];
    const thumbIP  = lm[3];
    const thumbMCP = lm[2];
    const wrist    = lm[0];

    // 1. El pulgar debe apuntar claramente hacia arriba
    //    (thumb tip debe estar por encima del IP joint y la muñeca)
    const thumbPointsUp = thumbTip.y < thumbIP.y && thumbTip.y < thumbMCP.y && thumbTip.y < wrist.y;
    if (!thumbPointsUp) return false;

    // El pulgar debe tener una extensión vertical significativa respecto al IP joint
    const thumbExtension = thumbIP.y - thumbTip.y;
    if (thumbExtension < 0.03) return false;

    // 2. Los cuatro dedos restantes deben estar CERRADOS (punta por debajo del nudillo PIP)
    const indexClosed = lm[8].y > lm[6].y;
    const middleClosed = lm[12].y > lm[10].y;
    const ringClosed = lm[16].y > lm[14].y;
    const pinkyClosed = lm[20].y > lm[18].y;

    return indexClosed && middleClosed && ringClosed && pinkyClosed;
  }

  /**
   * Contar dedos extendidos
   */
  _countExtendedFingers(lm) {
    let count = 0;

    const thumbExtended = Math.abs(lm[4].x - lm[3].x) > 0.02;
    if (thumbExtended) count++;

    if (lm[8].y < lm[6].y) count++;
    if (lm[12].y < lm[10].y) count++;
    if (lm[16].y < lm[14].y) count++;
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
        action = 'pause';
        message = '✋ Gesto de STOP – Pausar';
        icon = '✋';
        break;
      case 'ok':
        action = 'play';
        message = '👌 Gesto OK – Reanudar';
        icon = '👌';
        break;
      case 'x-cross':
        action = 'clear-queue-after';
        message = '❌ Gesto X – Limpiar cola posterior';
        icon = '❌';
        break;
      case 'thumbs-up':
        action = 'restart';
        message = '👍 Pulgar Arriba – Reiniciar canción';
        icon = '👍';
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

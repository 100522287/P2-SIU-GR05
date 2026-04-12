/**
 * gesture-detector.js – Detección de gestos con MediaPipe Hands
 * 
 * FIXES APLICADOS:
 * - Hold threshold aumentado de 600ms a 800ms para evitar falsos positivos
 * - Cooldown aumentado a 2500ms
 * - Añadidos gestos de navegación espacial: mano arriba/abajo para navegar catálogo
 * - Gesto de puño cerrado para abrir/cerrar menú de browse
 * - Detección de swipe (movimiento horizontal) para cambiar de canción
 * - Mejor discriminación entre gestos (se requiere mantener el gesto estable)
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
    this.gestureCooldown = 2500;  // CAMBIO: más cooldown
    this.lastGestureTime = 0;
    this.holdThreshold = 800;    // CAMBIO: más tiempo para confirmar gesto

    // Para detección de swipe/navegación
    this.handPositions = [];      // Historial de posiciones de la mano
    this.maxPositionHistory = 15;
    this.lastNavTime = 0;
    this.navCooldown = 800;      // Cooldown entre navegaciones

    this.onGestureCallback = null;
    this.isActive = false;

    // Estabilidad: contar frames consecutivos con el mismo gesto
    this.stableGestureCount = 0;
    this.requiredStableFrames = 5;  // Necesitar 5 frames seguidos del mismo gesto
  }

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
        minDetectionConfidence: 0.75, // CAMBIO: más confianza requerida
        minTrackingConfidence: 0.6
      });

      this.hands.onResults((results) => this._onResults(results));

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
      if (this.gestureStatus) {
        this.gestureStatus.classList.remove('inactive');
      }
      console.log('[Gestos] Cámara y detección activas');

    } catch (err) {
      console.error('[Gestos] Error al iniciar:', err);
      if (this.gestureStatus) {
        this.gestureStatus.classList.add('inactive');
        const span = this.gestureStatus.querySelector('span');
        if (span) span.textContent = 'Cámara no disponible';
      }
    }
  }

  _onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.lastGesture = null;
      this.gestureStartTime = 0;
      this.stableGestureCount = 0;
      this.handPositions = [];
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const now = Date.now();

    // Guardar posición de la mano para detección de movimiento
    const palmCenter = {
      x: (landmarks[0].x + landmarks[9].x) / 2,
      y: (landmarks[0].y + landmarks[9].y) / 2,
      t: now
    };
    this.handPositions.push(palmCenter);
    if (this.handPositions.length > this.maxPositionHistory) {
      this.handPositions.shift();
    }

    // Detectar gesto estático
    const gesture = this._detectGesture(landmarks);

    // Detectar movimiento de navegación (swipe vertical)
    this._detectNavigation(now);

    if (gesture) {
      if (gesture === this.lastGesture) {
        this.stableGestureCount++;
        // Solo activar si el gesto es estable por varios frames Y se mantiene el tiempo requerido
        const holdDuration = now - this.gestureStartTime;
        if (this.stableGestureCount >= this.requiredStableFrames &&
            holdDuration >= this.holdThreshold &&
            (now - this.lastGestureTime) > this.gestureCooldown) {
          this._triggerGesture(gesture);
          this.lastGestureTime = now;
          this.lastGesture = null;
          this.gestureStartTime = 0;
          this.stableGestureCount = 0;
        }
      } else {
        this.lastGesture = gesture;
        this.gestureStartTime = now;
        this.stableGestureCount = 1;
      }
    } else {
      // Sin gesto detectado - reset gradual
      this.stableGestureCount = Math.max(0, this.stableGestureCount - 1);
      if (this.stableGestureCount === 0) {
        this.lastGesture = null;
        this.gestureStartTime = 0;
      }
    }
  }

  /**
   * Detectar movimiento vertical de la mano para navegación
   */
  _detectNavigation(now) {
    if (this.handPositions.length < 8) return;
    if (now - this.lastNavTime < this.navCooldown) return;

    const recent = this.handPositions.slice(-8);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDelta = last.t - first.t;

    if (timeDelta < 100 || timeDelta > 800) return;

    const deltaY = last.y - first.y;
    const deltaX = last.x - first.x;

    // Solo considerar movimiento vertical significativo
    const absY = Math.abs(deltaY);
    const absX = Math.abs(deltaX);

    // El movimiento debe ser predominantemente vertical y significativo
    if (absY > 0.15 && absY > absX * 1.5) {
      this.lastNavTime = now;
      this.handPositions = []; // Reset historial

      const direction = deltaY > 0 ? 'down' : 'up';
      console.log(`[Gestos] Navegación: ${direction}`);

      if (this.onGestureCallback) {
        this.onGestureCallback({
          gesture: `nav-${direction}`,
          action: `browse-${direction}`,
          message: `👆 Mano ${direction === 'up' ? 'arriba' : 'abajo'} → Navegar`,
          icon: direction === 'up' ? '👆' : '👇',
          source: 'tv-webcam'
        });
      }

      this._showIndicator(
        direction === 'up' ? '👆' : '👇',
        `Navegar ${direction === 'up' ? 'arriba' : 'abajo'}`
      );
    }

    // Swipe horizontal para skip/previous
    if (absX > 0.2 && absX > absY * 1.5) {
      this.lastNavTime = now;
      this.handPositions = [];

      const hDirection = deltaX > 0 ? 'right' : 'left';
      // Nota: en la webcam la imagen está espejada, así que left=right y viceversa
      const action = hDirection === 'left' ? 'skip' : 'previous';
      console.log(`[Gestos] Swipe: ${hDirection} → ${action}`);

      if (this.onGestureCallback) {
        this.onGestureCallback({
          gesture: `swipe-${hDirection}`,
          action: action === 'skip' ? 'skip' : 'previous',
          message: `👋 Swipe → ${action === 'skip' ? 'Siguiente' : 'Anterior'}`,
          icon: action === 'skip' ? '⏭️' : '⏮️',
          source: 'tv-webcam'
        });
      }

      this._showIndicator(
        action === 'skip' ? '⏭️' : '⏮️',
        action === 'skip' ? 'Siguiente canción' : 'Canción anterior'
      );
    }
  }

  _detectGesture(landmarks) {
    if (this._isStopGesture(landmarks)) {
      return 'stop';
    }
    if (this._isOkGesture(landmarks)) {
      return 'ok';
    }
    if (this._isFistGesture(landmarks)) {
      return 'fist';
    }
    return null;
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
    return handHeight > 0.15; // CAMBIO: umbral más alto
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

    // OK = pulgar e índice juntos + al menos 2 de los otros 3 dedos extendidos
    const otherExtended = (middleExtended ? 1 : 0) + (ringExtended ? 1 : 0) + (pinkyExtended ? 1 : 0);
    return distance < 0.055 && otherExtended >= 2;
  }

  /**
   * Detectar gesto de puño cerrado (para toggle browse)
   */
  _isFistGesture(lm) {
    const fingersExtended = this._countExtendedFingers(lm);
    // Puño = 0 o 1 dedo extendido (a veces el pulgar sobresale)
    return fingersExtended <= 1;
  }

  _countExtendedFingers(lm) {
    let count = 0;
    const thumbExtended = Math.abs(lm[4].x - lm[3].x) > 0.025;
    if (thumbExtended) count++;
    if (lm[8].y < lm[6].y) count++;
    if (lm[12].y < lm[10].y) count++;
    if (lm[16].y < lm[14].y) count++;
    if (lm[20].y < lm[18].y) count++;
    return count;
  }

  _distance(a, b) {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  _triggerGesture(gesture) {
    console.log(`[Gestos] ¡Gesto confirmado: ${gesture}!`);

    let action, message, icon;

    switch (gesture) {
      case 'stop':
        action = 'toggle-play';
        message = '✋ Palma abierta → Pausar/Reanudar';
        icon = '✋';
        break;
      case 'ok':
        action = 'confirm';
        message = '👌 Gesto OK → Confirmar';
        icon = '👌';
        break;
      case 'fist':
        action = 'toggle-browse';
        message = '✊ Puño → Abrir/Cerrar catálogo';
        icon = '✊';
        break;
      default:
        return;
    }

    this._showIndicator(icon, message);

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

  _showIndicator(icon, label) {
    if (!this.gestureIndicator) return;
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

  onGesture(callback) {
    this.onGestureCallback = callback;
  }

  stop() {
    if (this.camera) {
      this.camera.stop();
    }
    this.isActive = false;
    if (this.gestureStatus) {
      this.gestureStatus.classList.add('inactive');
    }
  }
}

// Singleton
window.gestureDetector = new GestureDetector();

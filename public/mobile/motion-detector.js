/**
 * motion-detector.js – Detección de movimientos del móvil
 * Usa DeviceMotion API para detectar:
 *   - Shake (agitar) → Saltar canción
 *   - Drop (descenso brusco) → Silenciar
 */
class MotionDetector {
  constructor() {
    this.shakeThreshold = 25;     // Umbral de aceleración para shake
    this.dropThreshold = 20;      // Umbral para descenso brusco
    this.cooldownMs = 2000;       // Cooldown entre detecciones
    this.lastShakeTime = 0;
    this.lastDropTime = 0;

    // Para detección de shake: necesitamos múltiples picos rápidos
    this.shakeCount = 0;
    this.shakeTimeWindow = 800;   // Ventana de tiempo para shake (ms)
    this.shakeStartTime = 0;
    this.requiredShakes = 3;      // Número de picos necesarios

    // Para detección de drop
    this.lastAccY = 0;
    this.prevAccY = 0;

    this.onShakeCallback = null;
    this.onDropCallback = null;
    this.isActive = false;
    this.permissionGranted = false;
  }

  /**
   * Solicitar permisos y empezar a escuchar
   */
  async start() {
    // En iOS 13+ hay que pedir permiso explícito
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
          console.warn('[Motion] Permiso denegado');
          return false;
        }
      } catch (err) {
        console.error('[Motion] Error pidiendo permiso:', err);
        return false;
      }
    }

    if (typeof DeviceMotionEvent === 'undefined') {
      console.warn('[Motion] DeviceMotion API no disponible');
      return false;
    }

    window.addEventListener('devicemotion', (e) => this._onMotion(e), true);
    this.isActive = true;
    this.permissionGranted = true;
    console.log('[Motion] Detección de movimiento activa');
    return true;
  }

  /**
   * Procesar evento de movimiento
   */
  _onMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const now = Date.now();
    const { x, y, z } = acc;

    // Magnitud total de aceleración
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    // --- Detección de SHAKE ---
    if (magnitude > this.shakeThreshold) {
      if (now - this.shakeStartTime > this.shakeTimeWindow) {
        // Reiniciar el conteo si ha pasado demasiado tiempo
        this.shakeCount = 0;
        this.shakeStartTime = now;
      }

      this.shakeCount++;

      if (this.shakeCount >= this.requiredShakes &&
          (now - this.lastShakeTime) > this.cooldownMs) {
        this.lastShakeTime = now;
        this.shakeCount = 0;
        console.log('[Motion] ¡SHAKE detectado!');
        if (this.onShakeCallback) {
          this.onShakeCallback();
        }
      }
    }

    // --- Detección de DROP (descenso brusco) ---
    // Detectar un cambio brusco negativo en el eje Y
    const deltaY = y - this.prevAccY;
    this.prevAccY = this.lastAccY;
    this.lastAccY = y;

    if (deltaY < -this.dropThreshold &&
        (now - this.lastDropTime) > this.cooldownMs) {
      this.lastDropTime = now;
      console.log('[Motion] ¡DROP detectado!');
      if (this.onDropCallback) {
        this.onDropCallback();
      }
    }
  }

  /**
   * Registrar callback para shake
   */
  onShake(callback) {
    this.onShakeCallback = callback;
  }

  /**
   * Registrar callback para drop
   */
  onDrop(callback) {
    this.onDropCallback = callback;
  }

  /**
   * Detener detección
   */
  stop() {
    window.removeEventListener('devicemotion', this._onMotion);
    this.isActive = false;
  }
}

// Singleton
window.motionDetector = new MotionDetector();

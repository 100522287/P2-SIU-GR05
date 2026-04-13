/**
 * motion-detector.js – Detección de movimientos del móvil
 * Usa DeviceMotion API para detectar:
 *   - Shake (agitar) → Saltar canción
 *   - Drop (descenso brusco real) → Silenciar
 * 
 * MEJORAS en Drop: requiere aceleración Y sostenida y fuerte,
 * con verificación de que NO es un simple giro de muñeca.
 */
/**
 * motion-detector.js – Detección de movimientos del móvil
 * Usa DeviceMotion API para detectar únicamente:
 * - Shake (agitar) → Saltar canción
 */
class MotionDetector {
  constructor() {
    this.shakeThreshold = 25;     // Umbral de aceleración para shake
    this.cooldownMs = 2000;       // Cooldown entre detecciones
    this.lastShakeTime = 0;

    // Para detección de shake: necesitamos múltiples picos rápidos
    this.shakeCount = 0;
    this.shakeTimeWindow = 800;
    this.shakeStartTime = 0;
    this.requiredShakes = 3;

    this.onShakeCallback = null;
    this.isActive = false;
  }

  /**
   * Solicitar permisos y empezar a escuchar
   */
  async start() {
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
    console.log('[Motion] Detección de movimiento activa (solo agitar)');
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
  }

  /**
   * Registrar callback para shake
   */
  onShake(callback) {
    this.onShakeCallback = callback;
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
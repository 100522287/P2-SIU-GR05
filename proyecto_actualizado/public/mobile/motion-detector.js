/**
 * motion-detector.js – Detección de movimientos del móvil
 * 
 * FIXES APLICADOS:
 * - Shake threshold aumentado de 25 a 30 para evitar falsos positivos
 * - Requiere 4 picos (no 3) en ventana de tiempo para confirmar shake
 * - Drop detection mejorada: requiere un descenso sostenido, no solo un pico
 * - Cooldown aumentado de 2000 a 2500ms
 * - Añadido filtro para ignorar aceleraciones por gravedad
 */
class MotionDetector {
  constructor() {
    this.shakeThreshold = 30;     // CAMBIO: umbral más alto
    this.dropThreshold = 22;      // CAMBIO: umbral más alto
    this.cooldownMs = 2500;       // CAMBIO: más cooldown
    this.lastShakeTime = 0;
    this.lastDropTime = 0;

    // Para shake: necesitamos picos rápidos alternantes
    this.shakeCount = 0;
    this.shakeTimeWindow = 800;
    this.shakeStartTime = 0;
    this.requiredShakes = 4;      // CAMBIO: requiere más picos

    // Para drop: historial de aceleraciones Y
    this.accYHistory = [];
    this.maxHistory = 10;

    this.onShakeCallback = null;
    this.onDropCallback = null;
    this.isActive = false;
    this.permissionGranted = false;

    // Binding para poder remover el listener
    this._boundOnMotion = (e) => this._onMotion(e);
  }

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

    window.addEventListener('devicemotion', this._boundOnMotion, true);
    this.isActive = true;
    this.permissionGranted = true;
    console.log('[Motion] Detección de movimiento activa');
    return true;
  }

  _onMotion(event) {
    // Usar acceleration (sin gravedad) si está disponible, es más fiable
    const acc = event.acceleration || event.accelerationIncludingGravity;
    if (!acc) return;

    const now = Date.now();
    const { x, y, z } = acc;

    // Si usamos accelerationIncludingGravity, necesitamos compensar
    // La gravedad es ~9.8 en el eje Z cuando el teléfono está plano
    const useRaw = !event.acceleration;
    const effectiveZ = useRaw ? (z || 0) - 9.8 : (z || 0);

    // Magnitud de aceleración (sin gravedad)
    const magnitude = Math.sqrt(
      (x || 0) * (x || 0) + 
      (y || 0) * (y || 0) + 
      effectiveZ * effectiveZ
    );

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
        console.log(`[Motion] ¡SHAKE detectado! (mag: ${magnitude.toFixed(1)})`);
        if (this.onShakeCallback) {
          this.onShakeCallback();
        }
      }
    }

    // --- Detección de DROP (descenso brusco) ---
    // Guardar historial de aceleración Y
    this.accYHistory.push({ y: y || 0, t: now });
    if (this.accYHistory.length > this.maxHistory) {
      this.accYHistory.shift();
    }

    // Verificar si hay un descenso sostenido (al menos 3 muestras negativas fuertes)
    if (this.accYHistory.length >= 5) {
      const recent = this.accYHistory.slice(-5);
      const negativeCount = recent.filter(a => a.y < -this.dropThreshold).length;

      if (negativeCount >= 3 && (now - this.lastDropTime) > this.cooldownMs) {
        this.lastDropTime = now;
        this.accYHistory = []; // Reset
        console.log('[Motion] ¡DROP detectado!');
        if (this.onDropCallback) {
          this.onDropCallback();
        }
      }
    }
  }

  onShake(callback) {
    this.onShakeCallback = callback;
  }

  onDrop(callback) {
    this.onDropCallback = callback;
  }

  stop() {
    window.removeEventListener('devicemotion', this._boundOnMotion, true);
    this.isActive = false;
  }
}

// Singleton
window.motionDetector = new MotionDetector();

/**
 * motion-detector.js – Detección de movimientos del móvil
 * Usa DeviceMotion API para detectar:
 *   - Shake (agitar) → Saltar canción
 *   - Drop (descenso brusco real) → Silenciar
 * 
 * MEJORAS en Drop: requiere aceleración Y sostenida y fuerte,
 * con verificación de que NO es un simple giro de muñeca.
 */
class MotionDetector {
  constructor() {
    this.shakeThreshold = 25;     // Umbral de aceleración para shake
    this.cooldownMs = 2000;       // Cooldown entre detecciones
    this.lastShakeTime = 0;
    this.lastDropTime = 0;

    // Para detección de shake: necesitamos múltiples picos rápidos
    this.shakeCount = 0;
    this.shakeTimeWindow = 800;
    this.shakeStartTime = 0;
    this.requiredShakes = 3;

    // Para detección de drop MEJORADA:
    // Requiere una aceleración Y negativa fuerte Y sostenida
    this.dropThreshold = 35;       // Umbral MUCHO MÁS ALTO para deltaY
    this.dropSustainedMs = 150;    // El movimiento brusco debe durar al menos 150ms
    this.dropStartTime = 0;
    this.isInDrop = false;
    this.dropSamples = 0;
    this.dropRequiredSamples = 3;  // Necesitamos al menos 3 muestras consecutivas de caída

    // Historial de aceleración Y para análisis de patrón
    this.accYHistory = [];
    this.maxHistory = 10;

    this.onShakeCallback = null;
    this.onDropCallback = null;
    this.isActive = false;
    this.permissionGranted = false;
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
    console.log('[Motion] Detección de movimiento activa (drop umbral: ' + this.dropThreshold + ')');
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

    // Guardar historial de Y
    this.accYHistory.push({ y: y, time: now });
    if (this.accYHistory.length > this.maxHistory) {
      this.accYHistory.shift();
    }

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

    // --- Detección de DROP MEJORADA ---
    // Necesitamos detectar un movimiento descendente REAL del brazo completo,
    // no un simple giro de muñeca.
    //
    // Criterios:
    // 1. La aceleración Y debe superar un umbral alto de forma SOSTENIDA
    // 2. Necesitamos varias muestras consecutivas de aceleración descendente fuerte
    // 3. La magnitud total debe ser alta (no solo rotación)

    const isDescending = this._checkDescendingPattern();

    if (isDescending) {
      if (!this.isInDrop) {
        this.isInDrop = true;
        this.dropStartTime = now;
        this.dropSamples = 1;
      } else {
        this.dropSamples++;
      }

      // Verificar si el drop es lo suficientemente sostenido
      const dropDuration = now - this.dropStartTime;
      if (this.dropSamples >= this.dropRequiredSamples &&
          dropDuration >= this.dropSustainedMs &&
          (now - this.lastDropTime) > this.cooldownMs) {
        this.lastDropTime = now;
        this.isInDrop = false;
        this.dropSamples = 0;
        console.log('[Motion] ¡DROP detectado! (sostenido ' + dropDuration + 'ms, ' + this.dropSamples + ' muestras)');
        if (this.onDropCallback) {
          this.onDropCallback();
        }
      }
    } else {
      // Si dejó de descender, resetear
      if (this.isInDrop) {
        const dropDuration = now - this.dropStartTime;
        // Si no duró lo suficiente, no es un drop real
        if (dropDuration < this.dropSustainedMs || this.dropSamples < this.dropRequiredSamples) {
          this.isInDrop = false;
          this.dropSamples = 0;
        }
      }
    }
  }

  /**
   * Verificar patrón de descenso analizando el historial de aceleración Y
   * Un descenso real tiene:
   *   - Valores de Y consistentemente bajos (negativos) en las últimas muestras
   *   - Un delta grande entre las muestras recientes y las anteriores
   */
  _checkDescendingPattern() {
    if (this.accYHistory.length < 3) return false;

    const recent = this.accYHistory.slice(-3);
    const older = this.accYHistory.slice(-6, -3);

    if (older.length === 0) return false;

    // Promedio de Y reciente vs antiguo
    const recentAvgY = recent.reduce((sum, s) => sum + s.y, 0) / recent.length;
    const olderAvgY = older.reduce((sum, s) => sum + s.y, 0) / older.length;

    // El delta debe ser MUY grande (caída real del brazo)
    const deltaY = recentAvgY - olderAvgY;

    // Un descenso brusco real produce un deltaY negativo muy grande
    return deltaY < -this.dropThreshold;
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

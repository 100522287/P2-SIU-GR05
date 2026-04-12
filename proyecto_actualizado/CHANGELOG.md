# CHANGELOG – Correcciones y Mejoras del Karaoke Ubicuo

## Resumen de problemas detectados y soluciones aplicadas

---

### 1. CRÍTICO: El vídeo de YouTube no se reproducía

**Problema:** Al añadir una canción y pulsar play, la letra comenzaba a desplazarse pero el vídeo se quedaba en negro. El overlay "Añade canciones desde el móvil" no desaparecía.

**Causa raíz:** 
- El parámetro `autoplay` estaba a `0` en el YouTube IFrame API
- El overlay tenía la clase `.hidden` solo en ciertos flujos, pero el estado inicial era visible sin `.hidden`
- `loadVideoById()` carga Y reproduce automáticamente, pero el estado del player no se sincronizaba

**Solución (`youtube-player.js`):**
- `autoplay: 1` en playerVars
- Uso de constantes `YT.PlayerState` en vez de números mágicos
- Añadidos métodos `getCurrentTime()` y `getDuration()` para sincronizar letras
- Overlay se oculta explícitamente al cargar un vídeo

---

### 2. CRÍTICO: El clap detector se activaba con cualquier sonido

**Problema:** Casi todo se detectaba como "doble aplauso" – hablar, toser, la propia música del karaoke. Esto hacía que la canción se reiniciara constantemente.

**Causa raíz:**
- Umbral de amplitud demasiado bajo (0.35)
- Sin análisis espectral: no distinguía un aplauso de voz o música
- Sin filtro de duración del impulso: sonidos continuos activaban la detección
- Cooldown insuficiente (3s)

**Solución (`clap-detector.js`):**
- Umbral subido a 0.55 (de 0.35)
- **Nuevo: análisis espectral** – un aplauso tiene proporcionalmente más energía en frecuencias altas (>2kHz) vs bajas (<1kHz). Se calcula el ratio high/low y solo se acepta si es >0.5
- **Nuevo: filtro de transiente** – solo se acepta si hay ≤3 frames consecutivos fuertes (un aplauso es un impulso corto, no sostenido)
- Echo cancellation activado en getUserMedia para reducir interferencia de la música
- Cooldown aumentado a 4 segundos
- Gap mínimo entre claps aumentado a 150ms

---

### 3. CRÍTICO: Los gestos del móvil eran poco fiables

**Problema:** El shake se activaba al caminar o mover el móvil normalmente. El drop se activaba con movimientos aleatorios.

**Causa raíz:**
- Threshold de shake muy bajo (25) y solo requería 3 picos
- Drop se basaba en un único delta negativo en el eje Y, que podía ocurrir por gravedad

**Solución (`motion-detector.js`):**
- Shake threshold subido a 30, requiere 4 picos (de 3)
- Usa `event.acceleration` (sin gravedad) si está disponible, con fallback a `accelerationIncludingGravity` compensando gravedad
- Drop ahora requiere **3 muestras consecutivas** con Y < -22 (no solo un pico)
- Cooldown aumentado a 2500ms
- Binding correcto del listener para poder hacer `removeEventListener`

---

### 4. CRÍTICO: No había navegación espacial en la TV

**Problema:** Para seleccionar canciones, el usuario tenía que tocar la pantalla del móvil (interacción táctil). Esto viola el requisito "Navegar y seleccionar espacial: implementar un mecanismo para explorar menús o listas sin contacto físico".

**Solución:**
- **Nuevo overlay de catálogo en TV** (`tv/index.html`, `tv/app.js`, `tv/style.css`):
  - Grid de 2 columnas con todas las canciones
  - Elemento seleccionado resaltado con borde violeta y escala
  - Instrucciones de gestos visibles
  
- **Nuevos gestos de navegación** (`gesture-detector.js`):
  - ✊ **Puño cerrado** → Abre/cierra catálogo
  - 👆👇 **Mano arriba/abajo** → Navega por las canciones (detección de movimiento vertical con historial de posiciones)
  - 👌 **OK** → Confirma y añade canción seleccionada a la cola
  - 👋 **Swipe horizontal** → Siguiente/anterior canción durante reproducción

- **Servidor** (`server.js`): nuevos eventos `tv-browse-toggle`, `tv-browse-nav`, `tv-browse-confirm` y acciones `browse-up/down/left/right`, `toggle-browse`

---

### 5. Las letras estaban totalmente desincronizadas del vídeo

**Problema:** Las letras avanzaban con un intervalo fijo de 4000ms independientemente de si el vídeo estaba reproduciéndose o no, y sin tener en cuenta la duración real de la canción.

**Solución (`tv/app.js`):**
- Se espera a que el vídeo esté cargado para obtener `getDuration()`
- Se calcula `timePerLine = duration / numLines` con mín 2s y máx 6s por línea
- Las letras **solo avanzan cuando `player.getPlayerState() === 1`** (PLAYING)
- Fallback a 3500ms si no se puede obtener la duración

---

### 6. Los comandos de voz se ejecutaban dos veces

**Problema:** Al decir "siguiente", la canción saltaba dos posiciones porque el comando de voz emitía tanto `gesture-detected` con `action: 'skip'` como `socket.emit('skip')` directamente.

**Solución (`mobile/app.js`):**
- Los comandos de voz ahora solo emiten la acción directa (`socket.emit('skip')`)
- `gesture-detected` se envía solo como notificación con `action: 'none'` para que la TV muestre el feedback visual sin duplicar la acción

---

### 7. Los gestos de la webcam eran inestables

**Problema:** Los gestos se activaban con un solo frame de detección + 600ms de hold, causando falsos positivos frecuentes.

**Solución (`gesture-detector.js`):**
- **Estabilidad por frames**: se requieren 5 frames consecutivos con el mismo gesto (antes era 1)
- Hold threshold aumentado a 800ms (de 600ms)
- Cooldown entre gestos: 2500ms (de 2000ms)
- Min detection confidence subido a 0.75 (de 0.7)
- Reset gradual: al perder el gesto, el contador baja de 1 en 1 en vez de resetearse inmediatamente

---

### 8. Mejoras menores

- **Barra de referencia de gestos** en el header de la TV: muestra los gestos disponibles
- **Mensaje de bienvenida** actualizado en el overlay del player con instrucciones de cómo empezar
- **Gestos de móvil documentados** en la pestaña de gestos del móvil con los nuevos gestos de TV
- **Mute toggle** en vez de solo mute: bajar el móvil bruscamente alterna entre silenciar/activar
- **Notificaciones** posicionadas más abajo para no solaparse con los indicadores de cámara/micrófono

---

## Mapeo de requisitos del enunciado

| Requisito | Implementación | Estado |
|---|---|---|
| Navegar y seleccionar espacial | Catálogo en TV con navegación por gestos de mano | ✅ |
| Control de funciones principales | Play/Pause (palma), Skip/Previous (swipe), Shake (skip) | ✅ |
| Salida o confirmación | Gesto OK (👌) confirma selección | ✅ |
| Funcionalidad adicional 1 | Agitar móvil → siguiente canción | ✅ |
| Funcionalidad adicional 2 | Comandos de voz (siguiente, pausa, reproducir, silencio) | ✅ |
| Funcionalidad adicional 3 | Doble aplauso → reiniciar canción (con análisis espectral) | ✅ |
| Múltiples dispositivos | TV (webcam + mic) + Smartphone (acelerómetro + mic) | ✅ |
| Servidor HTTP/Socket.IO | Node.js + Express + Socket.IO | ✅ |
| Interacción sin teclado/ratón | Gestos, voz, movimiento corporal | ✅ |

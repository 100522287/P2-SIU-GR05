# 🎤 Karaoke Ubicuo – Sistema Interactivo y Ubicuo

Sistema de karaoke distribuido que permite controlar la reproducción desde múltiples dispositivos usando **gestos**, **movimientos del cuerpo** y **comandos de voz**.

## 📋 Requisitos previos

- **Node.js** v18 o superior → [Descargar](https://nodejs.org)
- **Navegador moderno** (Chrome / Edge recomendado)
- **Webcam** (para gestos en pantalla TV)
- **Smartphone** con acelerómetro (para gestos de movimiento)
- Ambos dispositivos conectados a la **misma red WiFi**

## 🚀 Instalación y ejecución

### 1. Instalar dependencias

```bash
npm install
```

### 2. Arrancar el servidor

```bash
npm start
```

### 3. Abrir las vistas

- **📺 Pantalla TV** → Abrir `http://<TU-IP>:3000/tv` en el PC/TV
- **📱 Control Remoto** → Abrir `http://<TU-IP>:3000/mobile` en el smartphone

> ⚠️ **Importante:** Usa la dirección IP local (ej: `http://192.168.1.xxx:3000`) en lugar de `localhost` para que el smartphone pueda conectarse.

### 4. Si los sensores del móvil no funcionan (HTTPS requerido)

**Opción A:** Usar Chrome en Android con flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` y añadir `http://<TU-IP>:3000`.

**Opción B:** Generar un certificado auto-firmado:
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

## 🎮 Interacciones implementadas

### Funcionalidades obligatorias (requisitos del enunciado)

| Requisito | Interacción | Cómo funciona | Tecnología |
|---|---|---|---|
| **Navegar y seleccionar espacial** | Catálogo en TV + gestos de mano | ✊ Puño abre catálogo, 👆👇 mano arriba/abajo navega, 👌 OK selecciona | MediaPipe Hands |
| **Control de funciones principales** | Play/Pause/Skip/Anterior | ✋ Palma abierta pausa/reanuda, 👋 swipe horizontal cambia canción | MediaPipe Hands + Socket.IO |
| **Salida o confirmación** | Gesto OK (👌) | Confirma selección de canción en catálogo TV | MediaPipe Hands |

### 3 Funcionalidades adicionales

| Interacción | Cómo funciona | Tecnología |
|---|---|---|
| **Agitar para Saltar** | Agitar el móvil rápidamente (4+ picos) → salta canción | DeviceMotion API |
| **Comandos de Voz** | Decir "siguiente", "pausa", "reproducir", "silencio" | Web Speech API |
| **Doble Aplauso → Reiniciar** | Dos aplausos fuertes y rápidos → reinicia canción actual | Web Audio API (análisis espectral) |

### Interacciones adicionales del dispositivo móvil

| Interacción | Cómo funciona | Tecnología |
|---|---|---|
| **Descenso Brusco** | Bajar el móvil bruscamente → silenciar/activar sonido | DeviceMotion API |
| **Búsqueda Semántica** | Buscar canciones por significado, no solo texto | Transformers.js (all-MiniLM-L6-v2) |

## 🏗️ Arquitectura

```
┌─────────────────┐     Socket.IO      ┌─────────────────┐
│   📺 Vista TV    │◄──────────────────►│  Node.js Server  │
│  (PC/Smart TV)  │                    │  Express +       │
│                 │                    │  Socket.IO       │
│  - YouTube      │     Socket.IO      │                  │
│  - Letras sync  │◄──────────────────►│  Estado global   │
│  - MediaPipe    │                    │  de la cola      │
│  - Webcam       │                    │                  │
│  - Catálogo     │                    │                  │
│  - Clap Detect  │                    │                  │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                       Socket.IO│
                                                │
                                       ┌────────▼─────────┐
                                       │  📱 Vista Móvil   │
                                       │  (Smartphone)    │
                                       │                  │
                                       │  - Búsqueda      │
                                       │  - Transformers  │
                                       │  - DeviceMotion  │
                                       │  - Web Speech    │
                                       └──────────────────┘
```

## 📁 Estructura del proyecto

```
├── server.js                     # Servidor Node.js + Socket.IO
├── package.json
├── README.md
└── public/
    ├── shared/
    │   └── song-catalog.js       # Catálogo de canciones
    ├── tv/
    │   ├── index.html            # Vista TV (reproductor + catálogo)
    │   ├── style.css             # Estilos TV
    │   ├── app.js                # Lógica TV + catálogo + letras sync
    │   ├── youtube-player.js     # YouTube IFrame API
    │   ├── gesture-detector.js   # MediaPipe Hands (stop, ok, puño, nav, swipe)
    │   ├── clap-detector.js      # Web Audio API (doble aplauso)
    │   └── notifications.js      # Sistema de notificaciones
    └── mobile/
        ├── index.html            # Vista móvil
        ├── style.css             # Estilos móvil
        ├── app.js                # Lógica móvil
        ├── motion-detector.js    # DeviceMotion API (shake, drop)
        ├── voice-commands.js     # Web Speech API
        └── search-engine.js      # Transformers.js (búsqueda semántica)
```

## 🛠️ Tecnologías

- **Node.js + Express** – Servidor web
- **Socket.IO** – Comunicación en tiempo real bidireccional
- **MediaPipe Hands** – Detección de gestos de mano (5 gestos: stop, ok, puño, navegación, swipe)
- **DeviceMotion API** – Acelerómetro del smartphone (shake, drop)
- **Web Speech API** – Reconocimiento de voz en español
- **Web Audio API** – Análisis de audio para detección de aplausos con análisis espectral
- **Transformers.js** – Búsqueda semántica con modelo `all-MiniLM-L6-v2`
- **YouTube IFrame API** – Reproductor de vídeos de karaoke

## 📝 Changelog (respecto a versión anterior)

### Bugs corregidos
1. **YouTube no reproducía**: Player ahora auto-reproduce con `autoplay: 1` y manejo correcto de estados
2. **Clap detector hipersensible**: Umbral subido (0.35→0.55), añadido análisis espectral para distinguir aplausos de voz/música
3. **Gestos móvil poco fiables**: Shake requiere 4 picos (no 3), threshold subido, drop necesita 3 muestras consecutivas
4. **Acciones de voz duplicadas**: Voice commands ya no emiten gesture-detected + acción directa (solo una)
5. **Letras desincronizadas**: Ahora se calculan según duración real del vídeo y solo avanzan cuando el vídeo reproduce

### Nuevas funcionalidades
1. **Catálogo en TV**: Overlay fullscreen para selección de canciones por gestos (✊ abre, 👆👇 navega, 👌 selecciona)
2. **Gesto de puño**: ✊ para abrir/cerrar catálogo de canciones en la TV
3. **Navegación por mano**: Mover la mano arriba/abajo frente a la webcam para navegar el catálogo
4. **Swipe horizontal**: Deslizar la mano para cambiar de canción (siguiente/anterior)
5. **Barra de gestos en TV**: Header muestra los gestos disponibles como referencia rápida

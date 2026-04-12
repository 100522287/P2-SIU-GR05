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

Al arrancar, el servidor muestra las URLs:

- **📺 Pantalla TV** → Abrir `http://<TU-IP>:3000/tv` en el PC/TV
- **📱 Control Remoto** → Abrir `http://<TU-IP>:3000/mobile` en el smartphone

> ⚠️ **Importante:** Usa la dirección IP local (ej: `http://192.168.1.xxx:3000`) en lugar de `localhost` para que el smartphone pueda conectarse.

### 4. Si los sensores del móvil no funcionan (HTTPS requerido)

Algunos navegadores móviles requieren HTTPS para acceder al acelerómetro. En ese caso:

**Opción A:** Usar Chrome en Android con flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` y añadir `http://<TU-IP>:3000`.

**Opción B:** Generar un certificado auto-firmado:
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```
Y modificar `server.js` para usar HTTPS (ver comentarios en el código).

## 🎮 Interacciones implementadas

### Funcionalidades obligatorias
| Interacción | Cómo funciona | Tecnología |
|---|---|---|
| **Navegar y Seleccionar** | Búsqueda de canciones por texto y búsqueda semántica con IA | Transformers.js |
| **Control principal** | Play/Pause/Skip/Anterior desde botones del móvil | Socket.IO |
| **Confirmación** | Gesto de OK (👌) frente a la webcam de la TV | MediaPipe Hands |

### 3 Funcionalidades adicionales
| Interacción | Cómo funciona | Tecnología |
|---|---|---|
| **Agitar para Saltar** | Agitar el móvil rápidamente → salta canción | DeviceMotion API |
| **Comando de Voz** | Decir "siguiente", "pausa", "reproducir", "silencio" | Web Speech API |
| **Gesto de Stop** | Palma abierta (✋) frente a webcam → pausar/reanudar | MediaPipe Hands |
| **Descenso Brusco** | Bajar el móvil bruscamente → silenciar | DeviceMotion API |

## 🏗️ Arquitectura

```
┌─────────────────┐     Socket.IO      ┌─────────────────┐
│   📺 Vista TV    │◄──────────────────►│  Node.js Server  │
│  (PC/Smart TV)  │                    │  Express +       │
│                 │                    │  Socket.IO       │
│  - YouTube      │     Socket.IO      │                  │
│  - Letras       │◄──────────────────►│  Estado global   │
│  - MediaPipe    │                    │  de la cola      │
│  - Webcam       │                    │                  │
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
P2/
├── server.js                     # Servidor Node.js
├── package.json                  # Dependencias
├── README.md                     # Este archivo
└── public/
    ├── shared/
    │   └── song-catalog.js       # Catálogo de canciones
    ├── tv/
    │   ├── index.html            # Vista TV
    │   ├── style.css             # Estilos TV
    │   ├── app.js                # Lógica TV
    │   ├── youtube-player.js     # YouTube IFrame API
    │   ├── gesture-detector.js   # MediaPipe Hands
    │   └── notifications.js     # Notificaciones
    └── mobile/
        ├── index.html            # Vista móvil
        ├── style.css             # Estilos móvil
        ├── app.js                # Lógica móvil
        ├── motion-detector.js    # DeviceMotion API
        ├── voice-commands.js     # Web Speech API
        └── search-engine.js      # Transformers.js
```

## 🛠️ Tecnologías

- **Node.js + Express** – Servidor web
- **Socket.IO** – Comunicación en tiempo real
- **MediaPipe Hands** – Detección de gestos de mano por webcam
- **DeviceMotion API** – Acelerómetro del smartphone
- **Web Speech API** – Reconocimiento de voz en español
- **Transformers.js** – Búsqueda semántica con modelo `all-MiniLM-L6-v2`
- **YouTube IFrame API** – Reproductor de vídeos de karaoke
- **lyrics.ovh** – API de letras de canciones

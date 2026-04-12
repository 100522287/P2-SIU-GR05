const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --- Estado global del sistema ---
let state = {
  queue: [],           // Cola de canciones [{id, title, artist, youtubeId}]
  currentIndex: -1,    // Índice de la canción actual en la cola
  isPlaying: false,
  isMuted: false,
  volume: 100
};

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Ruta principal redirige a TV
app.get('/', (req, res) => {
  res.redirect('/tv');
});

// Rutas para las dos vistas
app.get('/tv', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tv', 'index.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile', 'index.html'));
});

// API proxy para letras (evitar CORS)
app.get('/api/lyrics/:artist/:title', async (req, res) => {
  try {
    const { artist, title } = req.params;
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({ error: 'Letra no encontrada' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Error obteniendo letras:', err.message);
    res.status(500).json({ error: 'Error del servidor al buscar letras' });
  }
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log(`[+] Cliente conectado: ${socket.id}`);

  // Enviar estado actual al nuevo cliente
  socket.emit('sync-state', state);

  // --- Eventos de la cola ---
  socket.on('add-to-queue', (song) => {
    console.log(`[Cola] Añadida: ${song.title} - ${song.artist}`);
    state.queue.push(song);

    // Si es la primera canción, reproducirla automáticamente
    if (state.queue.length === 1 && state.currentIndex === -1) {
      state.currentIndex = 0;
      state.isPlaying = true;
    }

    io.emit('sync-state', state);
    io.emit('notification', {
      type: 'queue',
      message: `🎵 "${song.title}" añadida a la cola`,
      icon: '🎵'
    });
  });

  socket.on('remove-from-queue', (index) => {
    if (index >= 0 && index < state.queue.length) {
      const removed = state.queue.splice(index, 1)[0];
      console.log(`[Cola] Eliminada: ${removed.title}`);

      // Ajustar el índice actual si es necesario
      if (index < state.currentIndex) {
        state.currentIndex--;
      } else if (index === state.currentIndex) {
        // Si se elimina la canción actual, pasar a la siguiente o parar
        if (state.queue.length === 0) {
          state.currentIndex = -1;
          state.isPlaying = false;
        } else if (state.currentIndex >= state.queue.length) {
          state.currentIndex = 0;
        }
      }

      io.emit('sync-state', state);
    }
  });

  // --- Controles de reproducción ---
  socket.on('play', () => {
    console.log('[Control] Play');
    state.isPlaying = true;
    io.emit('sync-state', state);
    io.emit('notification', { type: 'control', message: '▶️ Reproduciendo', icon: '▶️' });
  });

  socket.on('pause', () => {
    console.log('[Control] Pausa');
    state.isPlaying = false;
    io.emit('sync-state', state);
    io.emit('notification', { type: 'control', message: '⏸️ Pausado', icon: '⏸️' });
  });

  socket.on('skip', () => {
    console.log('[Control] Saltar');
    if (state.queue.length > 0) {
      state.currentIndex = (state.currentIndex + 1) % state.queue.length;
      state.isPlaying = true;
      state.isMuted = false;
      io.emit('sync-state', state);
      io.emit('notification', { type: 'control', message: '⏭️ Siguiente canción', icon: '⏭️' });
    }
  });

  socket.on('previous', () => {
    console.log('[Control] Anterior');
    if (state.queue.length > 0) {
      state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
      state.isPlaying = true;
      io.emit('sync-state', state);
      io.emit('notification', { type: 'control', message: '⏮️ Canción anterior', icon: '⏮️' });
    }
  });

  socket.on('mute', () => {
    console.log('[Control] Mute toggled');
    state.isMuted = !state.isMuted;
    io.emit('sync-state', state);
    io.emit('notification', {
      type: 'control',
      message: state.isMuted ? '🔇 Silenciado' : '🔊 Sonido activado',
      icon: state.isMuted ? '🔇' : '🔊'
    });
  });

  socket.on('set-volume', (volume) => {
    state.volume = Math.max(0, Math.min(100, volume));
    io.emit('sync-state', state);
  });

  // --- Eventos de gestos/voz/movimiento ---
  socket.on('gesture-detected', (data) => {
    console.log(`[Gesto] ${data.gesture} desde ${data.source}`);
    io.emit('notification', {
      type: 'gesture',
      message: data.message,
      icon: data.icon || '✋',
      source: data.source
    });

    // Ejecutar acción asociada al gesto
    switch (data.action) {
      case 'pause':
        state.isPlaying = false;
        io.emit('sync-state', state);
        break;
      case 'play':
        state.isPlaying = true;
        io.emit('sync-state', state);
        break;
      case 'toggle-play':
        state.isPlaying = !state.isPlaying;
        io.emit('sync-state', state);
        break;
      case 'skip':
        if (state.queue.length > 0) {
          state.currentIndex = (state.currentIndex + 1) % state.queue.length;
          state.isPlaying = true;
          state.isMuted = false;
        }
        io.emit('sync-state', state);
        break;
      case 'mute':
        state.isMuted = true;
        io.emit('sync-state', state);
        break;
      case 'unmute':
        state.isMuted = false;
        io.emit('sync-state', state);
        break;
      case 'confirm':
        // La confirmación se gestiona en el cliente
        break;
    }
  });

  socket.on('voice-command', (data) => {
    console.log(`[Voz] Comando: ${data.command}`);
    io.emit('notification', {
      type: 'voice',
      message: `🎤 Comando de voz: "${data.command}"`,
      icon: '🎤'
    });
  });

  socket.on('song-ended', () => {
    console.log('[Player] Canción terminada');
    if (state.queue.length > 0) {
      if (state.currentIndex < state.queue.length - 1) {
        state.currentIndex++;
        state.isPlaying = true;
      } else {
        // Fin de la cola
        state.isPlaying = false;
        io.emit('notification', {
          type: 'info',
          message: '🎶 ¡Fin de la cola! Añade más canciones',
          icon: '🎶'
        });
      }
      io.emit('sync-state', state);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Cliente desconectado: ${socket.id}`);
  });
});

// --- Arrancar servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  // Obtener IP local para mostrar en consola
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         🎤 KARAOKE UBICUO - SERVIDOR 🎤         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  📺 TV:     http://${localIP}:${PORT}/tv`);
  console.log(`║  📱 Móvil:  http://${localIP}:${PORT}/mobile`);
  console.log(`║  🌐 Local:  http://localhost:${PORT}`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Abre /tv en el PC y /mobile en el smartphone   ║');
  console.log('║  (ambos en la misma red WiFi)                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

/**
 * search-engine.js – Motor de búsqueda con Transformers.js para búsqueda semántica
 * Usa @xenova/transformers para generar embeddings y buscar por similitud
 */
class SearchEngine {
  constructor() {
    this.mode = 'text';  // 'text' o 'semantic'
    this.pipeline = null;
    this.embeddings = null;  // Embeddings pre-calculados del catálogo
    this.isModelLoaded = false;
    this.isLoading = false;
    this.catalog = [];
  }

  /**
   * Inicializar con el catálogo de canciones
   */
  init(catalog) {
    this.catalog = catalog;
  }

  /**
   * Búsqueda por texto (filtro simple)
   */
  searchByText(query) {
    if (!query || query.trim() === '') {
      return this.catalog;
    }

    const q = query.toLowerCase().trim();
    return this.catalog.filter(song => {
      return song.title.toLowerCase().includes(q) ||
             song.artist.toLowerCase().includes(q);
    });
  }

  /**
   * Cargar modelo de Transformers.js para búsqueda semántica
   */
  async loadModel(onProgress) {
    if (this.isModelLoaded || this.isLoading) return;

    this.isLoading = true;
    console.log('[Search] Cargando modelo de embeddings...');

    try {
      // Importar Transformers.js desde CDN
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');

      this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (progress) => {
          if (onProgress && progress.status === 'progress') {
            onProgress(Math.round(progress.progress));
          }
        }
      });

      // Pre-calcular embeddings del catálogo
      console.log('[Search] Calculando embeddings del catálogo...');
      this.embeddings = [];
      for (const song of this.catalog) {
        const text = `${song.title} ${song.artist}`;
        const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
        this.embeddings.push(Array.from(output.data));
      }

      this.isModelLoaded = true;
      this.isLoading = false;
      console.log('[Search] Modelo y embeddings listos');

    } catch (err) {
      console.error('[Search] Error cargando modelo:', err);
      this.isLoading = false;
      throw err;
    }
  }

  /**
   * Búsqueda semántica usando similitud coseno
   */
  async searchSemantic(query) {
    if (!this.isModelLoaded || !this.pipeline) {
      return this.searchByText(query);  // Fallback a texto
    }

    if (!query || query.trim() === '') {
      return this.catalog;
    }

    try {
      // Generar embedding de la consulta
      const output = await this.pipeline(query, { pooling: 'mean', normalize: true });
      const queryEmbedding = Array.from(output.data);

      // Calcular similitud coseno con cada canción
      const scored = this.catalog.map((song, i) => ({
        song: song,
        score: this._cosineSimilarity(queryEmbedding, this.embeddings[i])
      }));

      // Ordenar por similitud descendente
      scored.sort((a, b) => b.score - a.score);

      // Devolver las que tienen una similitud mínima
      return scored
        .filter(s => s.score > 0.1)
        .map(s => s.song);

    } catch (err) {
      console.error('[Search] Error en búsqueda semántica:', err);
      return this.searchByText(query);
    }
  }

  /**
   * Similitud coseno entre dos vectores
   */
  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Buscar según el modo actual
   */
  async search(query) {
    if (this.mode === 'semantic' && this.isModelLoaded) {
      return this.searchSemantic(query);
    }
    return this.searchByText(query);
  }

  /**
   * Cambiar modo de búsqueda
   */
  setMode(mode) {
    this.mode = mode;
    console.log(`[Search] Modo cambiado a: ${mode}`);
  }
}

// Singleton
window.searchEngine = new SearchEngine();

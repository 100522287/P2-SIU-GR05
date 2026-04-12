/**
 * notifications.js – Sistema de notificaciones para la pantalla TV
 */
class NotificationManager {
  constructor(containerId = 'notifications-container') {
    this.container = document.getElementById(containerId);
    this.maxNotifications = 5;
    this.defaultDuration = 3500;
  }

  /**
   * Muestra una notificación
   * @param {Object} options - { type, message, icon, duration }
   */
  show({ type = 'info', message = '', icon = 'ℹ️', duration = this.defaultDuration }) {
    // Limitar número de notificaciones
    while (this.container.children.length >= this.maxNotifications) {
      this.remove(this.container.firstChild);
    }

    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-message">${message}</span>
    `;

    this.container.appendChild(el);

    // Auto-eliminar
    setTimeout(() => this.remove(el), duration);
  }

  remove(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('removing');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }
}

// Singleton
window.notificationManager = new NotificationManager();

/**
 * PrompterCantor - Gerenciador do Player de Áudio / Vídeo (Melodia Guia)
 * Compatível com navegadores antigos (Safari do iOS 9/10/11/12 em iPads antigos).
 */

var MediaPlayer = {
  audioElement: null,
  playerContainer: null,
  trackNameEl: null,
  currentObjectUrl: null,

  init: function() {
    this.audioElement = document.getElementById('audioElement');
    this.playerContainer = document.getElementById('floatingAudioPlayer');
    this.trackNameEl = document.getElementById('audioTrackName');
  },

  loadMedia: function(audioData, fileName) {
    this.stop();

    if (!audioData) {
      this.hide();
      return;
    }

    if (this.trackNameEl) {
      this.trackNameEl.textContent = fileName || 'Melodia Guia';
    }

    if (typeof audioData === 'string') {
      this.audioElement.src = audioData;
    } else if (audioData && (audioData instanceof Blob || audioData instanceof File)) {
      var createUrl = window.URL || window.webkitURL;
      if (createUrl) {
        this.currentObjectUrl = createUrl.createObjectURL(audioData);
        this.audioElement.src = this.currentObjectUrl;
      }
    }

    this.show();
  },

  play: function() {
    if (this.audioElement && this.audioElement.src) {
      try {
        this.audioElement.play();
      } catch (e) {
        console.warn('Autoplay bloqueado:', e);
      }
    }
  },

  pause: function() {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  },

  stop: function() {
    if (this.audioElement) {
      this.audioElement.pause();
      try { this.audioElement.currentTime = 0; } catch (e) {}
      this.audioElement.removeAttribute('src');
    }
    if (this.currentObjectUrl) {
      var revokeUrl = (window.URL || window.webkitURL || {}).revokeObjectURL;
      if (revokeUrl) revokeUrl(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  },

  show: function() {
    if (this.playerContainer) {
      this.playerContainer.classList.remove('hidden');
    }
  },

  hide: function() {
    this.stop();
    if (this.playerContainer) {
      this.playerContainer.classList.add('hidden');
    }
  }
};

window.MediaPlayer = MediaPlayer;

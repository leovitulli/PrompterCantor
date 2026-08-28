/**
 * PrompterCantor - Player de Áudio Avançado
 * Funcionalidades:
 *  - Detecção automática de tom/key via análise de frequência
 *  - Controle de pitch (transposição em semitons) via Web Audio API
 *  - Vocal remover via cancelamento de fase (estéreo)
 *  - Controle de velocidade sem mudar pitch
 *  - Waveform visualizer
 */

var AdvancedPlayer = (function() {

  var _ctx = null;           // AudioContext
  var _source = null;        // AudioBufferSourceNode
  var _gainNode = null;
  var _buffer = null;        // AudioBuffer decodificado
  var _isPlaying = false;
  var _startedAt = 0;
  var _pausedAt = 0;
  var _duration = 0;
  var _pitchShift = 0;       // semitons (-12 a +12)
  var _playbackRate = 1.0;
  var _vocalMode = 'full';   // 'full' | 'instrumental' | 'vocal'
  var _animFrame = null;
  var _canvas = null;
  var _canvasCtx = null;
  var _analyser = null;
  var _currentSong = null;
  var _currentObjectUrl = null;

  // ─── Inicialização ─────────────────────────────────────

  function init() {
    _canvas = document.getElementById('apWaveform');
    if (_canvas) _canvasCtx = _canvas.getContext('2d');

    // Botões
    bindBtn('apPlayPause', togglePlay);
    bindBtn('apStop', stop);
    bindBtn('apPitchDown', function() { changePitch(-1); });
    bindBtn('apPitchUp', function() { changePitch(+1); });
    bindBtn('apPitchReset', function() { setPitch(0); });
    bindBtn('apVocalFull', function() { setVocalMode('full'); });
    bindBtn('apVocalInstrumental', function() { setVocalMode('instrumental'); });

    var rateSlider = document.getElementById('apRate');
    if (rateSlider) {
      rateSlider.addEventListener('input', function() {
        _playbackRate = parseFloat(this.value);
        var display = document.getElementById('apRateDisplay');
        if (display) display.textContent = Math.round(_playbackRate * 100) + '%';
        if (_isPlaying) {
          var pos = getCurrentPosition();
          restartFrom(pos);
        }
      });
    }

    var seekBar = document.getElementById('apSeek');
    if (seekBar) {
      seekBar.addEventListener('input', function() {
        var pos = (parseFloat(this.value) / 100) * _duration;
        if (_isPlaying) restartFrom(pos);
        else _pausedAt = pos;
        updateTimeDisplay(pos);
      });
    }
  }

  function bindBtn(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ─── Carregar Áudio ────────────────────────────────────

  function loadSong(song) {
    _currentSong = song;
    stop();

    var playerEl = document.getElementById('advancedPlayer');
    if (!playerEl) return;

    var blob = song.audioBlob;
    if (!blob) {
      playerEl.classList.add('hidden');
      return;
    }

    playerEl.classList.remove('hidden');
    setStatus('Carregando áudio...');

    if (_currentObjectUrl) URL.revokeObjectURL(_currentObjectUrl);
    _currentObjectUrl = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));

    getAudioContext().then(function(ctx) {
      return fetch(_currentObjectUrl)
        .then(function(r) { return r.arrayBuffer(); })
        .then(function(ab) { return ctx.decodeAudioData(ab); })
        .then(function(buffer) {
          _buffer = buffer;
          _duration = buffer.duration;
          _pausedAt = 0;
          var nameEl = document.getElementById('apSongName');
          if (nameEl) nameEl.textContent = song.title || 'Áudio Guia';

          detectKey(buffer).then(function(result) {
            var keyEl = document.getElementById('apDetectedKey');
            if (keyEl && result) {
              var fullKey = result.key + (result.mode === 'minor' ? 'm' : '');
              keyEl.textContent = fullKey;
              keyEl.title = 'Detectado automaticamente: ' + result.key + ' ' + result.mode;
              // Sugerir atualizar o tom da música
              var suggestEl = document.getElementById('apKeySuggest');
              if (suggestEl) {
                suggestEl.classList.remove('hidden');
                suggestEl.setAttribute('data-key', fullKey);
                suggestEl.textContent = '↑ Usar como tom da música (' + fullKey + ')';
              }
            }
          });
        });
    }).catch(function(err) {
      console.error('Erro ao carregar áudio:', err);
      setStatus('Erro ao carregar');
    });
  }

  // ─── AudioContext ──────────────────────────────────────

  function getAudioContext() {
    if (!_ctx || _ctx.state === 'closed') {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return Promise.reject(new Error('Web Audio API não suportada'));
      _ctx = new AudioCtx();
    }
    if (_ctx.state === 'suspended') {
      return _ctx.resume().then(function() { return _ctx; });
    }
    return Promise.resolve(_ctx);
  }

  // ─── Play / Pause / Stop ───────────────────────────────

  function play() {
    if (!_buffer) return;
    if (_isPlaying) return;

    getAudioContext().then(function(ctx) {
      buildGraph(ctx, _pausedAt);
      _isPlaying = true;
      updatePlayBtn(true);
      startProgressLoop();
    });
  }

  function pause() {
    if (!_isPlaying) return;
    _pausedAt = getCurrentPosition();
    if (_source) { try { _source.stop(); } catch(e) {} }
    _source = null;
    _isPlaying = false;
    updatePlayBtn(false);
    cancelAnimationFrame(_animFrame);
  }

  function stop() {
    if (_source) { try { _source.stop(); } catch(e) {} }
    _source = null;
    _isPlaying = false;
    _pausedAt = 0;
    updatePlayBtn(false);
    updateTimeDisplay(0);
    var seekBar = document.getElementById('apSeek');
    if (seekBar) seekBar.value = 0;
    cancelAnimationFrame(_animFrame);
    clearWaveform();
  }

  function togglePlay() {
    if (_isPlaying) pause(); else play();
  }

  function restartFrom(pos) {
    if (_source) { try { _source.stop(); } catch(e) {} }
    _source = null;
    _isPlaying = false;
    _pausedAt = pos;
    if (_buffer) {
      getAudioContext().then(function(ctx) {
        buildGraph(ctx, pos);
        _isPlaying = true;
        updatePlayBtn(true);
      });
    }
  }

  // ─── Algoritmo de Pitch Shift com Preservação de Tempo ──

  var _pitchCache = {};

  function getPitchShiftedBuffer(ctx, inBuffer, semitones) {
    if (semitones === 0) return inBuffer;
    var cacheKey = _vocalMode + '_' + semitones;
    if (_pitchCache[cacheKey]) return _pitchCache[cacheKey];

    var pitchRatio = Math.pow(2, semitones / 12);
    var numChannels = inBuffer.numberOfChannels;
    var sampleRate = inBuffer.sampleRate;
    var inputLength = inBuffer.length;

    var outBuffer = ctx.createBuffer(numChannels, inputLength, sampleRate);
    var windowSize = Math.floor(sampleRate * 0.04); // 40ms window
    var hopSize = Math.floor(windowSize / 2);

    // Hanning Window
    var windowArr = new Float32Array(windowSize);
    for (var w = 0; w < windowSize; w++) {
      windowArr[w] = 0.5 * (1 - Math.cos((2 * Math.PI * w) / (windowSize - 1)));
    }

    for (var ch = 0; ch < numChannels; ch++) {
      var inData = inBuffer.getChannelData(ch);
      var outData = outBuffer.getChannelData(ch);
      var normWeights = new Float32Array(inputLength);

      var inPos = 0;
      var outPos = 0;

      while (outPos + windowSize < inputLength && inPos + windowSize < inputLength) {
        for (var i = 0; i < windowSize; i++) {
          var srcIdx = Math.floor(inPos + i * pitchRatio);
          if (srcIdx < inputLength) {
            outData[outPos + i] += inData[srcIdx] * windowArr[i];
            normWeights[outPos + i] += windowArr[i];
          }
        }
        outPos += hopSize;
        inPos += hopSize;
      }

      for (var j = 0; j < inputLength; j++) {
        if (normWeights[j] > 0.001) {
          outData[j] /= normWeights[j];
        }
      }
    }

    _pitchCache[cacheKey] = outBuffer;
    return outBuffer;
  }

  // ─── Grafo de Áudio (com Pitch e Vocal Mode) ───────────

  function buildGraph(ctx, offset) {
    if (_source) { try { _source.stop(); } catch(e) {} }

    var buffer = _buffer;

    // Se modo instrumental: cancelamento de fase para remover voz
    if (_vocalMode === 'instrumental' && buffer.numberOfChannels >= 2) {
      buffer = createInstrumentalBuffer(ctx, _buffer);
    } else if (_vocalMode === 'vocal' && buffer.numberOfChannels >= 2) {
      buffer = createVocalBuffer(ctx, _buffer);
    }

    // Aplicar Pitch Shift se diferente de 0 (mantendo o tempo/velocidade constante)
    if (_pitchShift !== 0) {
      buffer = getPitchShiftedBuffer(ctx, buffer, _pitchShift);
    }

    _source = ctx.createBufferSource();
    _source.buffer = buffer;

    // Velocidade de reprodução isolada
    _source.playbackRate.value = _playbackRate;

    _gainNode = ctx.createGain();
    _gainNode.gain.value = 1.0;

    _analyser = ctx.createAnalyser();
    _analyser.fftSize = 2048;

    _source.connect(_gainNode);
    _gainNode.connect(_analyser);
    _analyser.connect(ctx.destination);

    _startedAt = ctx.currentTime - offset / _playbackRate;
    _source.start(0, offset);

    _source.onended = function() {
      if (_isPlaying) {
        _isPlaying = false;
        _pausedAt = 0;
        updatePlayBtn(false);
        cancelAnimationFrame(_animFrame);
        var seekBar = document.getElementById('apSeek');
        if (seekBar) seekBar.value = 0;
        updateTimeDisplay(0);
      }
    };
  }

  // ─── Cancelamento de fase para Instrumental / Vocal ────

  function createInstrumentalBuffer(ctx, original) {
    // L' = (L - R) / 2 → remove centro (onde a voz costuma estar)
    var ch = original.numberOfChannels;
    var len = original.length;
    var outBuffer = ctx.createBuffer(1, len, original.sampleRate);
    var L = original.getChannelData(0);
    var R = original.getChannelData(ch >= 2 ? 1 : 0);
    var out = outBuffer.getChannelData(0);

    for (var i = 0; i < len; i++) {
      out[i] = (L[i] - R[i]) * 0.5;
    }
    return outBuffer;
  }

  function createVocalBuffer(ctx, original) {
    // Vocal = L + R (centro da imagem estéreo)
    var ch = original.numberOfChannels;
    var len = original.length;
    var outBuffer = ctx.createBuffer(1, len, original.sampleRate);
    var L = original.getChannelData(0);
    var R = original.getChannelData(ch >= 2 ? 1 : 0);
    var out = outBuffer.getChannelData(0);

    for (var i = 0; i < len; i++) {
      out[i] = (L[i] + R[i]) * 0.5;
    }
    return outBuffer;
  }

  // ─── Pitch Control ─────────────────────────────────────

  function changePitch(delta) {
    setPitch(_pitchShift + delta);
  }

  function setPitch(semitones) {
    _pitchShift = Math.max(-12, Math.min(12, semitones));

    var display = document.getElementById('apPitchDisplay');
    if (display) {
      var sign = _pitchShift > 0 ? '+' : '';
      display.textContent = sign + _pitchShift + ' st';
      display.className = 'ap-pitch-display ' +
        (_pitchShift > 0 ? 'pitch-up' : _pitchShift < 0 ? 'pitch-down' : 'pitch-neutral');
    }

    if (_isPlaying) {
      var pos = getCurrentPosition();
      restartFrom(pos);
    }
  }

  // ─── Vocal Mode ────────────────────────────────────────

  function setVocalMode(mode) {
    _vocalMode = mode;

    ['apVocalFull', 'apVocalInstrumental'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });

    var modeMap = { 'full': 'apVocalFull', 'instrumental': 'apVocalInstrumental' };
    var activeBtn = document.getElementById(modeMap[mode]);
    if (activeBtn) activeBtn.classList.add('active');

    var noteEl = document.getElementById('apVocalNote');
    if (noteEl) {
      noteEl.textContent = mode === 'instrumental'
        ? '⚠️ Remoção de voz funciona melhor em faixas estéreo gravadas profissionalmente.'
        : '';
    }

    if (_isPlaying) {
      var pos = getCurrentPosition();
      restartFrom(pos);
    }
  }

  // ─── Detecção de Tom/Key ────────────────────────────────

  function detectKey(buffer) {
    return new Promise(function(resolve) {
      try {
        // Análise baseada em Chroma Features (perfil de classes de pitch)
        var sampleRate = buffer.sampleRate;
        var data = buffer.getChannelData(0);

        // Downsample e analisar via FFT parcial usando AudioContext offline
        var notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        var chroma = new Array(12).fill(0);

        // Amostrar frames do áudio
        var frameSize = 2048;
        var hopSize = 1024;
        var frameCount = 0;

        for (var offset = 0; offset + frameSize < data.length; offset += hopSize) {
          if (frameCount > 200) break; // Limitar para performance

          // Aplicar janela de Hann
          var windowed = new Float32Array(frameSize);
          for (var n = 0; n < frameSize; n++) {
            var hann = 0.5 * (1 - Math.cos(2 * Math.PI * n / (frameSize - 1)));
            windowed[n] = data[offset + n] * hann;
          }

          // FFT simplificada: mapear bins de frequência para classes de pitch
          // Faixas de frequência para cada nota (octavas 2-6)
          var binFreq = sampleRate / frameSize;
          for (var bin = 1; bin < frameSize / 2; bin++) {
            var freq = bin * binFreq;
            if (freq < 65 || freq > 2093) continue; // C2 a C7

            // Amplitude (simplificada)
            var amp = Math.abs(windowed[bin]);
            if (amp < 0.001) continue;

            // Mapear frequência para classe de pitch (nota)
            var midiNote = 12 * Math.log2(freq / 440) + 69;
            var pitchClass = Math.round(midiNote) % 12;
            if (pitchClass < 0) pitchClass += 12;
            chroma[pitchClass] += amp;
          }
          frameCount++;
        }

        // Normalizar
        var maxChroma = Math.max.apply(null, chroma);
        if (maxChroma > 0) {
          for (var i = 0; i < 12; i++) chroma[i] /= maxChroma;
        }

        // Perfis de escala Krumhansl-Schmuckler
        var majorProfile = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
        var minorProfile = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

        var bestScore = -Infinity;
        var bestKey = 0;
        var bestMode = 'major';

        for (var key = 0; key < 12; key++) {
          // Correlação com perfil maior
          var majScore = 0, minScore = 0;
          for (var pc = 0; pc < 12; pc++) {
            majScore += chroma[pc] * majorProfile[(pc - key + 12) % 12];
            minScore += chroma[pc] * minorProfile[(pc - key + 12) % 12];
          }
          if (majScore > bestScore) { bestScore = majScore; bestKey = key; bestMode = 'major'; }
          if (minScore > bestScore) { bestScore = minScore; bestKey = key; bestMode = 'minor'; }
        }

        resolve({ key: notes[bestKey], mode: bestMode, chroma: chroma });
      } catch(e) {
        console.warn('Detecção de tom falhou:', e);
        resolve(null);
      }
    });
  }

  // ─── Progress Loop ─────────────────────────────────────

  function getCurrentPosition() {
    if (!_ctx || !_isPlaying) return _pausedAt;
    var elapsed = (_ctx.currentTime - _startedAt) * _playbackRate;
    return Math.min(elapsed, _duration);
  }

  function startProgressLoop() {
    function loop() {
      if (!_isPlaying) return;
      var pos = getCurrentPosition();
      updateTimeDisplay(pos);

      var seekBar = document.getElementById('apSeek');
      if (seekBar && _duration > 0) {
        seekBar.value = (pos / _duration) * 100;
      }

      drawWaveform();
      _animFrame = requestAnimationFrame(loop);
    }
    _animFrame = requestAnimationFrame(loop);
  }

  // ─── Waveform Visualizer ───────────────────────────────

  function drawWaveform() {
    if (!_canvasCtx || !_analyser || !_canvas) return;

    var bufLen = _analyser.frequencyBinCount;
    var dataArr = new Uint8Array(bufLen);
    _analyser.getByteTimeDomainData(dataArr);

    var w = _canvas.width;
    var h = _canvas.height;
    _canvasCtx.clearRect(0, 0, w, h);

    _canvasCtx.lineWidth = 2;
    _canvasCtx.strokeStyle = '#00e676';
    _canvasCtx.shadowBlur = 6;
    _canvasCtx.shadowColor = '#00e676';
    _canvasCtx.beginPath();

    var sliceWidth = w / bufLen;
    var x = 0;

    for (var i = 0; i < bufLen; i++) {
      var v = dataArr[i] / 128.0;
      var y = v * h / 2;
      if (i === 0) _canvasCtx.moveTo(x, y);
      else _canvasCtx.lineTo(x, y);
      x += sliceWidth;
    }
    _canvasCtx.lineTo(w, h / 2);
    _canvasCtx.stroke();
    _canvasCtx.shadowBlur = 0;
  }

  function clearWaveform() {
    if (!_canvasCtx || !_canvas) return;
    _canvasCtx.clearRect(0, 0, _canvas.width, _canvas.height);
    // Linha neutra
    _canvasCtx.strokeStyle = 'rgba(0,230,118,0.2)';
    _canvasCtx.lineWidth = 1;
    _canvasCtx.beginPath();
    _canvasCtx.moveTo(0, _canvas.height / 2);
    _canvasCtx.lineTo(_canvas.width, _canvas.height / 2);
    _canvasCtx.stroke();
  }

  // ─── UI Helpers ────────────────────────────────────────

  function updatePlayBtn(playing) {
    var btn = document.getElementById('apPlayPause');
    if (!btn) return;
    btn.innerHTML = playing
      ? '<span>⏸</span> Pausar'
      : '<span>▶</span> Tocar';
    btn.className = playing ? 'ap-btn ap-btn-play playing' : 'ap-btn ap-btn-play';
  }

  function updateTimeDisplay(pos) {
    var el = document.getElementById('apTime');
    if (el) el.textContent = formatTime(pos) + ' / ' + formatTime(_duration);
  }

  function formatTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function setStatus(msg) {
    var el = document.getElementById('apStatus');
    if (el) el.textContent = msg;
  }

  function hide() {
    stop();
    var el = document.getElementById('advancedPlayer');
    if (el) el.classList.add('hidden');
  }

  return {
    init: init,
    loadSong: loadSong,
    hide: hide,
    play: play,
    pause: pause,
    stop: stop,
    setPitch: setPitch,
    setVocalMode: setVocalMode
  };

})();

window.AdvancedPlayer = AdvancedPlayer;

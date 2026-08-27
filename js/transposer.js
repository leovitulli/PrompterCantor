/**
 * PrompterCantor — Motor Harmônico de Transposição Musical e Normalização de Tons
 * Permite transposição instantânea de acordes e letras em tempo real.
 */

(function () {
  'use strict';

  var CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var CHROMATIC_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  var ENHARMONIC_EQUIV = {
    'DB': 'C#', 'C#': 'Db',
    'EB': 'D#', 'D#': 'Eb',
    'GB': 'F#', 'F#': 'Gb',
    'AB': 'G#', 'G#': 'Ab',
    'BB': 'A#', 'A#': 'Bb',
    'DBM': 'C#m', 'C#M': 'Dbm',
    'EBM': 'D#m', 'D#M': 'Ebm',
    'GBM': 'F#m', 'F#M': 'Gbm',
    'ABM': 'G#m', 'G#M': 'Abm',
    'BBM': 'A#m', 'A#M': 'Bbm'
  };

  var NOTE_TO_INDEX = {
    'C': 0, 'B#': 0,
    'C#': 1, 'DB': 1,
    'D': 2,
    'D#': 3, 'EB': 3,
    'E': 4, 'FB': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'GB': 6,
    'G': 7,
    'G#': 8, 'AB': 8,
    'A': 9,
    'A#': 10, 'BB': 10,
    'B': 11, 'CB': 11
  };

  function normalizeKey(rawKey) {
    if (!rawKey) return '';
    var k = String(rawKey).trim().replace(/\s+/g, '');
    var match = k.match(/^([A-Ga-g])([#b]?)(m?)(.*)$/i);
    if (!match) return k;

    var root = match[1].toUpperCase();
    var accidental = match[2] ? (match[2] === '#' ? '#' : 'b') : '';
    var minor = match[3] ? 'm' : '';
    var suffix = match[4] || '';

    // Tratar maiúsculas como "DM", "GM", "AM" vindas de importação
    if (k.length >= 2 && k.endsWith('M') && !k.endsWith('7M') && !k.endsWith('maj') && !k.endsWith('7+')) {
      minor = 'm';
    }

    return root + accidental + minor + suffix;
  }

  function getNoteIndex(note) {
    if (!note) return -1;
    var norm = note.toUpperCase().trim();
    return NOTE_TO_INDEX.hasOwnProperty(norm) ? NOTE_TO_INDEX[norm] : -1;
  }

  function parseRootAndSuffix(chordStr) {
    if (!chordStr) return null;
    var match = chordStr.match(/^([A-G][#b]?)(.*)$/i);
    if (!match) return null;
    return {
      root: match[1],
      suffix: match[2] || ''
    };
  }

  var Transposer = {
    normalizeKey: normalizeKey,

    setSelectKey: function (selectEl, rawKey) {
      if (!selectEl) return;
      if (!rawKey) {
        selectEl.value = '';
        return;
      }

      var normKey = normalizeKey(rawKey);

      // 1. Tentar correspondência exata
      for (var i = 0; i < selectEl.options.length; i++) {
        if (selectEl.options[i].value === normKey) {
          selectEl.selectedIndex = i;
          return;
        }
      }

      // 2. Tentar correspondência insensível a maiúsculas
      var lower = normKey.toLowerCase();
      for (var j = 0; j < selectEl.options.length; j++) {
        if (selectEl.options[j].value.toLowerCase() === lower) {
          selectEl.selectedIndex = j;
          return;
        }
      }

      // 3. Tentar enarmônicos (ex: Bb <-> A#, Db <-> C#, etc.)
      var upper = normKey.toUpperCase();
      var equiv = ENHARMONIC_EQUIV[upper];
      if (equiv) {
        for (var e = 0; e < selectEl.options.length; e++) {
          if (selectEl.options[e].value.toLowerCase() === equiv.toLowerCase()) {
            selectEl.selectedIndex = e;
            return;
          }
        }
      }

      // 4. Se a opção não existir no dropdown, adiciona temporariamente para não perder o tom
      var opt = document.createElement('option');
      opt.value = normKey;
      opt.textContent = normKey;
      selectEl.appendChild(opt);
      selectEl.value = normKey;
    },

    getKeyDistance: function (fromKey, toKey) {
      if (!fromKey || !toKey) return 0;
      var fromNorm = normalizeKey(fromKey);
      var toNorm = normalizeKey(toKey);

      var fromParsed = parseRootAndSuffix(fromNorm);
      var toParsed = parseRootAndSuffix(toNorm);
      if (!fromParsed || !toParsed) return 0;

      var idxFrom = getNoteIndex(fromParsed.root);
      var idxTo = getNoteIndex(toParsed.root);
      if (idxFrom === -1 || idxTo === -1) return 0;

      var diff = idxTo - idxFrom;
      if (diff > 6) diff -= 12;
      if (diff < -6) diff += 12;
      return diff;
    },

    transposeNote: function (note, semitones, preferFlat) {
      var idx = getNoteIndex(note);
      if (idx === -1) return note;

      var targetIdx = (idx + semitones) % 12;
      if (targetIdx < 0) targetIdx += 12;

      var scale = preferFlat ? CHROMATIC_FLAT : CHROMATIC_SHARP;
      return scale[targetIdx];
    },

    transposeChord: function (chord, semitones, preferFlat) {
      if (!chord || semitones === 0) return chord;

      var parts = chord.split('/');
      var mainChord = parts[0];
      var bassNote = parts[1] || '';

      var parsed = parseRootAndSuffix(mainChord);
      if (!parsed) return chord;

      var newRoot = this.transposeNote(parsed.root, semitones, preferFlat);
      var result = newRoot + parsed.suffix;

      if (bassNote) {
        var parsedBass = parseRootAndSuffix(bassNote);
        if (parsedBass) {
          var newBass = this.transposeNote(parsedBass.root, semitones, preferFlat) + parsedBass.suffix;
          result += '/' + newBass;
        } else {
          result += '/' + bassNote;
        }
      }

      return result;
    },

    transposeText: function (text, semitones, preferFlat) {
      if (!text || semitones === 0) return text;
      var self = this;

      var chordRegex = /([A-G][#b]?(?:M|maj|min|m|dim|aug|sus|add|alt|[0-9\+\-º°#b]|\([0-9\+\-º°#b]+\))*(?:\/[A-G][#b]?)?)/g;

      var lines = text.split(/\r?\n/);
      var resultLines = [];

      for (var l = 0; l < lines.length; l++) {
        var line = lines[l];
        var trimmed = line.trim();

        if (window.TextParser && window.TextParser.isChordLine(trimmed)) {
          var transposedLine = line.replace(chordRegex, function (match) {
            return self.transposeChord(match, semitones, preferFlat);
          });
          resultLines.push(transposedLine);
        } else {
          resultLines.push(line);
        }
      }

      return resultLines.join('\n');
    }
  };

  window.Transposer = Transposer;
})();

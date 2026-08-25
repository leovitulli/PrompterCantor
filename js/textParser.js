/**
 * PrompterCantor - Parser Universal de Arquivos de Texto (.docx, .pdf, .txt, etc)
 * Compatível com navegadores antigos (Safari do iOS 9/10/11/12 em iPads antigos).
 */

var TextParser = {
  /**
   * Processa um File ou string de texto e retorna uma lista de músicas extraídas.
   */
  parseFile: function(input, filename) {
    var self = this;
    var fname = filename || 'Repertório.txt';

    return new Promise(function(resolve, reject) {
      if (typeof input === 'string') {
        return resolve(self.splitMultipleSongs(input, fname));
      } else if (input && input.name) {
        fname = input.name;
        var ext = fname.substring(fname.lastIndexOf('.')).toLowerCase();

        var readPromise;
        if (ext === '.docx' || ext === '.doc') {
          readPromise = self.parseDocx(input);
        } else if (ext === '.pdf') {
          readPromise = self.parsePdf(input);
        } else {
          readPromise = self.readAsText(input);
        }

        readPromise.then(function(rawText) {
          resolve(self.splitMultipleSongs(rawText, fname));
        }).catch(function(err) {
          console.warn('Erro ao ler arquivo:', err);
          resolve([{
            title: self.cleanFilename(fname),
            key: '',
            artist: '',
            composer: '',
            content: '(Não foi possível extrair o texto formatado do arquivo)\n\nTente colar o texto manualmente.',
            originalFileName: fname
          }]);
        });
      } else {
        resolve([]);
      }
    });
  },

  parseDocx: function(file) {
    return new Promise(function(resolve, reject) {
      if (!window.mammoth) return reject(new Error('Mammoth.js não carregado.'));
      var reader = new FileReader();
      reader.onload = function(e) {
        window.mammoth.extractRawText({ arrayBuffer: e.target.result })
          .then(function(result) { resolve(result.value); })
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  parsePdf: function(file) {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (!window.pdfjsLib) {
        return self.readAsText(file).then(resolve).catch(reject);
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        var typedarray = new Uint8Array(e.target.result);
        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
          var numPages = pdf.numPages;
          var promises = [];
          for (var i = 1; i <= numPages; i++) {
            promises.push(pdf.getPage(i).then(function(page) {
              return page.getTextContent().then(function(tc) {
                if (!tc || !tc.items || tc.items.length === 0) return '';
                // Agrupar itens por linha baseado na posição vertical (Y)
                var items = tc.items.slice();
                items.sort(function(a, b) {
                  var yA = a.transform[5];
                  var yB = b.transform[5];
                  if (Math.abs(yA - yB) > 3) {
                    return yB - yA; // Linha de cima primeiro
                  }
                  return a.transform[4] - b.transform[4]; // Esquerda para a direita
                });

                var lines = [];
                var currentLineItems = [];
                var lastY = null;

                for (var k = 0; k < items.length; k++) {
                  var item = items[k];
                  var y = item.transform[5];
                  if (lastY === null || Math.abs(y - lastY) > 3) {
                    if (currentLineItems.length > 0) {
                      lines.push(currentLineItems.map(function(it) { return it.str; }).join(' ').trim());
                    }
                    currentLineItems = [item];
                    lastY = y;
                  } else {
                    currentLineItems.push(item);
                  }
                }
                if (currentLineItems.length > 0) {
                  lines.push(currentLineItems.map(function(it) { return it.str; }).join(' ').trim());
                }

                return lines.filter(Boolean).join('\n');
              });
            }));
          }
          Promise.all(promises).then(function(pagesText) {
            resolve(pagesText.filter(Boolean).join('\n\n'));
          });
        }).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  readAsText: function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  },

  cleanFilename: function(filename) {
    return (filename || '').replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();
  },

  cleanTitle: function(raw) {
    if (!raw) return '';
    return raw
      .replace(/^(?:[0-9]{1,3}[\s.\-\)]+|(?:faixa|track|m[úu]sica|ponto|nº?)\s*[0-9]{1,3}[:.\-\s]*)/i, '')
      .replace(/^[\s.\-_=•*#~|]+|[\s.\-_=•*#~|]+$/g, '')
      .trim();
  },

  isMusicKey: function(str) {
    if (!str) return false;
    return /^[A-G][#b]?m?$/i.test(str.trim());
  },

  extractTrackNumber: function(line) {
    if (!line) return null;
    var m = line.match(/^(?:([0-9]{1,3})[\s.\-\)]+|(?:faixa|track|m[úu]sica|ponto|nº?)\s*([0-9]{1,3}))/i);
    if (m) return parseInt(m[1] || m[2], 10);
    return null;
  },

  isRepetitionMarker: function(line) {
    if (!line) return false;
    return /^\s*\(?\s*(?:[0-9]\s*x|bis|coro|refr[ãa]o|estribilho|repete|final|intro|solo|2\s*vezes)\s*\)?\s*$/i.test(line);
  },

  normalizeRawInputText: function(str) {
    if (!str) return '';
    return str
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .replace(/\t/g, '    ');
  },

  splitMultipleSongs: function(text, filename) {
    text = this.normalizeRawInputText(text);
    if (!text || !text.trim()) {
      return [this.extractMetadata(text, filename)];
    }

    var lines = text.split('\n');
    var self = this;

    // 1. Escaneamento global: identificar se o documento usa numeração sequencial
    var numberedLines = [];
    var separatorIndices = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (/^[-=*_~]{3,}$/.test(line)) {
        separatorIndices.push(i);
        continue;
      }

      var num = this.extractTrackNumber(line);
      if (num !== null) {
        numberedLines.push({ index: i, trackNum: num, line: line });
      }
    }

    var songBlocks = [];

    // PADRÃO 1: Se o documento tiver numeração sequencial (ex: 01., 02., 03. ou 1 -, 2 -)
    // Uma música começa exatamente no número e só termina quando o próximo número for encontrado.
    if (numberedLines.length >= 1) {
      for (var n = 0; n < numberedLines.length; n++) {
        var startIdx = numberedLines[n].index;
        var endIdx = (n + 1 < numberedLines.length) ? numberedLines[n + 1].index : lines.length;
        var blockLines = lines.slice(startIdx, endIdx);
        var blockText = blockLines.join('\n').trim();
        if (blockText) songBlocks.push(blockText);
      }
      return songBlocks.map(function(bText, idx) {
        var meta = self.extractMetadata(bText, filename);
        if (meta.trackNumber === null) meta.trackNumber = idx + 1;
        return meta;
      });
    }

    // PADRÃO 2: Separadores explícitos (---, ===, ***)
    if (separatorIndices.length >= 1) {
      var lastIdx = 0;
      for (var s = 0; s < separatorIndices.length; s++) {
        var sepIdx = separatorIndices[s];
        var part = lines.slice(lastIdx, sepIdx).join('\n').trim();
        if (part) songBlocks.push(part);
        lastIdx = sepIdx + 1;
      }
      var lastPart = lines.slice(lastIdx).join('\n').trim();
      if (lastPart) songBlocks.push(lastPart);

      if (songBlocks.length > 1) {
        return songBlocks.map(function(bText, idx) {
          var meta = self.extractMetadata(bText, filename);
          if (meta.trackNumber === null) meta.trackNumber = idx + 1;
          return meta;
        });
      }
    }

    // PADRÃO 3: Múltiplas quebras de linha (3 ou mais \n)
    var rawBlocks = text.split(/\n\s*\n\s*\n+/);
    if (rawBlocks.length > 1) {
      var validRaw = rawBlocks.map(function(b) { return b.trim(); }).filter(Boolean);
      if (validRaw.length > 1) {
        return validRaw.map(function(bText, idx) {
          var meta = self.extractMetadata(bText, filename);
          if (meta.trackNumber === null) meta.trackNumber = idx + 1;
          return meta;
        });
      }
    }

    // PADRÃO 4: Quebras duplas (\n\n) com heurística refinada de títulos
    var altBlocks = text.split(/\n\s*\n/);
    var reconstructed = [];
    var currentSong = [];

    for (var j = 0; j < altBlocks.length; j++) {
      var b = altBlocks[j].trim();
      if (!b) continue;

      var bLines = b.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var firstLine = bLines[0] || '';

      var isTitle = !this.isChordLine(firstLine) &&
                    !this.isRepetitionMarker(firstLine) &&
                    firstLine.length <= 60 &&
                    !/[,;.…]$/.test(firstLine) &&
                    (
                      /^(?:[A-ZÀ-Ú0-9\s.\-_']+)$/.test(firstLine) ||
                      /\(([A-G][#b]?m?)\)$/i.test(firstLine) ||
                      /^(?:Tom|Key|Tonalidade|Toque|Ritmo|Autor|Compositor):/i.test(bLines[1] || '')
                    );

      if (currentSong.length > 0 && isTitle) {
        reconstructed.push(currentSong.join('\n\n'));
        currentSong = [b];
      } else {
        currentSong.push(b);
      }
    }

    if (currentSong.length > 0) reconstructed.push(currentSong.join('\n\n'));

    if (reconstructed.length > 1) {
      return reconstructed.map(function(bText, idx) {
        var meta = self.extractMetadata(bText, filename);
        if (meta.trackNumber === null) meta.trackNumber = idx + 1;
        return meta;
      });
    }

    var singleMeta = this.extractMetadata(text, filename);
    if (singleMeta.trackNumber === null) singleMeta.trackNumber = 1;
    return [singleMeta];
  },

  isLikelySongTitle: function(line) {
    if (!line || line.length > 80) return false;
    if (this.isChordLine(line)) return false;

    var hasTrackNumber = /^(?:[0-9]{1,3}[\s.\-\)]+|(?:faixa|track|m[úu]sica|nº?)\s*[0-9]{1,3})/i.test(line);
    var isAllCaps = (line === line.toUpperCase()) && /[A-ZÀ-Ú]/.test(line) && line.length >= 3;
    var hasKeyParenthesis = /\(([A-G][#b]?m?)\)$/i.test(line);

    return hasTrackNumber || isAllCaps || hasKeyParenthesis;
  },

  extractMetadata: function(text, filename) {
    var lines = text.split(/\r?\n/).map(function(l) { return l.trim(); });
    var title = '';
    var key = '';
    var artist = '';
    var composer = '';
    var rhythm = '';
    var tag = '';
    var youtubeUrl = '';
    var youtubeId = '';
    var originalKey = '';
    var contentLines = [];

    var lineIndex = 0;

    while (lineIndex < lines.length && !lines[lineIndex]) {
      lineIndex++;
    }

    var trackNumber = null;

    var KNOWN_RHYTHMS = [
      'SAMBA DE CABOCLO', 'SAMBA CABOCLO', 'CABOCLO',
      'IJEXA RAPIDO', 'IJEXÁ RÁPIDO', 'IJEXA', 'IJEXÁ',
      'BARRAVENTO', 'CONGO DE OURO', 'CONGO', 'ANGOLA', 'NAGO', 'NAGÔ',
      'MUZENZA', 'CABULA', 'BRAVUM', 'AVAMUNHA', 'AFOXE', 'AFOXÉ',
      'MARACATU', 'SAMBA', 'PAGODE', 'PARTIDO ALTO', 'CHORO', 'BAIAO', 'BAIÃO',
      'XOTE', 'FORRO', 'FORRÓ', 'VALSA', 'POP', 'ROCK', 'REGGAE', 'AXE', 'AXÉ',
      'SERESTA', 'BOLERO', 'SAMBA-ENREDO', 'TOADA', 'CURURU', 'CATERETE', 'GUARANIA'
    ];

    if (lineIndex < lines.length) {
      var rawTitleLine = lines[lineIndex];

      trackNumber = this.extractTrackNumber(rawTitleLine);

      // 1. Detectar TOQUE : / RITMO : no meio da linha do título
      var inlineToqueMatch = rawTitleLine.match(/(?:TOQUE|RITMO|BATIDA)\s*[:=-]\s*([^\n\r]+)/i);
      if (inlineToqueMatch) {
        var rawToquePart = inlineToqueMatch[1].replace(/[*_~]+/g, '').trim();
        var matchedRhythm = '';
        for (var ri = 0; ri < KNOWN_RHYTHMS.length; ri++) {
          var rName = KNOWN_RHYTHMS[ri];
          if (rawToquePart.toUpperCase().indexOf(rName) === 0) {
            matchedRhythm = rName;
            var restOfToque = rawToquePart.substring(rName.length).trim();
            if (restOfToque) {
              contentLines.push(restOfToque);
            }
            break;
          }
        }
        rhythm = matchedRhythm || rawToquePart.split(/[\n\r]/)[0].substring(0, 30).trim();
        rawTitleLine = rawTitleLine.replace(/(?:TOQUE|RITMO|BATIDA)\s*[:=-]\s*[^\n\r]+/i, '').trim();
      }

      // 2. Detectar ** ( SAMBA CABOCLO ) no título
      var starToqueMatch = rawTitleLine.match(/:\s*\*{1,2}\s*\(\s*([^)]+)\s*\)/i);
      if (starToqueMatch) {
        if (!rhythm) rhythm = starToqueMatch[1].trim();
        rawTitleLine = rawTitleLine.replace(/:\s*\*{1,2}\s*\(\s*[^)]+\s*\)/i, '').trim();
      }

      // 3. Checar se há chave musical ou tag/falange entre parênteses
      var parenMatch = rawTitleLine.match(/\(([^)]+)\)$/);
      if (parenMatch) {
        var inside = parenMatch[1].trim();
        if (this.isMusicKey(inside)) {
          key = inside.toUpperCase();
          rawTitleLine = rawTitleLine.replace(/\(([^)]+)\)$/, '').trim();
        } else {
          tag = inside;
        }
      }

      title = this.cleanTitle(rawTitleLine);

      // 4. Se a linha do título continuou com texto gigante e sem quebra de linha:
      if (title.length > 55 && !contentLines.length) {
        var firstParenEnd = title.indexOf(')');
        if (firstParenEnd !== -1 && firstParenEnd < 45) {
          var extractedLyrics = title.substring(firstParenEnd + 1).trim();
          title = title.substring(0, firstParenEnd + 1).trim();
          if (extractedLyrics) contentLines.push(extractedLyrics);
        }
      }

      lineIndex++;
    }

    if (trackNumber === null && filename) {
      var fileTrackMatch = (filename || '').match(/^(\d{1,3})[\s._-]/);
      if (fileTrackMatch) trackNumber = parseInt(fileTrackMatch[1], 10);
    }

    // Processar cabeçalhos de metadados logo abaixo do título
    for (var checkCount = 0; checkCount < 6 && lineIndex < lines.length; checkCount++) {
      var headerLine = lines[lineIndex];
      if (!headerLine) { lineIndex++; continue; }

      var keyRegex = /^(?:tom|tom\s*de\s*m[úu]sica|key|tonalidade)\s*[:=-]\s*([A-G][#b]?m?)/i;
      var artistRegex = /^(?:int[ée]rprete|cantor|cantora|artista|gravado\s*por)\s*[:=-]\s*(.+)/i;
      var composerRegex = /^(?:compositor|autoria|autor|composição|compositores)\s*[:=-]\s*(.+)/i;
      var rhythmRegex = /^(?:toque|ritmo|andamento|estilo|batida)\s*[:=-]\s*(.+)/i;
      var urlRegex = /^(?:link|v[íi]deo|youtube|áudio|audio|url)?\s*[:=-]?\s*(https?:\/\/[^\s]+)/i;
      var keyParenRegex = /^\(([A-G][#b]?m?)\)$/i;

      var keyMatch = headerLine.match(keyRegex);
      var artistMatch = headerLine.match(artistRegex);
      var composerMatch = headerLine.match(composerRegex);
      var rhythmMatch = headerLine.match(rhythmRegex);
      var urlMatch = headerLine.match(urlRegex);
      var keyParenMatch = headerLine.match(keyParenRegex);

      if (rhythmMatch) {
        rhythm = rhythmMatch[1].trim();
        lineIndex++;
      } else if (urlMatch) {
        youtubeUrl = urlMatch[1].trim();
        lineIndex++;
      } else if (keyMatch) {
        if (!key) key = keyMatch[1].toUpperCase();
        lineIndex++;
      } else if (keyParenMatch) {
        if (!key) key = keyParenMatch[1].toUpperCase();
        lineIndex++;
      } else if (artistMatch) {
        artist = artistMatch[1].trim();
        lineIndex++;
      } else if (composerMatch) {
        composer = composerMatch[1].trim();
        lineIndex++;
      } else if (!composer && (headerLine.indexOf('/') !== -1 || headerLine.indexOf(' - ') !== -1 || headerLine.indexOf(' e ') !== -1) && headerLine.length < 60) {
        if (headerLine.indexOf(' - ') !== -1) {
          var parts = headerLine.split(' - ');
          artist = parts[0].trim();
          composer = parts.slice(1).join(' - ').trim();
        } else {
          composer = headerLine.trim();
        }
        lineIndex++;
      } else {
        break;
      }
    }

    for (; lineIndex < lines.length; lineIndex++) {
      var line = lines[lineIndex];
      if (!line) { contentLines.push(''); continue; }

      var inlineKeyMatch = line.match(/^(?:tom|tonalidade|key)\s*[:=-]\s*([A-G][#b]?m?)/i);
      var inlineOrigKeyMatch = line.match(/^(?:tom\s*original|original\s*key)\s*[:=-]\s*([A-G][#b]?m?)/i);
      var inlineRhythmMatch = line.match(/^(?:toque|ritmo|andamento|batida)\s*[:=-]\s*(.+)/i);
      var inlineYtMatch = line.match(/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/i);
      var genericUrlMatch = line.match(/(https?:\/\/[^\s]+)/i);

      if (inlineRhythmMatch && !rhythm) {
        rhythm = inlineRhythmMatch[1].trim();
        continue;
      } else if (inlineOrigKeyMatch) {
        originalKey = inlineOrigKeyMatch[1].toUpperCase();
        continue;
      } else if (inlineKeyMatch && !key) {
        key = inlineKeyMatch[1].toUpperCase();
        continue;
      } else if (inlineYtMatch) {
        if (!youtubeUrl) youtubeUrl = inlineYtMatch[1];
        continue;
      } else if (genericUrlMatch) {
        if (!youtubeUrl) youtubeUrl = genericUrlMatch[1];
        continue;
      }
      contentLines.push(line);
    }

    if (!title) {
      title = this.cleanFilename(filename);
    }

    var fullContent = contentLines.join('\n').trim();

    // Auto-detectar Tom Original por harmonia/cifras se não informado expressamente
    if (!originalKey) {
      originalKey = this.detectOriginalKey(fullContent) || key;
    }

    if (youtubeUrl) {
      youtubeId = this.extractYouTubeId(youtubeUrl);
    }

    return {
      title: title,
      trackNumber: trackNumber,
      key: key,
      originalKey: originalKey,
      rhythm: rhythm,
      artist: artist,
      composer: composer,
      youtubeUrl: youtubeUrl,
      youtubeId: youtubeId,
      content: fullContent,
      originalFileName: filename
    };
  },

  isChordLine: function(line) {
    var chordPattern = /^(\s*([A-G][#b]?(m|maj|min|aug|dim|sus|add|[0-9])*)(\/[A-G][#b]?)?\s*)+$/;
    return chordPattern.test(line);
  },

  /**
   * Analisa as cifras da música para identificar o tom harmônico com precisão Teórica e Cadencial (V-I, 7M/7+).
   */
  detectOriginalKey: function(content) {
    if (!content) return '';
    var lines = content.split('\n');
    var chordCounts = {};
    var firstChord = '';
    var lastChord = '';
    var dominantResolutions = {};
    var allChords = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (this.isChordLine(line)) {
        var matches = line.match(/[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|[0-9])*/g);
        if (matches) {
          for (var m = 0; m < matches.length; m++) {
            var raw = matches[m];
            var keyMatch = raw.match(/^([A-G][#b]?m?)/i);
            if (keyMatch) {
              var keyName = keyMatch[1];
              if (keyName.length > 1 && keyName.charAt(keyName.length - 1).toLowerCase() === 'm') {
                keyName = keyName.substring(0, keyName.length - 1).toUpperCase() + 'm';
              } else {
                keyName = keyName.toUpperCase();
              }
              if (/maj|7M|7\+/i.test(raw)) {
                keyName = keyName.replace(/m$/, '');
              }
              if (!firstChord) firstChord = keyName;
              lastChord = keyName;
              chordCounts[keyName] = (chordCounts[keyName] || 0) + 1;
              allChords.push({ raw: raw, root: keyName });
            }
          }
        }
      }
    }

    var dominantToTonicMap = {
      'E7': ['A', 'Am'],
      'A7': ['D', 'Dm'],
      'D7': ['G', 'Gm'],
      'G7': ['C', 'Cm'],
      'C7': ['F', 'Fm'],
      'F7': ['Bb', 'Bbm'],
      'B7': ['E', 'Em'],
      'F#7': ['B', 'Bm'],
      'C#7': ['F#', 'F#m'],
      'G#7': ['C#', 'C#m']
    };

    for (var c = 0; c < allChords.length - 1; c++) {
      var curr = allChords[c].raw;
      var next = allChords[c + 1].root;
      if (dominantToTonicMap[curr]) {
        var targets = dominantToTonicMap[curr];
        if (targets.indexOf(next) !== -1) {
          dominantResolutions[next] = (dominantResolutions[next] || 0) + 5;
        }
      }

      if (/7\+|7M|maj7/i.test(curr)) {
        var rootTonic = allChords[c].root.replace(/m$/, '');
        chordCounts[rootTonic] = (chordCounts[rootTonic] || 0) + 6;
      }
    }

    var bestKey = '';
    var maxWeight = -1;
    for (var k in chordCounts) {
      var weight = chordCounts[k];
      if (k === lastChord) weight += 5;
      if (k === firstChord) weight += 3;
      if (dominantResolutions[k]) weight += dominantResolutions[k];

      if (weight > maxWeight) {
        maxWeight = weight;
        bestKey = k;
      }
    }
    return bestKey || 'A';
  },

  /**
   * Extrai o ID de 11 caracteres de URLs do YouTube.
   */
  extractYouTubeId: function(url) {
    if (!url) return '';
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : '';
  },

  /**
   * Gera a URL de busca no YouTube para o título e artista.
   */
  getYouTubeSearchUrl: function(title, artist) {
    var query = (artist ? artist + ' - ' : '') + title + ' tom original cifra';
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  }
};

window.TextParser = TextParser;

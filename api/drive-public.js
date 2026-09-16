const https = require('https');
const http = require('http');
const { URL } = require('url');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function fetchUrl(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Muitos redirecionamentos'));
    }

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'http:' ? http : https;

    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    }, (res) => {
      // Tratar redirecionamento (301, 302, 303, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return resolve(fetchUrl(redirectUrl, maxRedirects - 1));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: Buffer.concat(chunks)
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout de conexão'));
    });
  });
}

function parsePublicDriveFolderHtml(htmlStr) {
  const files = [];
  const seenIds = new Set();

  // 1. Procurar blocos JSON AF_initDataCallback
  const afRegex = /AF_initDataCallback\s*\(\s*\{[\s\S]*?data\s*:\s*([\s\S]*?)\}\s*\)\s*;/g;
  let match;

  while ((match = afRegex.exec(htmlStr)) !== null) {
    try {
      let rawJson = match[1].trim();
      // Remove trailing vírgulas ou parênteses se houver
      if (rawJson.endsWith('}')) rawJson = rawJson.substring(0, rawJson.length - 1);
      const parsed = JSON.parse(rawJson);
      extractFilesFromDeepArray(parsed, files, seenIds);
    } catch (e) {
      // Continua para próxima tentativa
    }
  }

  // 2. Fallback regex para capturar pares ID + Nome de arquivo
  if (files.length === 0) {
    // Procura padrões de arquivos como [ "FILE_ID", "NOME.ext", "mimeType" ]
    const fileRowRegex = /\[\s*"([a-zA-Z0-9_-]{25,50})"\s*,\s*"([^"]+\.(docx?|pdf|txt|mp3|m4a|wav|aac|ogg|flac))"/gi;
    let rMatch;
    while ((rMatch = fileRowRegex.exec(htmlStr)) !== null) {
      const fId = rMatch[1];
      const fName = rMatch[2];
      if (!seenIds.has(fId)) {
        seenIds.add(fId);
        files.push({
          id: fId,
          name: fName,
          mimeType: getMimeTypeFromExt(fName),
          downloadUrl: `https://drive.google.com/uc?export=download&id=${fId}`
        });
      }
    }
  }

  return files;
}

function extractFilesFromDeepArray(node, files, seenIds) {
  if (!node) return;
  if (Array.isArray(node)) {
    // Verifica se este nó parece um descritor de arquivo: [id, name, mimeType, ...]
    if (typeof node[0] === 'string' && /^[a-zA-Z0-9_-]{25,50}$/.test(node[0]) &&
        typeof node[1] === 'string' && node[1].length > 1 && node[1].length < 250) {
      const id = node[0];
      const name = node[1];
      const mime = typeof node[2] === 'string' ? node[2] : getMimeTypeFromExt(name);

      if (!seenIds.has(id) && isMusicOrLyricsFile(name, mime)) {
        seenIds.add(id);
        files.push({
          id: id,
          name: name,
          mimeType: mime,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`
        });
      }
    }
    for (let i = 0; i < node.length; i++) {
      extractFilesFromDeepArray(node[i], files, seenIds);
    }
  } else if (typeof node === 'object') {
    for (let k in node) {
      extractFilesFromDeepArray(node[k], files, seenIds);
    }
  }
}

function getMimeTypeFromExt(name) {
  const ext = (name || '').toLowerCase().split('.').pop();
  switch (ext) {
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    default: return 'application/octet-stream';
  }
}

function isMusicOrLyricsFile(name, mime) {
  const lower = (name || '').toLowerCase();
  const validExts = ['.docx', '.doc', '.pdf', '.txt', '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac', '.opus', '.cifra'];
  const hasExt = validExts.some(ext => lower.endsWith(ext));
  const isDoc = mime === 'application/vnd.google-apps.document';
  return hasExt || isDoc;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = parsedUrl.searchParams.get('action') || 'listFolder';
  const folderId = parsedUrl.searchParams.get('folderId');
  const fileId = parsedUrl.searchParams.get('fileId');
  const proxyUrl = parsedUrl.searchParams.get('proxy');

  try {
    // 1. Proxy direto de download de arquivo (evita bloqueios de CORS do browser)
    if (proxyUrl) {
      const response = await fetchUrl(proxyUrl);
      res.statusCode = response.statusCode || 200;
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      res.end(response.data);
      return;
    }

    // 2. Verificação ou Download direto por fileId ou docId
    if (fileId) {
      const isDoc = parsedUrl.searchParams.get('isDoc') === 'true';
      const isCheck = parsedUrl.searchParams.get('check') === 'true';
      const target = isDoc
        ? `https://docs.google.com/document/d/${fileId}/export?format=txt`
        : `https://drive.google.com/uc?export=download&id=${fileId}`;

      const response = await fetchUrl(target);

      // Tratar documento não encontrado ou privado
      if (response.statusCode === 404) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: isDoc
            ? 'Documento não encontrado no Google Docs (Erro 404). Verifique se o link está completo e correto.'
            : 'Arquivo não encontrado no Google Drive (Erro 404).'
        }));
        return;
      }

      const bodyStr = response.data.toString('utf8');
      const isHtmlLogin = bodyStr.includes('accounts.google.com') || bodyStr.includes('ServiceLogin') || bodyStr.includes('Sign in - Google Accounts');

      if (response.statusCode === 401 || response.statusCode === 403 || isHtmlLogin) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: 'Acesso restrito. O arquivo/documento é privado. No Google Drive/Docs, clique em "Compartilhar" e selecione "Qualquer pessoa com o link pode ver".'
        }));
        return;
      }

      // Se for apenas verificação para listar no modal
      if (isCheck) {
        let docTitle = isDoc ? 'Documento Google Docs' : 'Arquivo Google Drive';
        if (isDoc) {
          const lines = bodyStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          for (let i = 0; i < Math.min(lines.length, 5); i++) {
            let candidate = lines[i].replace(/^[^\w\s(]+/, '').trim();
            if (candidate && !candidate.toLowerCase().startsWith('última atualização') && candidate.length > 2 && candidate.length < 80) {
              docTitle = candidate;
              break;
            }
          }
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          success: true,
          files: [{
            id: fileId,
            name: isDoc ? (docTitle + '.txt') : docTitle,
            mimeType: isDoc ? 'application/vnd.google-apps.document' : 'application/octet-stream',
            size: response.data.length,
            folderName: 'Google Drive'
          }]
        }));
        return;
      }

      res.statusCode = response.statusCode || 200;
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      res.end(response.data);
      return;
    }

    // 3. Listagem de arquivos de pasta pública
    if (folderId) {
      const driveUrl = `https://drive.google.com/drive/folders/${folderId}`;
      const pageRes = await fetchUrl(driveUrl);

      if (pageRes.statusCode === 404) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: 'Pasta não encontrada no Google Drive (Erro 404). Verifique se o link da pasta está correto.'
        }));
        return;
      }

      const htmlStr = pageRes.data.toString('utf8');
      const isHtmlLogin = htmlStr.includes('accounts.google.com') || htmlStr.includes('ServiceLogin');

      if (pageRes.statusCode === 401 || pageRes.statusCode === 403 || isHtmlLogin) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: 'Pasta privada. No Google Drive, clique com botão direito na pasta > Compartilhar > e mude para "Qualquer pessoa com o link pode ver".'
        }));
        return;
      }

      const files = parsePublicDriveFolderHtml(htmlStr);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      res.end(JSON.stringify({
        success: true,
        folderId: folderId,
        count: files.length,
        files: files
      }));
      return;
    }

    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'Parâmetro folderId, fileId ou proxy é obrigatório.'
    }));

  } catch (err) {
    console.error('Erro na rota /api/drive-public:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'Falha ao processar link público do Google Drive.',
      details: err.message
    }));
  }
};

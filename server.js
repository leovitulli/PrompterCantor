const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

let PORT = parseInt(process.env.PORT, 10) || 3333;
const PUBLIC_DIR = __dirname;
const MP_DEFAULT_TOKEN = 'APP_USR-1840710581391633-090520-875d1432839c41e0eb371eef24ca36a5-76594620';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4'
};

function sendJsonResponse(res, statusCode, data) {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(jsonStr);
}

function handleMercadoPagoRoutes(req, res, reqPath) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key'
    });
    res.end();
    return true;
  }

  // Health check
  if (req.method === 'GET' && reqPath === '/api/mp/health') {
    sendJsonResponse(res, 200, { status: 'ok', service: 'CantaAí MP Banking Gateway Proxy' });
    return true;
  }

  // Status check: /api/mp/payment-status/:id
  if (req.method === 'GET' && reqPath.startsWith('/api/mp/payment-status/')) {
    const paymentId = reqPath.replace('/api/mp/payment-status/', '').trim();
    if (!paymentId) {
      sendJsonResponse(res, 400, { success: false, error: 'ID do pagamento não informado.' });
      return true;
    }

    const token = process.env.MP_ACCESS_TOKEN || MP_DEFAULT_TOKEN;
    const mpReq = https.request({
      hostname: 'api.mercadopago.com',
      path: '/v1/payments/' + encodeURIComponent(paymentId),
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'CantaAi-SaaS-Gateway/1.1'
      }
    }, (mpRes) => {
      let body = '';
      mpRes.on('data', chunk => body += chunk);
      mpRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            sendJsonResponse(res, 200, {
              success: true,
              paymentId: parsed.id,
              status: parsed.status,
              statusDetail: parsed.status_detail,
              dateApproved: parsed.date_approved,
              dateCreated: parsed.date_created,
              amount: parsed.transaction_amount
            });
          } else {
            sendJsonResponse(res, mpRes.statusCode, {
              success: false,
              error: parsed.message || 'Erro ao consultar status no Mercado Pago',
              details: parsed
            });
          }
        } catch (e) {
          sendJsonResponse(res, 500, { success: false, error: 'Erro ao interpretar resposta do banco.' });
        }
      });
    });

    mpReq.on('error', (err) => {
      sendJsonResponse(res, 502, { success: false, error: 'Falha de conexão com a API do Mercado Pago: ' + err.message });
    });
    mpReq.end();
    return true;
  }

  // Create payment: /api/mp/create-payment
  if (req.method === 'POST' && reqPath === '/api/mp/create-payment') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const token = process.env.MP_ACCESS_TOKEN || payload.accessToken || MP_DEFAULT_TOKEN;

        const isAnnual = payload.plan === 'annual' || payload.plan === '💎 PRO ANUAL';
        let amount = Number(payload.amount);
        if (!amount || isNaN(amount) || amount <= 0) {
          amount = isAnnual ? 299.00 : 39.90;
        }

        const email = (payload.email || '').trim().toLowerCase();
        const rawName = (payload.name || 'Cantor').trim();
        const nameParts = rawName.split(/\s+/);
        const firstName = nameParts[0] || 'Cantor';
        const lastName = nameParts.slice(1).join(' ') || 'Assinante';
        const cleanCpf = (payload.cpf || '00000000000').replace(/\D/g, '');

        let mpPayload = {};
        const method = payload.method || 'pix';

        if (method === 'pix') {
          mpPayload = {
            transaction_amount: amount,
            description: 'Assinatura CantaAí PRO (' + (isAnnual ? 'Plano Anual' : 'Plano Mensal') + ')',
            payment_method_id: 'pix',
            payer: {
              email: email || 'contato@cantaai.com.br',
              first_name: firstName,
              last_name: lastName,
              identification: {
                type: 'CPF',
                number: cleanCpf.length === 11 ? cleanCpf : '19119119100'
              }
            }
          };
        } else if (method === 'credit_card' || method === 'mercadopago') {
          mpPayload = {
            transaction_amount: amount,
            token: payload.cardToken,
            description: 'Assinatura CantaAí PRO (' + (isAnnual ? 'Plano Anual' : 'Plano Mensal') + ')',
            installments: Number(payload.installments) || 1,
            payment_method_id: payload.paymentMethodId || 'visa',
            issuer_id: payload.issuerId,
            payer: {
              email: email || 'contato@cantaai.com.br',
              identification: {
                type: 'CPF',
                number: cleanCpf.length === 11 ? cleanCpf : '19119119100'
              }
            }
          };
        }

        const idempotencyKey = 'cantaai-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        const mpPostReq = https.request({
          hostname: 'api.mercadopago.com',
          path: '/v1/payments',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
            'User-Agent': 'CantaAi-SaaS-Gateway/1.1'
          }
        }, (mpRes) => {
          let mpBody = '';
          mpRes.on('data', chunk => mpBody += chunk);
          mpRes.on('end', () => {
            try {
              const resData = JSON.parse(mpBody);
              if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
                const txData = resData.point_of_interaction && resData.point_of_interaction.transaction_data;
                sendJsonResponse(res, 201, {
                  success: true,
                  paymentId: resData.id,
                  status: resData.status,
                  statusDetail: resData.status_detail,
                  amount: resData.transaction_amount,
                  qrCode: txData ? txData.qr_code : null,
                  qrCodeBase64: txData ? txData.qr_code_base64 : null,
                  ticketUrl: txData ? txData.ticket_url : null,
                  dateCreated: resData.date_created
                });
              } else {
                sendJsonResponse(res, mpRes.statusCode, {
                  success: false,
                  error: resData.message || 'Erro ao processar transação no Mercado Pago.',
                  cause: resData.cause || []
                });
              }
            } catch (e) {
              sendJsonResponse(res, 500, { success: false, error: 'Erro ao interpretar resposta do gateway.' });
            }
          });
        });

        mpPostReq.on('error', (err) => {
          sendJsonResponse(res, 502, { success: false, error: 'Erro de conexão com o gateway: ' + err.message });
        });

        mpPostReq.write(JSON.stringify(mpPayload));
        mpPostReq.end();

      } catch (err) {
        sendJsonResponse(res, 400, { success: false, error: 'Payload JSON inválido: ' + err.message });
      }
    });
    return true;
  }

  return false;
}

function startServer(portToUse) {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];

    // Interceptar rotas da API do Mercado Pago
    if (reqPath.startsWith('/api/mp/')) {
      if (handleMercadoPagoRoutes(req, res, reqPath)) return;
    }

    // Rota oficial: "/" abre a página de vendas nova; o app continua em /index.html (ou /app)
    if (reqPath === '/' || !reqPath) reqPath = '/landing_v3.html';
    if (reqPath === '/app' || reqPath === '/app/') reqPath = '/index.html';
    
    const filePath = path.join(PUBLIC_DIR, '.' + reqPath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404;
          res.end('File Not Found');
        } else {
          res.statusCode = 500;
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.statusCode = 200;
        res.end(data);
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(portToUse + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(portToUse, () => {
    console.log(`🚀 CantaAí HTTP Server running at http://localhost:${portToUse}`);
  });
}

startServer(PORT);

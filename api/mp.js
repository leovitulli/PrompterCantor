const https = require('https');
const { URL } = require('url');

const MAX_BODY_SIZE = 65536; // 64 KB
const COUPON_DISCOUNTS = {
  'PRO50': 0.50,
  'SAMBA30': 0.30
};

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.end(JSON.stringify(data));
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const reqPath = parsedUrl.pathname;

  if (req.method === 'GET' && reqPath === '/api/mp/health') {
    sendJson(res, 200, { status: 'ok', service: 'CantaAí MP Banking Gateway Proxy' });
    return;
  }

  if (req.method === 'GET' && reqPath.startsWith('/api/mp/payment-status/')) {
    const paymentId = reqPath.replace('/api/mp/payment-status/', '').trim();
    if (!paymentId || !/^[a-zA-Z0-9_-]{1,64}$/.test(paymentId)) {
      sendJson(res, 400, { success: false, error: 'ID do pagamento inválido.' });
      return;
    }

    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
      sendJson(res, 503, { success: false, error: 'MP_ACCESS_TOKEN não configurado no ambiente do servidor.' });
      return;
    }

    const mpReq = https.request({
      hostname: 'api.mercadopago.com',
      path: '/v1/payments/' + encodeURIComponent(paymentId),
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'CantaAi-SaaS-Gateway/1.2'
      }
    }, (mpRes) => {
      let body = '';
      mpRes.on('data', chunk => body += chunk);
      mpRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            sendJson(res, 200, {
              success: true,
              paymentId: parsed.id,
              status: parsed.status,
              statusDetail: parsed.status_detail,
              dateApproved: parsed.date_approved,
              dateCreated: parsed.date_created,
              amount: parsed.transaction_amount
            });
          } else {
            sendJson(res, mpRes.statusCode, {
              success: false,
              error: parsed.message || 'Erro ao consultar status no Mercado Pago'
            });
          }
        } catch (e) {
          sendJson(res, 500, { success: false, error: 'Erro ao interpretar resposta do Mercado Pago.' });
        }
      });
    });

    mpReq.on('error', (err) => {
      sendJson(res, 502, { success: false, error: 'Falha de conexão com Mercado Pago: ' + err.message });
    });
    mpReq.end();
    return;
  }

  if (req.method === 'POST' && reqPath === '/api/mp/create-payment') {
    let rawBody = '';
    let aborted = false;

    req.on('data', chunk => {
      if (aborted) return;
      rawBody += chunk;
      if (rawBody.length > MAX_BODY_SIZE) {
        aborted = true;
        sendJson(res, 413, { success: false, error: 'Payload excede o limite de 64 KB.' });
        req.destroy();
      }
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const payload = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody || '{}');
        const token = process.env.MP_ACCESS_TOKEN;
        if (!token) {
          sendJson(res, 503, { success: false, error: 'MP_ACCESS_TOKEN não configurado no ambiente do servidor.' });
          return;
        }

        const isAnnual = payload.plan === 'annual' || payload.plan === '💎 PRO ANUAL';
        const baseAmount = isAnnual ? 299.00 : 39.90;
        const couponCode = String(payload.coupon || '').trim().toUpperCase();
        const discountRate = COUPON_DISCOUNTS[couponCode] || 0;
        const amount = Number((baseAmount * (1 - discountRate)).toFixed(2));

        const email = (payload.email || '').trim().toLowerCase();
        const rawName = (payload.name || 'Cantor').trim();
        const nameParts = rawName.split(/\s+/);
        const firstName = nameParts[0] || 'Cantor';
        const lastName = nameParts.slice(1).join(' ') || 'Assinante';
        const cleanCpf = (payload.cpf || '').replace(/\D/g, '');

        const method = payload.method || 'pix';
        let mpPayload = {};

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
        } else {
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
            'User-Agent': 'CantaAi-SaaS-Gateway/1.2'
          }
        }, (mpRes) => {
          let mpBody = '';
          mpRes.on('data', chunk => mpBody += chunk);
          mpRes.on('end', () => {
            try {
              const resData = JSON.parse(mpBody);
              if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
                const txData = resData.point_of_interaction && resData.point_of_interaction.transaction_data;
                sendJson(res, 201, {
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
                sendJson(res, mpRes.statusCode, {
                  success: false,
                  error: resData.message || 'Pagamento recusado pela operadora.'
                });
              }
            } catch (err) {
              sendJson(res, 500, { success: false, error: 'Falha ao processar retorno do Mercado Pago.' });
            }
          });
        });

        mpPostReq.on('error', (err) => {
          sendJson(res, 502, { success: false, error: 'Erro de comunicação com Mercado Pago: ' + err.message });
        });
        mpPostReq.write(JSON.stringify(mpPayload));
        mpPostReq.end();
      } catch (e) {
        sendJson(res, 400, { success: false, error: 'JSON inválido na requisição.' });
      }
    });
    return;
  }

  sendJson(res, 404, { success: false, error: 'Rota não encontrada.' });
};


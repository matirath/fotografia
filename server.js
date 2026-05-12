const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const archiver = require('archiver');
const twilio = require('twilio');
require('dotenv').config();

let CLIENTES = [];
try {
  const configPath = path.join(__dirname, 'clientes-config.json');
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    CLIENTES = Array.isArray(configData.clientes) ? configData.clientes : [];
  }
} catch (err) {
  console.warn('No se pudo cargar clientes-config.json:', err.message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const PRIVATE_EXPERIENCE_PATHS = new Set([
  '/experiencias-comercial',
  '/experiencias-eventos',
  '/landing_comercial.html',
  '/landing_eventos.html'
]);

const EXPERIENCIAS_APPS_SCRIPT_URL = process.env.EXPERIENCIAS_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycby9ymEEfHKPm1j31YuEZKxhwCtgplRggoLR8lRteKUV8dge-oeV9J6DRbRr4dzrgyronQ/exec';
const EXPERIENCIAS_API_KEY = process.env.EXPERIENCIAS_API_KEY || '';
const LEAD_MODAL_APPS_SCRIPT_URL = process.env.LEAD_MODAL_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbztdsCYdzy_rPS7q2iEKYHFG4yFZm3VyPWEh6PgnZZNcAxHxC2iWd1xGBc1yNDChGaumA/exec';
const LEAD_MODAL_DEBUG = process.env.LEAD_MODAL_DEBUG === '1';
const LEAD_MODAL_PROVIDER = (process.env.LEAD_MODAL_PROVIDER || 'apps_script').toLowerCase();
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID || '';
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || '';
const TWILIO_WHATSAPP_TO_OVERRIDE = process.env.TWILIO_WHATSAPP_TO_OVERRIDE || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';
const EXPERIENCIAS_NOTIFY_WHATSAPP = (process.env.EXPERIENCIAS_NOTIFY_WHATSAPP || '1') === '1';

function maskWhatsapp(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function isLikelyHtml(raw) {
  return /<!doctype html|<html|<head|<body/i.test(String(raw || ''));
}

function normalizeLeadModalProxyResponse(proxyResponse) {
  const response = proxyResponse && typeof proxyResponse === 'object'
    ? proxyResponse
    : { ok: true, raw: String(proxyResponse || '') };

  if (response.ok === false) return response;

  if (typeof response.raw === 'string' && response.raw.trim()) {
    if (isLikelyHtml(response.raw)) {
      return {
        ok: false,
        error: 'Respuesta invalida desde backend remoto del modal',
        details: 'Se recibio HTML en lugar de JSON'
      };
    }
  }

  return {
    ...response,
    ok: true
  };
}

function toWhatsappAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('whatsapp:')) return raw;
  if (raw.startsWith('+')) return `whatsapp:${raw}`;

  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  return `whatsapp:+${digits}`;
}

function leadModalText(payload) {
  const name = String(payload.fullName || payload.nombre || '').trim() || 'Sin nombre';
  const whatsapp = String(payload.whatsapp || payload.telefono || '').trim() || 'Sin telefono';
  const eventType = String(payload.eventType || payload.tipoEvento || '').trim() || 'Sin tipo';
  const location = String(payload.location || '').trim() || 'Sin ubicacion';
  const source = String(payload.source || 'index-modal').trim();
  const submittedAt = String(payload.submittedAt || new Date().toISOString()).trim();

  return [
    'Nueva entrada desde modal de inicio',
    `Nombre: ${name}`,
    `WhatsApp: ${whatsapp}`,
    `Evento: ${eventType}`,
    `Ubicacion: ${location}`,
    `Origen: ${source}`,
    `Fecha: ${submittedAt}`
  ].join('\n');
}

function experienceSubmissionText(payload, proxyResponse) {
  const nombre = String(payload.nombre || '').trim() || 'Sin nombre';
  const instagram = String(payload.instagram || '').trim() || 'Sin Instagram';
  const whatsapp = String(payload.whatsapp || '').trim() || 'Sin WhatsApp';
  const tipoCliente = String(payload.tipo_cliente || '').trim() || 'Sin tipo';
  const frase = String(payload.frase_destacada || '').trim() || 'Sin frase destacada';
  const id = String((proxyResponse && proxyResponse.id) || '').trim() || 'Sin ID';

  return [
    'Nueva respuesta de testimonio',
    `ID: ${id}`,
    `Tipo: ${tipoCliente}`,
    `Nombre: ${nombre}`,
    `Instagram: ${instagram}`,
    `WhatsApp: ${whatsapp}`,
    `Frase: ${frase}`
  ].join('\n');
}

function createTwilioClient() {
  if (!TWILIO_ACCOUNT_SID) {
    throw new Error('Falta TWILIO_ACCOUNT_SID');
  }

  const hasApiKey = Boolean(TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET);
  const hasAuthToken = Boolean(TWILIO_AUTH_TOKEN);
  if (!hasApiKey && !hasAuthToken) {
    throw new Error('Configura TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET o TWILIO_AUTH_TOKEN');
  }

  return hasApiKey
    ? twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
    : twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function sendTwilioWhatsappText(text, toRaw) {
  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_WHATSAPP_FROM) {
    throw new Error('Configura TWILIO_MESSAGING_SERVICE_SID o TWILIO_WHATSAPP_FROM');
  }

  const to = toWhatsappAddress(toRaw || TWILIO_WHATSAPP_TO_OVERRIDE);
  if (!to) {
    throw new Error('No se pudo resolver el destinatario de WhatsApp');
  }

  const messageOptions = {
    to,
    body: text
  };

  if (TWILIO_MESSAGING_SERVICE_SID) {
    messageOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else {
    const from = toWhatsappAddress(TWILIO_WHATSAPP_FROM);
    if (!from) {
      throw new Error('TWILIO_WHATSAPP_FROM invalido');
    }
    messageOptions.from = from;
  }

  const client = createTwilioClient();
  const result = await client.messages.create(messageOptions);
  return {
    ok: true,
    provider: 'twilio',
    messageSid: result.sid,
    status: result.status,
    to
  };
}

async function sendExperienceViaTwilio(payload, proxyResponse) {
  const text = experienceSubmissionText(payload, proxyResponse);
  return sendTwilioWhatsappText(text, TWILIO_WHATSAPP_TO_OVERRIDE || payload.whatsapp || '');
}

async function sendLeadModalViaTwilio(payload) {
  const toRaw = TWILIO_WHATSAPP_TO_OVERRIDE || payload.whatsappE164 || payload.whatsapp || payload.telefono || '';
  return sendTwilioWhatsappText(leadModalText(payload), toRaw);
}

function isSafeRelativePath(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_\-/]*$/.test(value) && !value.includes('..');
}

function listImagesInDirectory(absDirPath, requestPathPrefix, startsWithFilter) {
  const entries = fs.readdirSync(absDirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => {
      const ext = path.extname(fileName).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return false;
      if (!startsWithFilter) return true;
      return fileName.toLowerCase().startsWith(startsWithFilter.toLowerCase());
    })
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

  return files.map((fileName) => ({
    src: path.posix.join(requestPathPrefix, fileName),
    alt: path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, ' ').trim(),
  }));
}

function parseRequestBody(body) {
  const raw = String(body || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_jsonErr) {
    const params = new URLSearchParams(raw);
    const parsed = {};
    for (const [key, value] of params.entries()) {
      parsed[key] = value;
    }
    if (Object.keys(parsed).length > 0) return parsed;
    throw new Error('Formato de payload invalido');
  }
}

function requestJsonWithRedirects(targetUrl, body, redirectsLeft = 5, method = 'POST', contentType = 'text/plain;charset=utf-8') {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const isHttps = target.protocol === 'https:';
    const requestClient = isHttps ? https : http;
    const payloadBody = method === 'GET' ? '' : body;
    const requestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: method,
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(payloadBody)
      }
    };

    if (method === 'GET') {
      delete requestOptions.headers['Content-Type'];
    }

    const proxyReq = requestClient.request(requestOptions, (proxyRes) => {
      const status = proxyRes.statusCode || 0;
      const location = proxyRes.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        if (redirectsLeft <= 0) {
          reject(new Error('Demasiadas redirecciones en Apps Script'));
          return;
        }

        const nextUrl = new URL(location, target).toString();
        const nextMethod = [301, 302, 303].includes(status) ? 'GET' : method;
        proxyRes.resume();
        requestJsonWithRedirects(nextUrl, body, redirectsLeft - 1, nextMethod, contentType)
          .then(resolve)
          .catch(reject);
        return;
      }

      let responseBody = '';
      proxyRes.on('data', (chunk) => {
        responseBody += chunk.toString();
      });

      proxyRes.on('end', () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`Apps Script respondio con estado ${status}`));
          return;
        }

        if (!responseBody) {
          resolve({ ok: true });
          return;
        }

        try {
          const parsed = JSON.parse(responseBody);
          resolve(parsed);
        } catch (err) {
          resolve({ ok: true, raw: responseBody });
        }
      });
    });

    proxyReq.on('error', (err) => {
      reject(err);
    });

    if (payloadBody) {
      proxyReq.write(payloadBody);
    }
    proxyReq.end();
  });
}

function proxyExperienceToAppsScript(payload) {
  return new Promise((resolve, reject) => {
    if (!EXPERIENCIAS_APPS_SCRIPT_URL) {
      reject(new Error('EXPERIENCIAS_APPS_SCRIPT_URL no configurado'));
      return;
    }

    let target;
    try {
      target = new URL(EXPERIENCIAS_APPS_SCRIPT_URL);
    } catch (err) {
      reject(new Error('URL de Apps Script invalida'));
      return;
    }

    const body = JSON.stringify(payload);
    requestJsonWithRedirects(target.toString(), body, 5, 'POST', 'application/json')
      .then(resolve)
      .catch(reject);
  });
}

function proxyLeadModalToAppsScript(payload) {
  return new Promise((resolve, reject) => {
    if (!LEAD_MODAL_APPS_SCRIPT_URL) {
      reject(new Error('LEAD_MODAL_APPS_SCRIPT_URL no configurado'));
      return;
    }

    let target;
    try {
      target = new URL(LEAD_MODAL_APPS_SCRIPT_URL);
    } catch (err) {
      reject(new Error('URL de Apps Script de lead modal invalida'));
      return;
    }

    const body = JSON.stringify(payload);
    requestJsonWithRedirects(target.toString(), body)
      .then(resolve)
      .catch(reject);
  });
}

function logLeadModalDebug(message, data) {
  if (!LEAD_MODAL_DEBUG) return;
  const stamp = new Date().toISOString();
  const suffix = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[lead-modal][${stamp}] ${message}${suffix}`);
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  let pathname = parsed.pathname;

  if (pathname === '/experiencias-comercial') pathname = '/landing_comercial.html';
  if (pathname === '/experiencias-eventos') pathname = '/landing_eventos.html';

  if (pathname === '/api/gallery') {
    const folder = (parsed.searchParams.get('folder') || '').trim().replace(/^\/+|\/+$/g, '');
    const startsWith = (parsed.searchParams.get('startsWith') || '').trim();

    if (folder && !isSafeRelativePath(folder)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parametro folder invalido' }));
      return;
    }

    const baseImagesDir = path.join(__dirname, 'imgs');
    const targetDir = folder ? path.join(baseImagesDir, folder) : baseImagesDir;
    const normalizedBase = path.resolve(baseImagesDir);
    const normalizedTarget = path.resolve(targetDir);

    if (!normalizedTarget.startsWith(normalizedBase)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso denegado' }));
      return;
    }

    if (!fs.existsSync(normalizedTarget) || !fs.statSync(normalizedTarget).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Carpeta no encontrada' }));
      return;
    }

    try {
      const requestPrefix = folder ? path.posix.join('/imgs', folder) : '/imgs';
      const images = listImagesInDirectory(normalizedTarget, requestPrefix, startsWith);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ images }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No se pudo listar la galeria' }));
      return;
    }
  }

  if (pathname === '/api/download-favorites') {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        res.writeHead(413);
        res.end('Payload too large');
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const fotos = Array.isArray(payload.fotos) ? payload.fotos : [];
        const clave = (payload.clave || 'galeria').replace(/[^a-zA-Z0-9_-]/g, '');

        if (!fotos.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No hay fotos para descargar' }));
          return;
        }

        // Limita a 500 fotos máximo
        const fotosList = fotos.slice(0, 500);

        const archive = archiver('zip', { zlib: { level: 6 } });
        const filename = `galeria-${clave}-${Date.now()}.zip`;

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store'
        });

        archive.pipe(res);

        for (const fotoSrc of fotosList) {
          const fotoPath = path.join(__dirname, fotoSrc.replace(/^\//, ''));
          const normalizedBase = path.resolve(path.join(__dirname, 'imgs'));
          const normalizedFoto = path.resolve(fotoPath);

          if (!normalizedFoto.startsWith(normalizedBase)) {
            console.warn('Intento de acceso denegado:', fotoSrc);
            continue;
          }

          if (fs.existsSync(normalizedFoto)) {
            const filename = path.basename(normalizedFoto);
            archive.file(normalizedFoto, { name: filename });
          }
        }

        archive.on('error', (err) => {
          console.error('Archive error:', err);
          res.writeHead(500);
          res.end('Error generating archive');
        });

        await archive.finalize();
      } catch (err) {
        console.error('Download-favorites error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error processing request' }));
      }
    });
    return;
  }

  if (pathname === '/api/experiencias/submit') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 200 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const incoming = parseRequestBody(body);
        const tipoCliente = String(incoming.tipo_cliente || incoming.tipoCliente || '').trim().toLowerCase();
        const payload = {
          ...incoming,
          tipo_cliente: tipoCliente,
          tipoCliente: tipoCliente,
          // Compat alias for scripts that expect singular field naming.
          tipo: tipoCliente,
          action: 'submitExperience'
        };

        // La clave nunca viaja en el frontend: se inyecta server-side.
        if (EXPERIENCIAS_API_KEY) {
          payload.api_key = EXPERIENCIAS_API_KEY;
        }

        const proxyResponse = await proxyExperienceToAppsScript(payload);

        if (!proxyResponse || proxyResponse.ok === false) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({
            ok: false,
            error: (proxyResponse && proxyResponse.error) || 'No se pudo registrar la experiencia en Apps Script'
          }));
          return;
        }

        let notify = {
          enabled: EXPERIENCIAS_NOTIFY_WHATSAPP,
          attempted: false,
          ok: false
        };

        if (EXPERIENCIAS_NOTIFY_WHATSAPP) {
          notify.attempted = true;
          try {
            const notifyRes = await sendExperienceViaTwilio(payload, proxyResponse);
            notify = {
              ...notify,
              ok: true,
              result: notifyRes
            };
            console.log('[experiencias][twilio] notificacion enviada:', JSON.stringify(notifyRes));
          } catch (notifyErr) {
            notify = {
              ...notify,
              ok: false,
              error: notifyErr.message
            };
            console.warn('[experiencias][twilio] no se pudo enviar notificacion:', notifyErr.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          ...proxyResponse,
          notify
        }));
      } catch (err) {
        if (String(err && err.message || '').toLowerCase().includes('formato de payload invalido')) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Payload invalido en /api/experiencias/submit' }));
          return;
        }
        console.error('Experiencias proxy error:', err);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'No se pudo conectar con el backend de experiencias' }));
      }
    });
    return;
  }

  if (pathname === '/api/experiencias/test-whatsapp') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 16 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const incoming = parseRequestBody(body);
        const headerApiKey = String(req.headers['x-api-key'] || '').trim();
        const bodyApiKey = String(incoming.api_key || '').trim();

        if (EXPERIENCIAS_API_KEY && headerApiKey !== EXPERIENCIAS_API_KEY && bodyApiKey !== EXPERIENCIAS_API_KEY) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'API key invalida' }));
          return;
        }

        const to = String(incoming.to || incoming.whatsapp || TWILIO_WHATSAPP_TO_OVERRIDE || '').trim();
        const text = String(incoming.text || '').trim() || `Prueba manual Twilio OK (${new Date().toISOString()})`;
        const result = await sendTwilioWhatsappText(text, to);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, test: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
      }
    });
    return;
  }

  if (pathname === '/api/lead-modal/submit') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 64 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const incoming = JSON.parse(body || '{}');
        const resolvedName = String(incoming.fullName || incoming.nombre || incoming.name || '').trim();
        const resolvedWhatsapp = String(incoming.whatsapp || incoming.telefono || incoming.phone || incoming.celular || '').trim();
        const resolvedEventType = String(incoming.eventType || incoming.tipoEvento || incoming.tipo_evento || incoming.event_type || '').trim();
        const whatsappDigits = resolvedWhatsapp.replace(/\D+/g, '');
        const payload = {
          ...incoming,
          fullName: resolvedName,
          nombre: resolvedName,
          name: resolvedName,
          whatsapp: resolvedWhatsapp,
          telefono: resolvedWhatsapp,
          phone: resolvedWhatsapp,
          celular: resolvedWhatsapp,
          whatsappDigits,
          whatsappE164: whatsappDigits ? `+${whatsappDigits}` : '',
          eventType: resolvedEventType,
          tipoEvento: resolvedEventType,
          tipo_evento: resolvedEventType,
          event_type: resolvedEventType,
          source: incoming.source || 'index-modal',
          submittedAt: incoming.submittedAt || new Date().toISOString()
        };

        logLeadModalDebug('incoming_payload', {
          source: payload.source,
          eventType: payload.eventType || payload.tipoEvento || '',
          whatsappMasked: maskWhatsapp(payload.whatsapp || payload.telefono || ''),
          hasName: Boolean((payload.fullName || payload.nombre || '').toString().trim()),
          provider: LEAD_MODAL_PROVIDER
        });

        if (LEAD_MODAL_PROVIDER === 'twilio') {
          const twilioResponse = await sendLeadModalViaTwilio(payload);
          logLeadModalDebug('twilio_response', twilioResponse);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(twilioResponse));
          return;
        }

        if (LEAD_MODAL_PROVIDER === 'both') {
          const proxyResponse = await proxyLeadModalToAppsScript(payload);
          const normalizedResponse = normalizeLeadModalProxyResponse(proxyResponse);
          logLeadModalDebug('upstream_response', normalizedResponse);
          if (normalizedResponse.ok === false) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(normalizedResponse));
            return;
          }

          const twilioResponse = await sendLeadModalViaTwilio(payload);
          logLeadModalDebug('twilio_response', twilioResponse);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, provider: 'both', appsScript: normalizedResponse, twilio: twilioResponse }));
          return;
        }

        const proxyResponse = await proxyLeadModalToAppsScript(payload);
        const normalizedResponse = normalizeLeadModalProxyResponse(proxyResponse);

        logLeadModalDebug('upstream_response', normalizedResponse);

        if (normalizedResponse.ok === false) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(normalizedResponse));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(normalizedResponse));
      } catch (err) {
        console.error('Lead modal proxy error:', err);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: 'No se pudo conectar con el backend del modal',
          details: LEAD_MODAL_DEBUG ? String(err && err.message ? err.message : err) : undefined
        }));
      }
    });
    return;
  }

  if (pathname === '/api/experiencias/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      appsScriptConfigured: Boolean(EXPERIENCIAS_APPS_SCRIPT_URL),
      apiKeyConfigured: Boolean(EXPERIENCIAS_API_KEY),
      leadModalProvider: LEAD_MODAL_PROVIDER,
      leadModalAppsScriptConfigured: Boolean(LEAD_MODAL_APPS_SCRIPT_URL),
      twilioConfig: {
        accountSid: Boolean(TWILIO_ACCOUNT_SID),
        authToken: Boolean(TWILIO_AUTH_TOKEN),
        apiKeySid: Boolean(TWILIO_API_KEY_SID),
        apiKeySecret: Boolean(TWILIO_API_KEY_SECRET),
        from: Boolean(TWILIO_WHATSAPP_FROM),
        messagingServiceSid: Boolean(TWILIO_MESSAGING_SERVICE_SID),
        toOverride: Boolean(TWILIO_WHATSAPP_TO_OVERRIDE)
      },
      experienciasNotifyWhatsapp: EXPERIENCIAS_NOTIFY_WHATSAPP
    }));
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(__dirname, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('File not found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (PRIVATE_EXPERIENCE_PATHS.has(parsed.pathname) || PRIVATE_EXPERIENCE_PATHS.has(pathname)) {
      headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
      headers['Cache-Control'] = 'private, max-age=0, no-store';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(8000, () => {
  console.log('Server running at http://localhost:8000');
});
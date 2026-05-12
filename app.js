(function () {
  'use strict';

  const config = window.EXPERIENCIA_CONFIG;
  if (!config) return;

  const form = document.getElementById('exp-form');
  const questionsRoot = document.getElementById('questions-root');
  const heroEyebrow = document.getElementById('hero-eyebrow');
  const heroTitle = document.getElementById('hero-title');
  const heroSubtext = document.getElementById('hero-subtext');
  const errorEl = document.getElementById('submit-error');
  const submitBtn = document.getElementById('submit-btn');
  const formBlock = document.getElementById('form-block');
  const successBlock = document.getElementById('success-block');
  const successTitle = document.getElementById('success-title');
  const successText = document.getElementById('success-text');

  const ENDPOINT_STORAGE_KEY = 'matirath_experiencias_endpoint';
  const MIN_ANSWER_LENGTH = 4;

  let sending = false;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeInstagram(value) {
    const cleaned = String(value || '').trim().replace(/^@+/, '');
    return cleaned ? '@' + cleaned : '';
  }

  function getEndpoint() {
    const fromQuery = new URLSearchParams(window.location.search).get('endpoint');
    if (fromQuery) return fromQuery.trim();

    const fromConfig = (config.endpoint || '').trim();
    if (fromConfig) return fromConfig;

    return (localStorage.getItem(ENDPOINT_STORAGE_KEY) || '').trim();
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }

  function markInvalidField(field) {
    if (!field || !field.classList) return;
    field.classList.add('field-error');
    if (typeof field.focus === 'function') {
      field.focus({ preventScroll: true });
    }
    if (typeof field.scrollIntoView === 'function') {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearFieldErrors() {
    const invalidFields = form.querySelectorAll('.field-error');
    invalidFields.forEach(function (node) {
      node.classList.remove('field-error');
    });
  }

  function buildQuestions() {
    heroEyebrow.textContent = config.eyebrow;
    heroTitle.textContent = config.title;
    heroSubtext.textContent = config.subtext;

    questionsRoot.innerHTML = config.questions
      .map(function (q, idx) {
        const delay = 80 + idx * 70;
        return '' +
          '<div class="question-block" style="animation-delay:' + delay + 'ms">' +
            '<label class="question-title" for="respuesta_' + (idx + 1) + '">' + escapeHtml(q) + '</label>' +
            '<textarea id="respuesta_' + (idx + 1) + '" name="respuesta_' + (idx + 1) + '" maxlength="1800" required></textarea>' +
          '</div>';
      })
      .join('');
  }

  function readRequiredText(name) {
    const field = form.elements.namedItem(name);
    if (!field) return '';
    return String(field.value || '').trim();
  }

  function validateForm() {
    clearFieldErrors();

    if (readRequiredText('hp_site')) {
      throw new Error('Solicitud rechazada.');
    }

    const nombre = readRequiredText('nombre');
    if (!nombre || nombre.length < 2) {
      throw new Error('Por favor, comparti tu nombre.');
    }

    const questionCount = Array.isArray(config.questions) ? config.questions.length : 0;
    let hasAtLeastOneAnswer = false;
    for (let i = 1; i <= questionCount; i += 1) {
      const fieldName = 'respuesta_' + i;
      const answer = readRequiredText(fieldName);
      if (answer && answer.length >= MIN_ANSWER_LENGTH) {
        hasAtLeastOneAnswer = true;
      }
    }

    if (!hasAtLeastOneAnswer) {
      const firstAnswerField = form.elements.namedItem('respuesta_1');
      markInvalidField(firstAnswerField);
      throw new Error('Con una sola respuesta ya alcanza. Completa al menos una pregunta.');
    }

    const auth = form.elements.namedItem('autorizacion');
    if (!auth || !form.querySelector('input[name="autorizacion"]:checked')) {
      throw new Error('Por favor, elegi como queres figurar en caso de publicacion.');
    }

    const consent = form.elements.namedItem('consentimiento');
    if (!consent || !consent.checked) {
      throw new Error('Necesitamos tu autorizacion para usar fragmentos de forma editorial.');
    }
  }

  function buildPayload() {
    const authorization = (form.querySelector('input[name="autorizacion"]:checked') || {}).value || '';
    const answers = {};
    const questionCount = Array.isArray(config.questions) ? config.questions.length : 0;
    for (let i = 1; i <= questionCount; i += 1) {
      const answer = readRequiredText('respuesta_' + i);
      answers['respuesta_' + i] = answer || 'Sin respuesta';
    }

    return {
      action: 'submitExperience',
      source: 'private_landing',
      tipo_cliente: config.tipoCliente,
      nombre: readRequiredText('nombre'),
      instagram: normalizeInstagram(form.elements.namedItem('instagram').value),
      whatsapp: String(form.elements.namedItem('whatsapp').value || '').trim(),
      autorizacion: authorization,
      respuesta_1: answers.respuesta_1,
      respuesta_2: answers.respuesta_2,
      respuesta_3: answers.respuesta_3,
      respuesta_4: answers.respuesta_4,
      respuesta_5: answers.respuesta_5,
      respuesta_6: answers.respuesta_6,
      frase_destacada: String(form.elements.namedItem('frase_destacada').value || '').trim(),
      consentimiento_uso: Boolean(form.elements.namedItem('consentimiento') && form.elements.namedItem('consentimiento').checked),
      landing_key: config.tipoCliente,
      landing_path: window.location.pathname,
      user_agent: navigator.userAgent,
      submitted_at_client: new Date().toISOString()
    };
  }

  async function sendPayload(payload) {
    const endpoint = getEndpoint();
    if (!endpoint) {
      throw new Error('Falta configurar el endpoint de Google Apps Script.');
    }

    const apiKeyMeta = document.querySelector('meta[name="x-api-key"]');
    const isGoogleScript = endpoint.indexOf('script.google.com') !== -1;
    const headers = {
      'Content-Type': isGoogleScript ? 'text/plain;charset=utf-8' : 'application/json'
    };
    if (apiKeyMeta && apiKeyMeta.content) {
      headers['X-API-Key'] = apiKeyMeta.content;
      payload.api_key = apiKeyMeta.content;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      mode: isGoogleScript ? 'no-cors' : 'same-origin',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (isGoogleScript) {
      return { ok: true };
    }

    const raw = await response.text();
    let data = null;

    if (raw && raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch (_err) {
        if (!response.ok) {
          throw new Error('No se pudo registrar la experiencia.');
        }
      }
    }

    if (!response.ok) {
      throw new Error((data && data.error) || 'No se pudo registrar la experiencia.');
    }

    if (data && data.ok === false) {
      throw new Error(data.error || 'No se pudo registrar la experiencia.');
    }

    return data || { ok: true };
  }

  function showSuccess() {
    successTitle.textContent = config.successTitle;
    successText.textContent = config.successText;
    formBlock.classList.add('hide');
    setTimeout(function () {
      successBlock.classList.add('visible');
      successBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 230);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (sending) return;

    clearError();

    try {
      validateForm();
      sending = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      const payload = buildPayload();
      await sendPayload(payload);
      form.reset();
      showSuccess();
    } catch (err) {
      showError(err.message || 'No se pudo enviar. Intenta nuevamente.');
    } finally {
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar experiencia';
    }
  }

  function bootstrap() {
    buildQuestions();
    form.addEventListener('submit', onSubmit);
  }

  bootstrap();
})();

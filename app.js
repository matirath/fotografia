(function () {
  'use strict';

  const config = window.EXPERIENCIA_CONFIG;
  if (!config) return;

  const form = document.getElementById('exp-form');
  const questionsRoot = document.getElementById('questions-root');
  const hero = document.querySelector('.hero');
  const heroEyebrow = document.getElementById('hero-eyebrow');
  const heroTitle = document.getElementById('hero-title');
  const heroSubtext = document.getElementById('hero-subtext');
  const errorEl = document.getElementById('submit-error');
  const submitBtn = document.getElementById('submit-btn');
  const formBlock = document.getElementById('form-block');
  const successBlock = document.getElementById('success-block');
  const successTitle = document.getElementById('success-title');
  const successText = document.getElementById('success-text');
  const floatingProgress = document.getElementById('floating-progress');
  const progressTrack = document.getElementById('questions-progress-track');
  const progressFill = document.getElementById('questions-progress-fill');
  const progressLabel = document.getElementById('questions-progress-label');
  const npsReasonWrap = document.getElementById('nps-reason-wrap');

  const ENDPOINT_STORAGE_KEY = 'matirath_experiencias_endpoint';
  const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/AKfycby9ymEEfHKPm1j31YuEZKxhwCtgplRggoLR8lRteKUV8dge-oeV9J6DRbRr4dzrgyronQ/exec';
  const MIN_ANSWER_LENGTH = 4;
  const WHATSAPP_MOBILE_DELAY_MS = 2600;

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

  function getEndpoints() {
    const endpoints = [];
    const fromQuery = new URLSearchParams(window.location.search).get('endpoint');
    if (fromQuery && fromQuery.trim()) {
      endpoints.push(fromQuery.trim());
    }

    const fromConfig = (config.endpoint || '').trim();
    if (fromConfig) {
      endpoints.push(fromConfig);
    }

    const fromStorage = (localStorage.getItem(ENDPOINT_STORAGE_KEY) || '').trim();
    if (fromStorage) {
      endpoints.push(fromStorage);
    }

    endpoints.push(APPS_SCRIPT_ENDPOINT);

    return Array.from(new Set(endpoints));
  }

  async function sendToEndpoint(endpoint, payload) {
    const apiKeyMeta = document.querySelector('meta[name="x-api-key"]');
    const isGoogleScript = endpoint.indexOf('script.google.com') !== -1;
    const headers = {
      'Content-Type': isGoogleScript ? 'text/plain;charset=utf-8' : 'application/json'
    };
    const payloadBody = { ...payload };

    if (apiKeyMeta && apiKeyMeta.content) {
      headers['X-API-Key'] = apiKeyMeta.content;
      payloadBody.api_key = apiKeyMeta.content;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      mode: isGoogleScript ? 'no-cors' : 'same-origin',
      headers: headers,
      body: JSON.stringify(payloadBody)
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
        const number = String(idx + 1).padStart(2, '0');
        return '' +
          '<div class="question-block" style="animation-delay:' + delay + 'ms">' +
            '<div class="question-head">' +
              '<span class="question-chip">Escena ' + number + '</span>' +
              '<span class="question-hint">Respuesta libre</span>' +
            '</div>' +
            '<label class="question-title" for="respuesta_' + (idx + 1) + '">' + escapeHtml(q) + '</label>' +
            '<textarea id="respuesta_' + (idx + 1) + '" name="respuesta_' + (idx + 1) + '" maxlength="1800"></textarea>' +
          '</div>';
      })
      .join('');
  }

  function updateProgress() {
    const questionCount = Array.isArray(config.questions) ? config.questions.length : 0;
    if (!questionCount) return;

    let completedCount = 0;
    for (let i = 1; i <= questionCount; i += 1) {
      const field = form.elements.namedItem('respuesta_' + i);
      const wrapper = field && field.closest ? field.closest('.question-block') : null;
      const answer = field ? String(field.value || '').trim() : '';
      const isCompleted = answer.length >= MIN_ANSWER_LENGTH;

      if (wrapper && wrapper.classList) {
        wrapper.classList.toggle('answered', isCompleted);
      }

      if (isCompleted) {
        completedCount += 1;
      }
    }

    const percent = Math.min(100, Math.round((completedCount / questionCount) * 100));
    const ratio = questionCount ? (completedCount / questionCount) : 0;

    if (progressFill) {
      progressFill.style.width = percent + '%';
    }

    if (floatingProgress) {
      let state = 'low';
      if (ratio >= 0.67) {
        state = 'high';
      } else if (ratio >= 0.34) {
        state = 'mid';
      }
      floatingProgress.setAttribute('data-progress-state', state);
      floatingProgress.classList.remove('is-bumping');
      requestAnimationFrame(function () {
        floatingProgress.classList.add('is-bumping');
      });
    }

    if (progressTrack) {
      progressTrack.setAttribute('aria-valuemax', String(questionCount));
      progressTrack.setAttribute('aria-valuenow', String(completedCount));
    }

    if (progressLabel) {
      progressLabel.textContent = completedCount + '/' + questionCount + ' respuestas completas';
    }
  }

  function bindProgressListeners() {
    const questionCount = Array.isArray(config.questions) ? config.questions.length : 0;
    for (let i = 1; i <= questionCount; i += 1) {
      const field = form.elements.namedItem('respuesta_' + i);
      if (!field || !field.addEventListener) continue;
      field.addEventListener('input', updateProgress);
      field.addEventListener('blur', updateProgress);
    }
    updateProgress();
  }

  function toggleNpsReasonVisibility() {
    if (!npsReasonWrap) return;
    const hasNpsSelected = Boolean(form.querySelector('input[name="nps_recomendacion"]:checked'));
    npsReasonWrap.hidden = !hasNpsSelected;
    npsReasonWrap.classList.toggle('is-visible', hasNpsSelected);
  }

  function bindNpsReasonToggle() {
    const npsRadios = form.querySelectorAll('input[name="nps_recomendacion"]');
    npsRadios.forEach(function (radio) {
      radio.addEventListener('change', toggleNpsReasonVisibility);
      radio.addEventListener('input', toggleNpsReasonVisibility);
    });
    toggleNpsReasonVisibility();
  }

  function readRequiredText(name) {
    const field = form.elements.namedItem(name);
    if (!field) return '';
    return String(field.value || '').trim();
  }

  function readOptionalText(name) {
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

    const auth = form.elements.namedItem('autorizacion');
    if (!auth || !form.querySelector('input[name="autorizacion"]:checked')) {
      throw new Error('Por favor, elegi como queres figurar en caso de publicacion.');
    }

    const nps = form.querySelector('input[name="nps_recomendacion"]:checked');
    if (!nps) {
      throw new Error('Por favor, marca la probabilidad de recomendacion (0 a 10).');
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
      instagram: normalizeInstagram(readOptionalText('instagram')),
      whatsapp: readOptionalText('whatsapp'),
      autorizacion: authorization,
      respuesta_1: answers.respuesta_1,
      respuesta_2: answers.respuesta_2,
      respuesta_3: answers.respuesta_3,
      respuesta_4: answers.respuesta_4,
      respuesta_5: answers.respuesta_5,
      respuesta_6: answers.respuesta_6,
      nps_recomendacion: (form.querySelector('input[name="nps_recomendacion"]:checked') || {}).value || '',
      nps_por_que: readOptionalText('nps_por_que'),
      frase_destacada: readOptionalText('frase_destacada'),
      comentario_libre: readOptionalText('comentario_libre'),
      consentimiento_uso: Boolean(form.elements.namedItem('consentimiento') && form.elements.namedItem('consentimiento').checked),
      landing_key: config.tipoCliente,
      landing_path: window.location.pathname,
      user_agent: navigator.userAgent,
      submitted_at_client: new Date().toISOString()
    };
  }

  async function sendPayload(payload) {
    const endpoints = getEndpoints();
    if (!endpoints.length) {
      throw new Error('Falta configurar el endpoint de Google Apps Script.');
    }

    let lastError = null;
    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        return await sendToEndpoint(endpoints[i], payload);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('No se pudo registrar la experiencia.');
  }

  function showSuccess() {
    successTitle.textContent = config.successTitle;
    successText.textContent = config.successText;
    if (hero) {
      hero.classList.add('hide');
    }
    if (floatingProgress) {
      floatingProgress.classList.add('is-hidden');
    }
    formBlock.classList.add('hide');
    formBlock.style.display = 'none';
    setTimeout(function () {
      successBlock.classList.add('visible');
      successBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 230);
  }

  const WA_NUMERO = '5492954230852';

  function buildWhatsAppMessage(payload) {
    const tipo = config.tipoCliente === 'comercial' ? 'comercial' : 'eventos';
    const authorizationLabels = {
      nombre_completo: 'Nombre completo',
      solo_nombre: 'Solo nombre',
      anonimo: 'Anónimo'
    };
    const authorizationLabel = authorizationLabels[payload.autorizacion] || 'No indicó autorización';
    const lines = [
      'Hola Mat\u00edas! Soy ' + payload.nombre + (payload.instagram ? ' (' + payload.instagram + ')' : '') + '.',
      'Te mando mi experiencia (' + tipo + ').',
      ''
    ];

    const questions = Array.isArray(config.questions) ? config.questions : [];
    questions.forEach(function (q, idx) {
      const ans = payload['respuesta_' + (idx + 1)] || '';
      if (ans && ans !== 'Sin respuesta') {
        lines.push('\u2726 ' + q);
        lines.push(ans);
        lines.push('');
      }
    });

    if (payload.frase_destacada) {
      lines.push('Frase: \"' + payload.frase_destacada + '\"');
      lines.push('');
    }

    if (payload.comentario_libre) {
      lines.push('Aporte libre:');
      lines.push(payload.comentario_libre);
      lines.push('');
    }

    if (payload.nps_recomendacion !== '') {
      lines.push('NPS (recomendacion 0-10): ' + payload.nps_recomendacion);
      if (payload.nps_por_que) {
        lines.push('Por que esa puntuacion:');
        lines.push(payload.nps_por_que);
      }
      lines.push('');
    }

    lines.push('Autorización de uso: ' + authorizationLabel);
    if (payload.whatsapp) lines.push('WA: ' + payload.whatsapp);

    return lines.join('\n');
  }

  function onSubmit(event) {
    event.preventDefault();
    if (sending) return;

    clearError();

    try {
      validateForm();
      sending = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Abriendo WhatsApp...';

      const payload = buildPayload();
      const mensaje = buildWhatsAppMessage(payload);
      form.reset();
      showSuccess();

      const whatsappUrl = 'https://wa.me/' + WA_NUMERO + '?text=' + encodeURIComponent(mensaje);
      const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        setTimeout(function () {
          window.location.href = whatsappUrl;
        }, WHATSAPP_MOBILE_DELAY_MS);
      } else {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      showError(err.message || 'No se pudo procesar. Intent\u00e1 nuevamente.');
    } finally {
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar por WhatsApp';
    }
  }

  function bootstrap() {
    buildQuestions();
    bindProgressListeners();
    bindNpsReasonToggle();
    form.addEventListener('submit', onSubmit);
  }

  bootstrap();
})();

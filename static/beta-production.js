(() => {
  'use strict';

  const betaUi = {
    form: document.getElementById('beta-create-form'),
    businessName: document.getElementById('beta-business-name'),
    businessRegion: document.getElementById('beta-business-region'),
    businessService: document.getElementById('beta-business-service'),
    businessPhone: document.getElementById('beta-business-phone'),
    topic: document.getElementById('beta-topic'),
    images: document.getElementById('beta-images'),
    videos: document.getElementById('beta-videos'),
    status: document.getElementById('beta-status'),
    statusBox: document.getElementById('beta-production-status'),
    progressBar: document.getElementById('beta-progress-bar'),
    gemini: document.getElementById('beta-gemini'),
    geminiRetry: document.getElementById('beta-gemini-retry'),
    channelResults: document.getElementById('beta-channel-results'),
    preview: document.getElementById('beta-preview'),
    audio: document.getElementById('beta-audio'),
    slotTabs: document.getElementById('beta-slot-tabs'),
    slots: document.getElementById('beta-slots'),
    content: document.getElementById('beta-content'),
    jobId: document.getElementById('beta-job-id'),
    checkJob: document.getElementById('beta-check-job'),
    checkGemini: document.getElementById('beta-check-gemini'),
    supertonic: document.getElementById('beta-supertonic'),
    checkAssets: document.getElementById('beta-check-assets'),
    debug: document.getElementById('beta-debug'),
    renderHandoff: document.getElementById('beta-render-handoff'),
    prepareBrowser: document.getElementById('beta-prepare-browser'),
    openBrowser: document.getElementById('beta-open-browser'),
    browserLink: document.getElementById('beta-browser-link'),
    shortformIntegrated: document.getElementById('beta-shortform-integrated'),
    shortformStatus: document.getElementById('beta-shortform-integrated-status')
  };

  let betaCurrentJobId = sessionStorage.getItem('storymaker_beta_current_job') || '';
  let betaPromptAnimation = null;
  let betaGeminiWatchTimer = null;
  let betaGeminiLockedUntil = 0;
  const BETA_GEMINI_LOCK_MS = 60000;

  function betaSetStatus(message, progress = 0) {
    betaUi.status.textContent = String(message || '').replaceAll('Gemini', 'AI');
    if (betaUi.progressBar) {
      betaUi.progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      betaUi.progressBar.classList.toggle('complete', progress >= 100);
    }
    if (betaUi.statusBox) betaUi.statusBox.classList.toggle('idle', progress <= 0 || progress >= 100);
  }


  function betaStopPromptAnimation() {
    if (betaPromptAnimation) clearInterval(betaPromptAnimation);
    betaPromptAnimation = null;
  }

  async function betaStartPromptAnimation() {
    betaStopPromptAnimation();
    if (!betaCurrentJobId) return;
    try {
      const data = await betaRequest(`/beta-api/gemini-worker/prompt/${encodeURIComponent(betaCurrentJobId)}`);
      const lines = String(data.prompt || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return;
      let index = 0;
      const interval = Math.max(240, Math.floor(30000 / lines.length));
      betaSetStatus(`AI 프롬프트 · ${lines[index]}`, 19);
      betaPromptAnimation = setInterval(() => {
        index += 1;
        if (index >= lines.length) {
          betaStopPromptAnimation();
          return;
        }
        betaSetStatus(`AI 프롬프트 · ${lines[index]}`, Math.min(32, 19 + Math.round(index / lines.length * 13)));
      }, interval);
    } catch (_) {
      betaStopPromptAnimation();
    }
  }

  async function betaRequest(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  function betaEscapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function betaShowChannel(channels, order, index) {
    const key = order[index];
    const item = channels[key];
    if (!item) return;
    betaUi.slotTabs.querySelectorAll('.slot-tab').forEach((button, buttonIndex) => {
      button.classList.toggle('active', buttonIndex === index);
    });
    betaUi.slots.innerHTML = `
      <h3>${betaEscapeHtml(item.label || key)}</h3>
      <div class="slot-meta">저장 키 ${betaEscapeHtml(key)}</div>
      <div class="slot-script">${betaEscapeHtml(item.content || '')}</div>`;
  }

  function betaConnectShortform(job) {
    const content = job?.content || {};
    const channels = content.channels || {};
    const ready = Boolean(betaCurrentJobId && (content.podcast_50 || channels.PODCAST_50?.content));
    if (!betaUi.shortformIntegrated) return;
    betaUi.shortformIntegrated.hidden = !ready;
    if (!ready) return;
    if (betaUi.shortformStatus) betaUi.shortformStatus.textContent = '업체정보·블로그 제목·팟캐스트50·업로드 미디어를 연결했습니다.';
    if (window.StoryMakerBetaInlineShortform?.loadJob) {
      window.StoryMakerBetaInlineShortform.loadJob(betaCurrentJobId).catch((error) => {
        if (betaUi.shortformStatus) betaUi.shortformStatus.textContent = `숏폼 연결 실패: ${error.message}`;
      });
    }
  }

  function betaShowContent(job) {
    const content = job.content || {};
    const channels = content.channels || {};
    const order = Array.isArray(content.channel_order) ? content.channel_order : [];
    const readyForRender = order.length === 8 && Boolean(content.podcast_50 || channels.PODCAST_50?.content);
    betaConnectShortform(job);
    if (betaUi.renderHandoff) betaUi.renderHandoff.hidden = !readyForRender;
    const podcastButton = document.getElementById('mp3');
    if (podcastButton) podcastButton.disabled = !readyForRender;
    if (readyForRender && betaCurrentJobId && window.StoryMakerBetaBrowserRenderer) {
      window.StoryMakerBetaBrowserRenderer.prime(betaCurrentJobId);
    }
    if (order.length === 8) {
      betaUi.slotTabs.innerHTML = order.map((key, index) => {
        const item = channels[key] || {};
        return `<button type="button" class="slot-tab${index === 0 ? ' active' : ''}" data-channel-index="${index}">${betaEscapeHtml(item.label || key)}</button>`;
      }).join('');
      betaUi.slotTabs.querySelectorAll('.slot-tab').forEach((button) => {
        button.addEventListener('click', () => betaShowChannel(channels, order, Number(button.dataset.channelIndex || 0)));
      });
      betaShowChannel(channels, order, 0);
    } else {
      betaUi.slotTabs.innerHTML = '<button type="button" class="slot-tab active" disabled>채널 대기</button>';
      betaUi.slots.innerHTML = '<div class="slot-empty">AI SNS 8채널 결과가 아직 저장되지 않았습니다.</div>';
    }
    betaUi.content.textContent = `제목
${content.title || ''}

설명
${content.description || ''}

팟캐스트 80초 기본 대본
${content.podcast_80 || content.podcast_script || content.script || ''}\r\n\r\n썸네일 프롬프트\r\n${content.thumbnail_prompt || '아직 생성되지 않음'}`;
    betaUi.content.hidden = order.length !== 8;
  }

  function betaSetGeminiButtons({ promptDisabled = false, aiDisabled = true } = {}) {
    if (betaUi.gemini) betaUi.gemini.disabled = promptDisabled;
    if (betaUi.geminiRetry) {
      betaUi.geminiRetry.hidden = false;
      betaUi.geminiRetry.disabled = aiDisabled;
    }
  }

  function betaUnlockAiAfterTimeout() {
    betaGeminiLockedUntil = Date.now() + BETA_GEMINI_LOCK_MS;
    window.setTimeout(() => {
      if (Date.now() < betaGeminiLockedUntil) return;
      if (betaUi.geminiRetry) betaUi.geminiRetry.disabled = false;
      betaSetStatus('AI 응답이 지연되고 있습니다. 기존 작업은 계속 확인 중이며, 필요하면 AI원고 생성을 다시 누르세요.', 40);
      betaStartBackgroundGeminiWatch();
    }, BETA_GEMINI_LOCK_MS + 50);
  }

  function betaStartBackgroundGeminiWatch() {
    if (betaGeminiWatchTimer || !betaCurrentJobId) return;
    betaGeminiWatchTimer = window.setInterval(async () => {
      try {
        const status = await betaRequest(`/beta-api/gemini-worker/status?job_id=${encodeURIComponent(betaCurrentJobId)}`);
        const worker = status.data || {};
        if (worker.status === 'completed') {
          window.clearInterval(betaGeminiWatchTimer);
          betaGeminiWatchTimer = null;
          await betaCompleteGeminiUi();
        }
      } catch (_) {}
    }, 3000);
  }

  async function betaCreateJob(event) {
    event.preventDefault();
    if (!betaUi.images.files.length) {
      betaSetStatus('이미지를 한 장 이상 선택하세요.');
      return;
    }
    const body = new FormData();
    body.append('business_name', betaUi.businessName.value.trim());
    body.append('business_region', betaUi.businessRegion.value.trim());
    body.append('business_service', betaUi.businessService.value.trim());
    body.append('business_phone', betaUi.businessPhone.value.trim());
    body.append('topic', betaUi.topic.value.trim());
    for (const file of betaUi.images.files) body.append('images', file);
    for (const file of betaUi.videos.files) body.append('videos', file);
    betaSetGeminiButtons({ promptDisabled: true, aiDisabled: true });
    betaSetStatus('작업 공간과 AI 프롬프트를 준비하는 중...', 8);
    try {
      const data = await betaRequest('/beta-api/jobs', { method: 'POST', body });
      betaCurrentJobId = data.job.beta_job_id;
      sessionStorage.setItem('storymaker_beta_current_job', betaCurrentJobId);
      betaUi.jobId.textContent = betaCurrentJobId;
      betaShowContent(data.job);
      await betaRequest(`/beta-api/gemini-worker/jobs/${encodeURIComponent(betaCurrentJobId)}/prepare`, { method: 'POST' });
      betaSetStatus('프롬프트 준비 완료. 오른쪽 AI원고 생성 버튼을 한 번만 누르세요.', 15);
      betaSetGeminiButtons({ promptDisabled: true, aiDisabled: false });
    } catch (error) {
      betaSetStatus(`프롬프트 생성 실패: ${error.message}`);
      betaSetGeminiButtons({ promptDisabled: false, aiDisabled: true });
    }
  }

  async function betaInspect(label) {
    if (!betaCurrentJobId) return;
    try {
      const data = await betaRequest(`/beta-api/steps/jobs/${encodeURIComponent(betaCurrentJobId)}/inspect`);
      betaUi.debug.textContent = `${label}\n${JSON.stringify(data.checks, null, 2)}`;
    } catch (error) {
      betaUi.debug.textContent = `${label} 실패\n${error.message}`;
    }
  }

  async function betaCreateSupertonicVoice(settings = {}) {
    if (!betaCurrentJobId) return;
    if (betaUi.prepareBrowser) betaUi.prepareBrowser.disabled = true;
    betaSetStatus('Beta 전용 Supertonic 7790에서 실제 음성을 생성하는 중...', 35);
    try {
      const data = await betaRequest(`/beta-api/steps/jobs/${encodeURIComponent(betaCurrentJobId)}/supertonic`, { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(settings || {}) });
      betaUi.audio.src = `/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}/file/audio?t=${Date.now()}`;
      betaUi.audio.hidden = false;
      if (betaUi.debug) betaUi.debug.textContent = `Supertonic 생성 성공\n${JSON.stringify(data, null, 2)}`;
      if (window.StoryMakerBetaBrowserRenderer) {
        window.StoryMakerBetaBrowserRenderer.setJob(betaCurrentJobId);
        await window.StoryMakerBetaBrowserRenderer.loadJob();
      }
      betaSetStatus('Beta Supertonic 음성 준비 완료. 팟캐스트를 생성합니다.', 45);
      return true;
    } catch (error) {
      if (betaUi.debug) betaUi.debug.textContent = `Supertonic 생성 실패\n${error.message}`;
      betaSetStatus(`Supertonic 실패: ${error.message}`);
      if (betaUi.prepareBrowser) betaUi.prepareBrowser.disabled = false;
      throw error;
    }
  }

  window.StoryMakerBetaPrepareVoice = betaCreateSupertonicVoice;

  async function betaQueueThumbnail() {
    if (!betaCurrentJobId) return false;
    await betaRequest(`/beta-api/gemini-worker/jobs/${encodeURIComponent(betaCurrentJobId)}/thumbnail/queue`, { method: 'POST' });
    return true;
  }
  window.StoryMakerBetaQueueThumbnail = betaQueueThumbnail;


  async function betaCompleteGeminiUi() {
    betaStopPromptAnimation();
    const data = await betaRequest(`/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}`);
    betaShowContent(data.job);
    betaSetStatus('AI 원고 생성이 완료되었습니다. 채널별 결과를 확인하세요.', 100);
    betaGeminiLockedUntil = 0;
    betaSetGeminiButtons({ promptDisabled: false, aiDisabled: true });
    requestAnimationFrame(() => {
      betaUi.channelResults?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      betaUi.channelResults?.focus({ preventScroll: true });
    });
  }

  async function betaRetryGemini() {
    return betaGenerateGemini();
  }

  async function betaWaitForGemini() {
    const startedAt = Date.now();
    let sentAt = 0;
    while (Date.now() - startedAt < BETA_GEMINI_LOCK_MS) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await betaRequest(`/beta-api/gemini-worker/status?job_id=${encodeURIComponent(betaCurrentJobId)}`);
      const worker = status.data || {};
      const workerStatus = worker.status || '대기 중';
      if (workerStatus === 'sent' && !sentAt) {
        sentAt = Date.now();
        betaStopPromptAnimation();
      }
      const progress = workerStatus === 'sent' ? 42 : workerStatus === 'claimed' ? 30 : workerStatus === 'pending' ? 22 : 18;
      if (!betaPromptAnimation || workerStatus === 'sent') betaSetStatus(`AI 웹 Worker 상태: ${workerStatus}`, progress);
      if (workerStatus === 'error') {
        betaStopPromptAnimation();
        betaGeminiLockedUntil = 0;
        betaSetGeminiButtons({ promptDisabled: true, aiDisabled: false });
        throw new Error(worker.error || 'AI Worker 처리 실패');
      }
      if (workerStatus === 'completed') {
        await betaCompleteGeminiUi();
        return true;
      }
    }
    betaStopPromptAnimation();
    betaSetGeminiButtons({ promptDisabled: true, aiDisabled: false });
    betaStartBackgroundGeminiWatch();
    return false;
  }

  async function betaGenerateGemini() {
    if (!betaCurrentJobId || !betaUi.geminiRetry) return;
    if (Date.now() < betaGeminiLockedUntil) return;
    betaSetGeminiButtons({ promptDisabled: true, aiDisabled: true });
    betaUnlockAiAfterTimeout();
    betaSetStatus('준비된 프롬프트를 AI 전송 창구에 등록하는 중...', 18);
    try {
      await betaRequest(`/beta-api/gemini-worker/jobs/${encodeURIComponent(betaCurrentJobId)}/queue`, { method: 'POST' });
      await betaStartPromptAnimation();
      await betaWaitForGemini();
    } catch (error) {
      betaGeminiLockedUntil = 0;
      betaSetStatus(`AI 원고 생성 실패: ${error.message}`);
      betaSetGeminiButtons({ promptDisabled: true, aiDisabled: false });
    }
  }

  async function betaRenderJob() {
    if (!betaCurrentJobId) return;
    const body = new FormData();
    body.append('music_volume', betaUi.musicVolume.value || '0.16');
    betaUi.render.disabled = true;
    betaSetStatus('오프라인 한국어 음성 생성 중...', 25);
    try {
      const data = await betaRequest(`/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}/render`, { method: 'POST', body });
      betaUi.preview.src = `${data.video_url}?t=${Date.now()}`;
      betaUi.preview.hidden = false;
      betaUi.audio.src = `/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}/file/audio?t=${Date.now()}`;
      betaUi.audio.hidden = false;
      betaShowContent(data.job);
      betaSetStatus(`PODCAST_80 기반 팟캐스트 MP3와 최종 MP4 생성 완료 · ${data.job.duration_seconds || 0}초`, 100);
    } catch (error) {
      betaSetStatus(`MP4 제작 실패: ${error.message}`);
      betaUi.render.disabled = false;
    }
  }

  betaUi.form.addEventListener('submit', betaCreateJob);
  if (betaUi.geminiRetry) betaUi.geminiRetry.addEventListener('click', betaRetryGemini);
  if (betaUi.prepareBrowser) betaUi.prepareBrowser.addEventListener('click', betaCreateSupertonicVoice);
  async function betaRestoreCurrentJob() {
    if (!betaCurrentJobId) return;
    betaUi.jobId.textContent = betaCurrentJobId;
    betaSetGeminiButtons({ promptDisabled: false, aiDisabled: true });
    try {
      const data = await betaRequest(`/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}`);
      betaShowContent(data.job);
      const order = Array.isArray(data.job?.content?.channel_order) ? data.job.content.channel_order : [];
      if (order.length === 8) {
        betaSetStatus('저장된 AI SNS 8채널을 불러왔습니다.', 100);
        betaSetGeminiButtons({ promptDisabled: false, aiDisabled: true });
      } else {
        await betaRequest(`/beta-api/gemini-worker/jobs/${encodeURIComponent(betaCurrentJobId)}/prepare`, { method: 'POST' });
        betaSetStatus('현재 작업의 프롬프트가 준비되었습니다. AI원고 생성을 누르세요.', 15);
        betaSetGeminiButtons({ promptDisabled: true, aiDisabled: false });
      }
    } catch (error) {
      betaSetStatus(`현재 작업 불러오기 실패: ${error.message}`);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data) return;
    if (event.data.type === 'storymaker-beta-shortform-ready') {
      if (betaUi.shortformStatus) betaUi.shortformStatus.textContent = '현재 작업 데이터와 사용자 기본 설정 연결 완료';
    }
    if (event.data.type === 'storymaker-beta-shortform-error') {
      if (betaUi.shortformStatus) betaUi.shortformStatus.textContent = `숏폼 연결 확인 필요 · ${event.data.error || '알 수 없는 오류'}`;
    }
  });

  window.addEventListener('storymaker-beta-renderer-ready', () => {
    if (betaCurrentJobId && window.StoryMakerBetaBrowserRenderer) {
      window.StoryMakerBetaBrowserRenderer.prime(betaCurrentJobId);
    }
  });

  betaRestoreCurrentJob();

  async function fillFromV1Profile() {
    try {
      const response = await fetch('/beta-api/v1-profile', { cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      const profile = data?.profile;
      if (!response.ok || !profile) return;
      const pairs = [
        [betaUi.businessName, profile.name],
        [betaUi.businessRegion, profile.region],
        [betaUi.businessService, profile.service],
        [betaUi.businessPhone, profile.phone],
      ];
      for (const [input, value] of pairs) {
        if (input && !input.value.trim() && String(value || '').trim()) input.value = String(value).trim();
      }
      if (pairs.some(([input]) => input?.value?.trim())) {
        betaUi.status.textContent = 'V1 로그인 업체정보를 불러왔습니다. 필요하면 수정한 뒤 제작하세요.';
      }
    } catch (_) {
      // V1 로그인이 없거나 연결되지 않으면 기존 수동 입력을 유지합니다.
    }
  }

  fillFromV1Profile();
})();

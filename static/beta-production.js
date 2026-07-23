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
    music: document.getElementById('beta-music'),
    musicVolume: document.getElementById('beta-music-volume'),
    status: document.getElementById('beta-status'),
    progress: document.getElementById('beta-progress'),
    gemini: document.getElementById('beta-gemini'),
    render: document.getElementById('beta-render'),
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
    debug: document.getElementById('beta-debug')
  };

  let betaCurrentJobId = sessionStorage.getItem('storymaker_beta_current_job') || '';

  function betaSetStatus(message, progress = 0) {
    betaUi.status.textContent = message;
    betaUi.progress.value = progress;
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

  function betaShowContent(job) {
    const content = job.content || {};
    const channels = content.channels || {};
    const order = Array.isArray(content.channel_order) ? content.channel_order : [];
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
      betaUi.slots.innerHTML = '<div class="slot-empty">Gemini SNS 8채널 결과가 아직 저장되지 않았습니다.</div>';
    }
    betaUi.content.textContent = `제목
${content.title || ''}

설명
${content.description || ''}

팟캐스트 80초 기본 대본
${content.podcast_80 || content.podcast_script || content.script || ''}`;
    betaUi.content.hidden = order.length !== 8;
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
    if (betaUi.music.files[0]) body.append('music', betaUi.music.files[0]);
    betaSetStatus('업체정보를 바탕으로 콘텐츠와 실제 대본을 생성하는 중...', 10);
    try {
      const data = await betaRequest('/beta-api/jobs', { method: 'POST', body });
      betaCurrentJobId = data.job.beta_job_id;
      sessionStorage.setItem('storymaker_beta_current_job', betaCurrentJobId);
      betaUi.jobId.textContent = betaCurrentJobId;
      betaUi.gemini.disabled = false;
      betaUi.render.disabled = false;
      betaUi.checkJob.disabled = false;
      betaUi.checkGemini.disabled = false;
      betaUi.supertonic.disabled = false;
      betaUi.checkAssets.disabled = false;
      betaShowContent(data.job);
      betaSetStatus('콘텐츠와 대본 저장 완료. 음성·자막·최종 MP4 제작이 가능합니다.', 20);
    } catch (error) {
      betaSetStatus(`작업 생성 실패: ${error.message}`);
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

  async function betaCreateSupertonicVoice() {
    if (!betaCurrentJobId) return;
    betaUi.supertonic.disabled = true;
    betaSetStatus('Beta 전용 Supertonic 7790에서 실제 음성을 생성하는 중...', 35);
    try {
      const data = await betaRequest(`/beta-api/steps/jobs/${encodeURIComponent(betaCurrentJobId)}/supertonic`, { method: 'POST' });
      betaUi.audio.src = `/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}/file/audio?t=${Date.now()}`;
      betaUi.audio.hidden = false;
      betaUi.debug.textContent = `Supertonic 생성 성공\n${JSON.stringify(data, null, 2)}`;
      betaSetStatus('Beta Supertonic 실제 음성과 MP3 생성 완료.', 45);
    } catch (error) {
      betaUi.debug.textContent = `Supertonic 생성 실패\n${error.message}`;
      betaSetStatus(`Supertonic 실패: ${error.message}`);
      betaUi.supertonic.disabled = false;
    }
  }

  async function betaGenerateGemini() {
    if (!betaCurrentJobId) return;
    betaUi.gemini.disabled = true;
    betaSetStatus('Gemini 웹 Worker 작업을 등록했습니다. 로그인된 Gemini 탭에서 처리 중...', 15);
    try {
      await betaRequest(`/beta-api/gemini-worker/jobs/${encodeURIComponent(betaCurrentJobId)}/queue`, { method: 'POST' });
      const startedAt = Date.now();
      while (Date.now() - startedAt < 240000) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await betaRequest('/beta-api/gemini-worker/status');
        const worker = status.data || {};
        if (worker.job_id !== betaCurrentJobId) continue;
        betaSetStatus(`Gemini 웹 Worker 상태: ${worker.status || '대기 중'}`, worker.status === 'sent' ? 20 : 15);
        if (worker.status === 'error') throw new Error(worker.error || 'Gemini Worker 처리 실패');
        if (worker.status === 'completed') {
          const data = await betaRequest(`/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}`);
          betaShowContent(data.job);
          betaSetStatus('Gemini 웹 Worker가 SNS 8채널과 팟캐스트 대본을 저장했습니다.', 25);
          return;
        }
      }
      throw new Error('Gemini Worker 응답 대기 시간이 초과됐습니다. Gemini 탭과 Tampermonkey를 확인하세요.');
    } catch (error) {
      betaSetStatus(`Gemini 작성 실패: ${error.message}`);
      betaUi.gemini.disabled = false;
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
  betaUi.gemini.addEventListener('click', betaGenerateGemini);
  betaUi.render.addEventListener('click', betaRenderJob);
  betaUi.checkJob.addEventListener('click', () => betaInspect('작업/SNS 8채널 확인'));
  betaUi.checkGemini.addEventListener('click', () => betaInspect('Gemini 반영 확인'));
  betaUi.supertonic.addEventListener('click', betaCreateSupertonicVoice);
  betaUi.checkAssets.addEventListener('click', () => betaInspect('MP3/SRT/MP4 확인'));
  async function betaRestoreCurrentJob() {
    if (!betaCurrentJobId) return;
    betaUi.jobId.textContent = betaCurrentJobId;
    betaUi.gemini.disabled = false;
    betaUi.render.disabled = false;
    betaUi.checkJob.disabled = false;
    betaUi.checkGemini.disabled = false;
    betaUi.supertonic.disabled = false;
    betaUi.checkAssets.disabled = false;
    try {
      const data = await betaRequest(`/beta-api/jobs/${encodeURIComponent(betaCurrentJobId)}`);
      betaShowContent(data.job);
      const order = Array.isArray(data.job?.content?.channel_order) ? data.job.content.channel_order : [];
      betaSetStatus(order.length === 8 ? '저장된 Gemini SNS 8채널을 불러왔습니다.' : '현재 작업을 불러왔습니다. Gemini SNS 8채널 작성을 진행하세요.', order.length === 8 ? 25 : 10);
    } catch (error) {
      betaSetStatus(`현재 작업 불러오기 실패: ${error.message}`);
    }
  }

  betaRestoreCurrentJob();
})();

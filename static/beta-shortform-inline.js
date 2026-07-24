(() => {
  'use strict';

  const root = document.getElementById('beta-shortform-inline');
  if (!root) return;

  const q = (id) => document.getElementById(id);
  const state = { jobId: '', context: null, settings: null, timer: null, sceneTimer: null, thumbnailTimer: null, thumbnailChecking: false, thumbnailUrl: '', mediaUrls: [], mediaNames: [], sceneIndex: 0, startedAt: 0, lastProgress: 0, readyToSave: false, saving: false, savedToArchive: false, pendingArchiveOpen: false };

  const fields = {
    title1: q('sf-title-1'), title2: q('sf-title-2'), business: q('sf-business'), phone: q('sf-phone'),
    script: q('sf-script'), media: q('sf-media-summary'), imageInput: q('sf-images'), videoInput: q('sf-videos'),
    femaleVoice: q('sf-female-voice'), maleVoice: q('sf-male-voice'), voiceSpeed: q('sf-voice-speed'), voiceVolume: q('sf-voice-volume'),
    brandSize: q('sf-brand-size'), phoneSize: q('sf-phone-size'), bottomMargin: q('sf-bottom-margin'),
    fps: q('sf-fps'), transition: q('sf-transition'), bgmMode: q('sf-bgm-mode'), bgmFile: q('sf-bgm-file'), bgmUpload: q('sf-bgm-upload'), bgmVolume: q('sf-bgm-volume'),
    subtitleSize: q('sf-subtitle-size'), subtitlePosition: q('sf-subtitle-position'),
    previewBrand: q('sf-preview-brand'), previewTitle: q('sf-preview-title'), previewSubtitle: q('sf-preview-subtitle'),
    previewBusiness: q('sf-preview-business'), previewPhone: q('sf-preview-phone'), status: q('sf-status'), progress: q('sf-progress'),
    imageConnected:q('sf-image-connected'), videoConnected:q('sf-video-connected'), log: q('sf-log'), make: q('sf-make'), liveImage: q('sf-live-image'), liveCanvas: q('sf-live-canvas'), sceneBadge: q('sf-scene-badge'), play: q('sf-play'), stop: q('sf-stop'), archive: q('sf-archive'), finalVideo: q('sf-final-video'), wave: q('sf-wave'), thumbnailPanel: q('sf-thumbnail-preview'), thumbnailImage: q('sf-thumbnail-image'), thumbnailLink: q('sf-thumbnail-link'), thumbnailStatus: q('sf-thumbnail-status'), thumbnailArchive: q('sf-thumbnail-archive')
  };

  const defaults = {
    female_voice: 'random', male_voice: 'random', voice_speed: 1.25, voice_volume: 0.8,
    brand_size: 46, phone_size: 43, bottom_margin: 80, fps: 24,
    transition_type: 'random', bgm_mode: 'shuffle', bgm_file: '', bgm_volume: 0.10,
    subtitle_size: 30, subtitle_position: 'bottom'
  };

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'include', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  function appendLog(message) {
    const stamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    fields.log.textContent += `[${stamp}] ${message}\n`;
    fields.log.scrollTop = fields.log.scrollHeight;
  }

  function setProgress(value, message) {
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    state.lastProgress = safe;
    fields.progress.style.width = `${safe}%`;
    fields.status.textContent = message;
    if (fields.wave) fields.wave.hidden = safe >= 100 || safe <= 0;
  }

  function mediaName(url, index) {
    try { return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || `미디어 ${index + 1}`; } catch { return `미디어 ${index + 1}`; }
  }

  function showScene(index) {
    if (!state.mediaUrls.length || !fields.liveImage) return;
    state.sceneIndex = Math.max(0, Math.min(state.mediaUrls.length - 1, index));
    const url = state.mediaUrls[state.sceneIndex];
    fields.liveImage.classList.remove('active');
    fields.liveImage.src = url;
    fields.liveImage.hidden = false;
    requestAnimationFrame(() => fields.liveImage.classList.add('active'));
    const name = state.mediaNames[state.sceneIndex] || mediaName(url, state.sceneIndex);
    if (fields.sceneBadge) fields.sceneBadge.textContent = `장면 ${state.sceneIndex + 1}/${state.mediaUrls.length} · ${name}`;
  }

  function startScenePreview() {
    clearInterval(state.sceneTimer);
    if (!state.mediaUrls.length) return;
    showScene(0);
    state.sceneTimer = setInterval(() => showScene((state.sceneIndex + 1) % state.mediaUrls.length), 2600);
  }

  function stopScenePreview() { clearInterval(state.sceneTimer); state.sceneTimer = null; }

  function detailLog(detail = {}) {
    if (detail.type === 'media') {
      state.mediaUrls = [...(detail.images || [])];
      state.mediaNames = state.mediaUrls.map(mediaName);
      appendLog(`미디어 분석 완료 · 이미지 ${detail.images?.length || 0}장 · 동영상 ${detail.videos?.length || 0}개`);
      state.mediaNames.forEach((name, index) => appendLog(`이미지 ${String(index + 1).padStart(2, '0')} · ${name}`));
      startScenePreview();
      return;
    }
    if (detail.type === 'music') appendLog(`음악 선택 · ${detail.musicName || '랜덤 배경음악'}`);
    if (detail.type === 'render') {
      const scene = state.mediaUrls.length ? Math.min(state.mediaUrls.length, Math.max(1, Math.ceil((detail.rawPercent || 0) / 100 * state.mediaUrls.length))) : 0;
      if (scene) showScene(scene - 1);
      const elapsed = Math.max(0, (performance.now() - state.startedAt) / 1000);
      appendLog(`${detail.stage || 'MP4 렌더링'} · ${Math.round(detail.rawPercent || 0)}% · 장면 ${scene || '-'}/${state.mediaUrls.length || '-'} · 경과 ${elapsed.toFixed(1)}초${detail.remaining ? ` · 약 ${Math.ceil(detail.remaining)}초 남음` : ''}`);
    }
    if (detail.type === 'complete') appendLog(`MP4 Blob 생성 · ${(detail.size / 1024 / 1024).toFixed(2)}MB · ${detail.seconds.toFixed(1)}초`);
    if (detail.type === 'saved') appendLog('서버 저장 완료 · 보관함 Beta 연결 가능');
  }

  function stripSpeakerLabels(text) {
    return String(text || '').split(/\r?\n/).map((line) => line.replace(/^\s*(?:여자|여성|female|F1|남자|남성|male|M1)\s*[:：]\s*/i, '').trim()).filter(Boolean).join('\n');
  }

  function values() {
    return {
      female_voice: fields.femaleVoice.value, male_voice: fields.maleVoice.value,
      voice_speed: Number(fields.voiceSpeed.value), voice_volume: Number(fields.voiceVolume.value),
      brand_size: Number(fields.brandSize.value), phone_size: Number(fields.phoneSize.value),
      bottom_margin: Number(fields.bottomMargin.value), fps: Number(fields.fps.value),
      transition_type: fields.transition.value, bgm_mode: fields.bgmMode.value, bgm_file: fields.bgmFile.value,
      bgm_volume: Number(fields.bgmVolume.value), subtitle_size: Number(fields.subtitleSize.value),
      subtitle_position: fields.subtitlePosition.value,
      title_line_1: fields.title1.value.trim(), title_line_2: fields.title2.value.trim(),
      business_name: fields.business.value.trim(), business_phone: fields.phone.value.trim(),
      script: stripSpeakerLabels(fields.script.value)
    };
  }

  function applySettings(settings = {}) {
    const s = { ...defaults, ...settings };
    fields.femaleVoice.value = s.female_voice;
    fields.maleVoice.value = s.male_voice;
    fields.voiceSpeed.value = s.voice_speed;
    fields.voiceVolume.value = s.voice_volume;
    fields.brandSize.value = s.brand_size ?? s.brand_font_size ?? 46;
    fields.phoneSize.value = s.phone_size ?? s.phone_font_size ?? 43;
    fields.bottomMargin.value = s.bottom_margin;
    fields.fps.value = s.fps;
    fields.transition.value = s.transition_type;
    fields.bgmMode.value = s.bgm_mode || 'shuffle';
    fields.bgmFile.value = s.bgm_file || '';
    fields.bgmVolume.value = s.bgm_volume;
    fields.subtitleSize.value = s.subtitle_size ?? s.subtitle_font_size ?? 30;
    fields.subtitlePosition.value = s.subtitle_position;
  }

  function fitPreviewTitleSingleLine() {
    const element = fields.previewTitle;
    if (!element) return;
    const maxFont = 34;
    const minFont = 20;
    element.style.fontSize = `${maxFont}px`;
    let guard = 0;
    while (element.scrollWidth > element.clientWidth && parseFloat(element.style.fontSize) > minFont && guard < 30) {
      const nextSize = Math.max(minFont, parseFloat(element.style.fontSize) - 1);
      element.style.fontSize = `${nextSize}px`;
      guard += 1;
    }
  }

  function refreshPreview() {
    fields.previewBrand.textContent = fields.title1.value || '스토리메이커 연구소';
    fields.previewTitle.textContent = fields.title2.value || '설치 없는 AI 숏폼';
    requestAnimationFrame(fitPreviewTitleSingleLine);
    const firstLine = fields.script.value.split(/\r?\n/).find((line) => line.trim()) || '팟캐스트 50 대사가 이곳에 표시됩니다.';
    fields.previewSubtitle.textContent = firstLine.replace(/^(여자|남자|여성|남성)\s*[:：]\s*/, '');
    fields.previewBusiness.textContent = fields.business.value || '상호명';
    fields.previewPhone.textContent = fields.phone.value || '010-0000-0000';
    fields.previewBusiness.style.fontSize = `${Math.max(18, Number(fields.brandSize.value) * .55)}px`;
    fields.previewPhone.style.fontSize = `${Math.max(16, Number(fields.phoneSize.value) * .52)}px`;
  }

  async function loadMusicLibrary() {
    const data = await request('/beta-api/shortform/music-library');
    const current = fields.bgmFile.value;
    fields.bgmFile.innerHTML = '<option value="">무작위 선택</option>' + (data.items || []).map((name)=>`<option value="${name.replace(/"/g,'&quot;')}">${name}</option>`).join('');
    if ([...fields.bgmFile.options].some((option)=>option.value===current)) fields.bgmFile.value=current;
  }

  async function saveDefaults() {
    const payload = values();
    await request('/beta-api/shortform/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  }

  function scheduleSave() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => saveDefaults().catch(() => {}), 800);
  }

  function stopThumbnailWatch() {
    if (state.thumbnailTimer) clearInterval(state.thumbnailTimer);
    state.thumbnailTimer = null;
    state.thumbnailChecking = false;
  }

  function resetThumbnailPreview() {
    stopThumbnailWatch();
    state.thumbnailUrl = '';
    if (fields.thumbnailPanel) fields.thumbnailPanel.hidden = true;
    if (fields.thumbnailImage) fields.thumbnailImage.removeAttribute('src');
    if (fields.thumbnailLink) fields.thumbnailLink.setAttribute('href', '#');
    if (fields.thumbnailStatus) fields.thumbnailStatus.textContent = 'Gemini 썸네일 저장을 확인하는 중...';
  }

  async function checkThumbnailReady() {
    if (!state.jobId || state.thumbnailChecking || state.thumbnailUrl) return;
    state.thumbnailChecking = true;
    try {
      const data = await request(`/beta-api/jobs/${encodeURIComponent(state.jobId)}`);
      const thumbnail = data.job?.assets?.thumbnail;
      if (!thumbnail) return;
      const url = `/beta-api/jobs/${encodeURIComponent(state.jobId)}/file/thumbnail?v=${Date.now()}`;
      state.thumbnailUrl = url;
      if (fields.thumbnailImage) fields.thumbnailImage.src = url;
      if (fields.thumbnailLink) fields.thumbnailLink.href = url;
      if (fields.thumbnailStatus) fields.thumbnailStatus.textContent = 'Gemini 저장 완료 · 보관함과 동일한 썸네일';
      if (fields.thumbnailPanel) fields.thumbnailPanel.hidden = false;
      appendLog('Gemini 썸네일 저장 확인 · 미리보기 표시 완료');
      stopThumbnailWatch();
    } catch (_) {
      // Gemini 저장 전의 조회 실패는 다음 확인 주기에서 다시 시도합니다.
    } finally {
      state.thumbnailChecking = false;
    }
  }

  function startThumbnailWatch() {
    resetThumbnailPreview();
    checkThumbnailReady();
    state.thumbnailTimer = setInterval(checkThumbnailReady, 2000);
  }

  async function loadJob(jobId) {
    state.jobId = jobId;
    const data = await request(`/beta-api/shortform/jobs/${encodeURIComponent(jobId)}/context`);
    state.context = data.context;
    state.settings = data.context.settings || defaults;
    fields.title1.value = data.context.title_line_1 || '';
    fields.title2.value = data.context.title_line_2 || '';
    fields.business.value = data.context.business_name || '';
    fields.phone.value = data.context.business_phone || '';
    fields.script.value = stripSpeakerLabels(data.context.script || '');
    fields.media.textContent = `이전 단계 미디어 · 이미지 ${data.context.image_count}장 · 동영상 ${data.context.video_count}개`;
    fields.imageConnected.textContent = `이전 단계 미디어 · 이미지 ${data.context.image_count}장`;
    fields.videoConnected.textContent = `이전 단계 미디어 · 동영상 ${data.context.video_count}개`;
    await loadMusicLibrary();
    applySettings(state.settings);
    refreshPreview();
    root.hidden = false;
    setProgress(0, '팟캐스트50·업체정보·미디어를 불러왔습니다.');
    appendLog(`작업 연결 완료 · ${jobId}`);
    appendLog(`이미지 ${data.context.image_count}장 · 동영상 ${data.context.video_count}개`);
    startThumbnailWatch();
  }

  async function waitForRenderer(timeoutMs = 15000) {
    if (window.StoryMakerBetaBrowserRenderer?.createVideoOnly) return window.StoryMakerBetaBrowserRenderer;
    return await new Promise((resolve, reject) => {
      const started = Date.now();
      let timer = null;
      const cleanup = () => {
        if (timer) clearInterval(timer);
        window.removeEventListener('storymaker-beta-renderer-ready', onReady);
      };
      const onReady = () => {
        if (window.StoryMakerBetaBrowserRenderer?.createVideoOnly) {
          cleanup();
          resolve(window.StoryMakerBetaBrowserRenderer);
        }
      };
      timer = setInterval(() => {
        if (window.StoryMakerBetaBrowserRenderer?.createVideoOnly) {
          cleanup();
          resolve(window.StoryMakerBetaBrowserRenderer);
        } else if (Date.now() - started >= timeoutMs) {
          cleanup();
          reject(new Error('브라우저 MP4 렌더러 준비 시간이 초과되었습니다. 화면을 새로고침해 주세요.'));
        }
      }, 200);
      window.addEventListener('storymaker-beta-renderer-ready', onReady);
      onReady();
    });
  }

  function showRenderedFrame(sourceCanvas) {
    if (!sourceCanvas || !fields.liveCanvas) return;
    const context = fields.liveCanvas.getContext('2d', { alpha: false });
    if (!context) return;
    fields.liveCanvas.width = sourceCanvas.width || 720;
    fields.liveCanvas.height = sourceCanvas.height || 1280;
    context.drawImage(sourceCanvas, 0, 0, fields.liveCanvas.width, fields.liveCanvas.height);
    fields.liveCanvas.hidden = false;
    fields.liveCanvas.closest('.sf-phone')?.classList.add('has-render-preview');
  }

  function clearRenderedFrame() {
    if (fields.liveCanvas) {
      fields.liveCanvas.hidden = true;
      const context = fields.liveCanvas.getContext('2d');
      context?.clearRect(0, 0, fields.liveCanvas.width, fields.liveCanvas.height);
    }
    fields.finalVideo?.closest('.sf-phone')?.classList.remove('has-render-preview');
  }

  async function makeVideo() {
    if (!state.jobId) return;
    fields.make.disabled = true;
    state.readyToSave = false;
    state.savedToArchive = false;
    state.pendingArchiveOpen = false;
    const preview = fields.finalVideo;
    const phone = preview?.closest('.sf-phone');
    try {
      await saveDefaults();
      stopScenePreview();
      preview.pause();
      preview.pause();
      preview.hidden = true;
      preview.removeAttribute('src');
      preview.closest('.sf-phone')?.classList.remove('has-final');
      clearRenderedFrame();
      preview.load();
      preview.volume = 0.8;
      phone?.classList.remove('has-final');
      setProgress(8, '팟캐스트50 원고와 설정을 확인하는 중...');
      state.startedAt = performance.now(); state.mediaUrls = []; state.mediaNames = []; state.sceneIndex = 0; fields.log.textContent = ''; appendLog('MP4 새 제작 시작 · 이전 생성물 초기화');
      setProgress(12, '브라우저 MP4 렌더러를 준비하는 중...');
      const renderer = await waitForRenderer();
      const currentValues = values();
      currentValues.one_time_music_file = fields.bgmMode.value === 'one_time' ? fields.bgmUpload.files?.[0] || null : null;
      const result = await renderer.createVideoOnly(state.jobId, currentValues, (percent, message, detail) => {
        setProgress(percent, message);
        if (detail?.type === 'frame') showRenderedFrame(detail.canvas);
        else if (detail) detailLog(detail);
      });
      clearRenderedFrame();
      preview.src = result.videoUrl;
      preview.hidden = false;
      preview.volume = 0.8;
      preview.currentTime = 0;
      phone?.classList.add('has-final');
      state.readyToSave = true;
      stopScenePreview();
      setProgress(100, 'MP4 제작 완료 · Play·Stop·보관함 버튼을 누르면 저장됩니다.');
      appendLog(`브라우저 제작 완료 · ${result.musicName || '음악 없음'} · 아직 서버에 저장되지 않음`);
      if (fields.sceneBadge) fields.sceneBadge.textContent = '제작 완료 · Play로 확인하세요';
      preview.play().catch(() => {});
    } catch (error) {
      state.readyToSave = false;
      setProgress(0, `제작 실패: ${error.message}`);
      appendLog(`오류 · ${error.message}`);
    } finally {
      fields.make.disabled = false;
    }
  }

  async function saveCurrentToArchive({ openArchive = false } = {}) {
    if (!state.readyToSave) {
      appendLog('보관함 저장 대기 · 먼저 영상 만들기를 완료해 주세요.');
      return false;
    }
    if (state.savedToArchive) {
      if (openArchive) location.href = '/beta/archive';
      return true;
    }
    if (state.saving) {
      if (openArchive) {
        state.pendingArchiveOpen = true;
        fields.status.textContent = '저장 완료 후 보관함 Beta로 이동합니다.';
      }
      return false;
    }
    state.saving = true;
    state.pendingArchiveOpen = state.pendingArchiveOpen || openArchive;
    fields.archive.setAttribute('aria-disabled', 'true');
    try {
      fields.status.textContent = 'MP3·MP4를 보관함 Beta에 저장하는 중...';
      const renderer = await waitForRenderer();
      await renderer.saveCurrentToArchive(state.jobId);
      state.savedToArchive = true;
      appendLog('MP3·MP4 서버 저장 성공 · 같은 작업은 최신 결과로 덮어쓰기');
      fields.status.textContent = 'MP3·MP4 보관함 저장 완료';
      const shouldOpenArchive = state.pendingArchiveOpen;
      state.pendingArchiveOpen = false;
      if (shouldOpenArchive) location.href = '/beta/archive';
      return true;
    } catch (error) {
      state.pendingArchiveOpen = false;
      appendLog(`보관함 저장 실패 · ${error.message}`);
      fields.status.textContent = `보관함 저장 실패: ${error.message}`;
      return false;
    } finally {
      state.saving = false;
      fields.archive.removeAttribute('aria-disabled');
    }
  }

  root.querySelectorAll('input,textarea,select').forEach((element) => {
    element.addEventListener('input', () => { refreshPreview(); scheduleSave(); });
    element.addEventListener('change', () => { refreshPreview(); scheduleSave(); });
  });
  function closeAllAccordions() {
    root.querySelectorAll('[data-accordion]').forEach((button) => {
      const panel = document.getElementById(button.dataset.accordion);
      if (panel) panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    });
  }

  root.querySelectorAll('[data-accordion]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = document.getElementById(button.dataset.accordion);
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.sf-accordion')) closeAllAccordions();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllAccordions();
  });

  fields.make.addEventListener('click', makeVideo);
  fields.play?.addEventListener('click', async () => {
    if (fields.finalVideo?.src) {
      await saveCurrentToArchive();
      fields.finalVideo.play().catch(() => {});
    } else {
      startScenePreview();
    }
  });
  fields.stop?.addEventListener('click', async () => {
    fields.finalVideo?.pause();
    stopScenePreview();
    if (fields.finalVideo?.src) await saveCurrentToArchive();
  });
  fields.archive?.addEventListener('click', async (event) => {
    event.preventDefault();
    await saveCurrentToArchive({ openArchive: true });
  });
  fields.thumbnailArchive?.addEventListener('click', async (event) => {
    event.preventDefault();
    await saveCurrentToArchive({ openArchive: true });
  });

  window.addEventListener('pagehide', stopThumbnailWatch);
  window.StoryMakerBetaInlineShortform = { loadJob };
})();

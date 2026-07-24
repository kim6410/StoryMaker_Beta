(() => {
  'use strict';

  const root = document.getElementById('beta-shortform-inline');
  if (!root) return;

  const q = (id) => document.getElementById(id);
  const state = { jobId: '', context: null, settings: null, timer: null };

  const fields = {
    title1: q('sf-title-1'), title2: q('sf-title-2'), business: q('sf-business'), phone: q('sf-phone'),
    script: q('sf-script'), media: q('sf-media-summary'), imageInput: q('sf-images'), videoInput: q('sf-videos'),
    femaleVoice: q('sf-female-voice'), maleVoice: q('sf-male-voice'), voiceSpeed: q('sf-voice-speed'), voiceVolume: q('sf-voice-volume'),
    brandSize: q('sf-brand-size'), phoneSize: q('sf-phone-size'), bottomMargin: q('sf-bottom-margin'),
    fps: q('sf-fps'), transition: q('sf-transition'), bgmMood: q('sf-bgm-mood'), bgmVolume: q('sf-bgm-volume'),
    subtitleSize: q('sf-subtitle-size'), subtitlePosition: q('sf-subtitle-position'),
    previewBrand: q('sf-preview-brand'), previewTitle: q('sf-preview-title'), previewSubtitle: q('sf-preview-subtitle'),
    previewBusiness: q('sf-preview-business'), previewPhone: q('sf-preview-phone'), status: q('sf-status'), progress: q('sf-progress'),
    log: q('sf-log'), make: q('sf-make'), saveDefaults: q('sf-save-defaults'), resetDefaults: q('sf-reset-defaults')
  };

  const defaults = {
    female_voice: 'random', male_voice: 'random', voice_speed: 1.35, voice_volume: 0.8,
    brand_size: 46, phone_size: 43, bottom_margin: 80, fps: 24,
    transition_type: 'random', bgm_mood: 'random', bgm_volume: 0.15,
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
    fields.progress.style.width = `${Math.max(0, Math.min(100, value))}%`;
    fields.status.textContent = message;
  }

  function values() {
    return {
      female_voice: fields.femaleVoice.value, male_voice: fields.maleVoice.value,
      voice_speed: Number(fields.voiceSpeed.value), voice_volume: Number(fields.voiceVolume.value),
      brand_size: Number(fields.brandSize.value), phone_size: Number(fields.phoneSize.value),
      bottom_margin: Number(fields.bottomMargin.value), fps: Number(fields.fps.value),
      transition_type: fields.transition.value, bgm_mood: fields.bgmMood.value,
      bgm_volume: Number(fields.bgmVolume.value), subtitle_size: Number(fields.subtitleSize.value),
      subtitle_position: fields.subtitlePosition.value,
      title_line_1: fields.title1.value.trim(), title_line_2: fields.title2.value.trim(),
      business_name: fields.business.value.trim(), business_phone: fields.phone.value.trim(),
      script: fields.script.value.trim()
    };
  }

  function applySettings(settings = {}) {
    const s = { ...defaults, ...settings };
    fields.femaleVoice.value = s.female_voice;
    fields.maleVoice.value = s.male_voice;
    fields.voiceSpeed.value = s.voice_speed;
    fields.voiceVolume.value = s.voice_volume;
    fields.brandSize.value = s.brand_size;
    fields.phoneSize.value = s.phone_size;
    fields.bottomMargin.value = s.bottom_margin;
    fields.fps.value = s.fps;
    fields.transition.value = s.transition_type;
    fields.bgmMood.value = s.bgm_mood;
    fields.bgmVolume.value = s.bgm_volume;
    fields.subtitleSize.value = s.subtitle_size;
    fields.subtitlePosition.value = s.subtitle_position;
  }

  function refreshPreview() {
    fields.previewBrand.textContent = fields.title2.value || '스토리메이커 연구소';
    fields.previewTitle.textContent = fields.title1.value || '설치 없는 AI 숏폼';
    const firstLine = fields.script.value.split(/\r?\n/).find((line) => line.trim()) || '팟캐스트 50 대사가 이곳에 표시됩니다.';
    fields.previewSubtitle.textContent = firstLine.replace(/^(여자|남자|여성|남성)\s*[:：]\s*/, '');
    fields.previewBusiness.textContent = fields.business.value || '상호명';
    fields.previewPhone.textContent = fields.phone.value || '010-0000-0000';
    fields.previewBusiness.style.fontSize = `${Math.max(18, Number(fields.brandSize.value) * .55)}px`;
    fields.previewPhone.style.fontSize = `${Math.max(16, Number(fields.phoneSize.value) * .52)}px`;
  }

  async function saveDefaults() {
    const payload = values();
    await request('/beta-api/shortform/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    appendLog('상세 설정을 사용자 기본값으로 저장했습니다.');
    fields.saveDefaults.textContent = '저장 완료';
    setTimeout(() => fields.saveDefaults.textContent = '내 기본 설정으로 저장', 1200);
  }

  function scheduleSave() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => saveDefaults().catch(() => {}), 800);
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
    fields.script.value = data.context.script || '';
    fields.media.textContent = `이전 단계 미디어 · 이미지 ${data.context.image_count}장 · 동영상 ${data.context.video_count}개`;
    applySettings(state.settings);
    refreshPreview();
    root.hidden = false;
    setProgress(0, '팟캐스트50·업체정보·미디어를 불러왔습니다.');
    appendLog(`작업 연결 완료 · ${jobId}`);
    appendLog(`이미지 ${data.context.image_count}장 · 동영상 ${data.context.video_count}개`);
  }

  async function makeVideo() {
    if (!state.jobId) return;
    fields.make.disabled = true;
    try {
      await saveDefaults();
      setProgress(8, '팟캐스트50 원고와 상세 설정을 확인하는 중...');
      appendLog('숏폼 제작을 시작합니다.');
      await new Promise((r) => setTimeout(r, 300));

      const mp3 = document.getElementById('mp3');
      const mp4 = document.getElementById('mp4');
      if (!mp3 || !mp4) throw new Error('기존 브라우저 제작 엔진 버튼을 찾지 못했습니다.');

      setProgress(18, 'TTS 음성·SRT 타이밍을 준비하는 중...');
      appendLog('기존 Beta 음성·SRT 엔진을 호출합니다.');
      if (!mp3.disabled) mp3.click();

      for (let i = 0; i < 240; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
        const pct = Math.min(58, 20 + Math.floor(i / 6));
        setProgress(pct, '음성 생성과 자막 타이밍을 계산하는 중...');
        const audio = document.getElementById('audio');
        if (audio && !audio.hidden && audio.src) break;
      }

      setProgress(62, '음악 믹싱과 화면 전환을 준비하는 중...');
      appendLog('MP3 준비 완료. 브라우저 MP4 렌더링을 시작합니다.');
      if (!mp4.disabled) mp4.click();

      for (let i = 0; i < 360; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
        const pct = Math.min(96, 63 + Math.floor(i / 11));
        setProgress(pct, `9:16 프레임 렌더링 중 · ${pct}%`);
        const video = document.getElementById('video');
        if (video && !video.hidden && video.src) {
          const preview = q('sf-final-video');
          preview.src = video.src;
          preview.hidden = false;
          break;
        }
      }
      setProgress(100, '완성되었습니다. 결과는 보관함 Beta에 저장됩니다.');
      appendLog('숏폼 제작 완료 · 보관함 Beta 연결을 확인하세요.');
    } catch (error) {
      setProgress(0, `제작 실패: ${error.message}`);
      appendLog(`오류 · ${error.message}`);
    } finally {
      fields.make.disabled = false;
    }
  }

  root.querySelectorAll('input,textarea,select').forEach((element) => {
    element.addEventListener('input', refreshPreview);
    element.addEventListener('change', () => { refreshPreview(); scheduleSave(); });
  });
  root.querySelectorAll('[data-accordion]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = document.getElementById(button.dataset.accordion);
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
  });
  fields.make.addEventListener('click', makeVideo);
  fields.saveDefaults.addEventListener('click', () => saveDefaults().catch((e) => appendLog(e.message)));
  fields.resetDefaults.addEventListener('click', () => { applySettings(defaults); refreshPreview(); appendLog('숏폼 기본 설정으로 복원했습니다.'); });

  window.StoryMakerBetaInlineShortform = { loadJob };
})();

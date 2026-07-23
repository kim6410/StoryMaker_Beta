(() => {
  'use strict';

  const list = document.getElementById('beta-archive-list');
  const detail = document.getElementById('beta-archive-detail');
  const modal = document.getElementById('beta-archive-modal');
  const search = document.getElementById('beta-archive-search');
  const refresh = document.getElementById('beta-archive-refresh');
  const filter = document.getElementById('beta-archive-filter');
  const sort = document.getElementById('beta-archive-sort');
  const statTotal = document.getElementById('archive-stat-total');
  const statCompleted = document.getElementById('archive-stat-completed');
  const statMp3 = document.getElementById('archive-stat-mp3');
  const statMp4 = document.getElementById('archive-stat-mp4');
  let jobs = [];

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  async function req(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  function flags(job) {
    const assets = job.assets || {};
    return {
      sns: Object.keys(job.content?.channels || {}).length === 8,
      images: Boolean(assets.images?.length),
      mp3: Boolean(assets.browser_audio || assets.audio),
      srt: Boolean(assets.subtitle),
      thumb: Boolean(assets.thumbnail),
      mp4: Boolean(assets.browser_video || assets.video)
    };
  }

  const badge = (label, ready) => `<span class="asset-badge ${ready ? 'ready' : 'waiting'}">${esc(label)}</span>`;

  function renderStats() {
    const allFlags = jobs.map(flags);
    statTotal.textContent = String(jobs.length);
    statCompleted.textContent = String(jobs.filter((job) => String(job.status || '').toLowerCase() === 'completed').length);
    statMp3.textContent = String(allFlags.filter((item) => item.mp3).length);
    statMp4.textContent = String(allFlags.filter((item) => item.mp4).length);
  }

  function formatDate(value) {
    const raw = String(value || '');
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw || '날짜 미등록';
    return new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(date);
  }

  function renderList() {
    const query = String(search?.value || '').trim().toLowerCase();
    const mode = filter?.value || 'all';
    let filtered = jobs.filter((job) => {
      const f = flags(job);
      const queryMatch = !query || [job.title, job.beta_job_id, job.business?.name, job.business?.region]
        .some((value) => String(value || '').toLowerCase().includes(query));
      if (!queryMatch) return false;
      if (mode === 'completed') return String(job.status || '').toLowerCase() === 'completed';
      if (mode === 'working') return String(job.status || '').toLowerCase() !== 'completed';
      if (mode === 'media') return f.mp3 || f.mp4 || f.thumb;
      return true;
    });
    const sortMode = sort?.value || 'newest';
    filtered = [...filtered].sort((a, b) => {
      if (sortMode === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      if (sortMode === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    renderStats();
    if (!filtered.length) {
      list.className = 'empty';
      list.textContent = jobs.length ? '검색 결과가 없습니다.' : 'Beta 제작 결과가 아직 없습니다.';
      return;
    }
    list.className = 'archive-grid';
    list.innerHTML = filtered.map((job) => {
      const f = flags(job);
      const firstImage = job.assets?.images?.length ? `/beta-api/browser/jobs/${encodeURIComponent(job.beta_job_id)}/image/1` : '';
      const thumb = job.assets?.thumbnail ? `/beta-api/jobs/${encodeURIComponent(job.beta_job_id)}/file/thumbnail` : firstImage;
      const assetButton = (label, ready) => `<span class="asset-button ${ready ? 'ready' : 'waiting'}">${esc(label)}</span>`;
      return `<article class="archive-card">
        ${thumb ? `<button type="button" class="archive-thumb-button" data-open-job="${esc(job.beta_job_id)}"><img class="archive-thumb" loading="lazy" src="${thumb}" alt="미리보기"></button>` : `<button type="button" class="archive-thumb-placeholder" data-open-job="${esc(job.beta_job_id)}">미리보기 없음</button>`}
        <div class="archive-main">
          <div class="card-head"><button type="button" class="archive-title-button" data-open-job="${esc(job.beta_job_id)}">${esc(job.title || 'Beta 제작')}</button><span class="status-pill">${esc(job.status || 'created')}</span></div>
          <p class="card-summary">${esc(job.business?.name || '업체 미등록')} · ${esc(job.business?.region || '지역 미등록')} · 이미지 ${job.assets?.images?.length || 0}장</p>
          <div class="archive-date">${esc(formatDate(job.created_at))}</div>
          <div class="job-id">${esc(job.beta_job_id)}</div>
        </div>
        <div class="archive-assets">
          ${assetButton('SNS', f.sns)}${assetButton('이미지', f.images)}${assetButton('MP3', f.mp3)}${assetButton('SRT', f.srt)}${assetButton('썸네일', f.thumb)}${assetButton('MP4', f.mp4)}
          <div class="delete-wrap">
            <button type="button" class="delete-button" data-delete-job="${esc(job.beta_job_id)}">삭제</button>
            <div class="delete-confirm" data-confirm-for="${esc(job.beta_job_id)}" hidden><span>완전히 삭제할까요?</span><button type="button" data-delete-yes="${esc(job.beta_job_id)}">예</button><button type="button" data-delete-no="${esc(job.beta_job_id)}">아니오</button></div>
          </div>
        </div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-open-job]').forEach((button) => button.addEventListener('click', () => openDetail(button.dataset.openJob)));
    list.querySelectorAll('[data-delete-job]').forEach((button) => button.addEventListener('click', () => {
      list.querySelectorAll('.delete-confirm').forEach((box) => { if (box.dataset.confirmFor !== button.dataset.deleteJob) box.hidden = true; });
      const box = list.querySelector(`[data-confirm-for="${CSS.escape(button.dataset.deleteJob)}"]`);
      if (!box) return;
      box.hidden = !box.hidden;
      if (!box.hidden) {
        const yesButton = box.querySelector('[data-delete-yes]');
        requestAnimationFrame(() => yesButton?.focus({ preventScroll: true }));
      }
    }));
    list.querySelectorAll('[data-delete-no]').forEach((button) => button.addEventListener('click', () => {
      const box = button.closest('.delete-confirm'); if (box) box.hidden = true;
    }));
    list.querySelectorAll('[data-delete-yes]').forEach((button) => button.addEventListener('click', () => deleteJob(button.dataset.deleteYes, button)));
  }

  async function deleteJob(jobId, button) {
    if (!jobId || button.disabled) return;
    button.disabled = true;
    button.textContent = '삭제 중';
    try {
      await req(`/beta-api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      jobs = jobs.filter((job) => job.beta_job_id !== jobId);
      renderList();
    } catch (error) {
      button.disabled = false;
      button.textContent = '예';
      alert(`삭제 실패: ${error.message}`);
    }
  }

  async function openDetail(jobId) {
    modal.hidden = false;
    document.body.classList.add('archive-modal-open');
    detail.innerHTML = '<div class="empty">상세 자료를 불러오는 중...</div>';
    try {
      const job = (await req(`/beta-api/jobs/${encodeURIComponent(jobId)}`)).job || {};
      const assets = job.assets || {};
      const channels = job.content?.channels || {};
      const order = job.content?.channel_order || Object.keys(channels);
      const first = order[0] || '';
      const audioUrl = assets.browser_audio ? `/beta-api/browser/jobs/${encodeURIComponent(jobId)}/file/mp3` : assets.audio ? `/beta-api/jobs/${encodeURIComponent(jobId)}/file/audio` : '';
      const videoUrl = assets.browser_video ? `/beta-api/browser/jobs/${encodeURIComponent(jobId)}/file/mp4` : assets.video ? `/beta-api/jobs/${encodeURIComponent(jobId)}/file/video` : '';
      const subtitleUrl = assets.subtitle ? `/beta-api/jobs/${encodeURIComponent(jobId)}/file/subtitle` : '';
      const thumbnailUrl = assets.thumbnail ? `/beta-api/jobs/${encodeURIComponent(jobId)}/file/thumbnail` : '';
      const images = assets.images || [];
      detail.innerHTML = `<div class="detail-head"><div><div class="badge">BETA ARCHIVE DETAIL</div><h2>${esc(job.title || 'Beta 제작')}</h2><p>${esc(job.business?.name || '')} · ${esc(job.business?.region || '')} · ${esc(job.business?.service || '')}</p></div><button id="archive-detail-close" type="button">닫기</button></div>
        <section class="detail-block"><h3>SNS 8채널</h3><div class="channel-tabs">${order.map((key, index) => `<button type="button" class="channel-tab${index === 0 ? ' active' : ''}" data-channel="${esc(key)}">${esc(channels[key]?.label || key)}</button>`).join('')}</div><pre id="archive-channel-content" class="channel-content">${esc(channels[first]?.content || '')}</pre></section>
        <div class="archive-sections archive-sections-all">
          <button type="button" class="media-open-all" id="archive-media-open-all">제작 데이터 전체 열기</button>
          <div id="archive-media-all" class="archive-media-all" hidden>
            <section class="archive-section-static"><h3>업로드 이미지 ${images.length}장</h3><div class="image-grid">${images.map((_, index) => `<a href="/beta-api/browser/jobs/${encodeURIComponent(jobId)}/image/${index + 1}" target="_blank"><img loading="lazy" src="/beta-api/browser/jobs/${encodeURIComponent(jobId)}/image/${index + 1}" alt="이미지 ${index + 1}"></a>`).join('') || '<div class="empty-mini">이미지가 없습니다.</div>'}</div></section>
            <section class="archive-section-static"><h3>팟캐스트 MP3</h3>${audioUrl ? `<a class="download-link" href="${audioUrl}" target="_blank" download>MP3 다운로드</a>` : '<div class="empty-mini">MP3가 없습니다.</div>'}</section>
            <section class="archive-section-static"><h3>썸네일</h3>${thumbnailUrl ? `<a href="${thumbnailUrl}" target="_blank"><img class="thumbnail-preview" src="${thumbnailUrl}" alt="썸네일"></a>` : '<div class="empty-mini">썸네일이 없습니다.</div>'}</section>
            <section class="archive-section-static"><h3>최종 MP4</h3>${videoUrl ? `<video controls src="${videoUrl}"></video><a class="download-link" href="${videoUrl}" target="_blank">MP4 열기</a>` : '<div class="empty-mini">MP4가 없습니다.</div>'}</section>
          </div>
        </div>`;
      document.getElementById('archive-detail-close')?.addEventListener('click', closeDetail);
      document.getElementById('archive-media-open-all')?.addEventListener('click', (event) => {
        const all = document.getElementById('archive-media-all');
        if (!all) return;
        all.hidden = !all.hidden;
        event.currentTarget.textContent = all.hidden ? '제작 데이터 전체 열기' : '제작 데이터 전체 닫기';
      });
      detail.querySelectorAll('[data-channel]').forEach((button) => button.addEventListener('click', () => {
        detail.querySelectorAll('[data-channel]').forEach((item) => item.classList.toggle('active', item === button));
        document.getElementById('archive-channel-content').textContent = channels[button.dataset.channel]?.content || '';
      }));
    } catch (error) {
      detail.innerHTML = `<div class="empty">상세 조회 실패: ${esc(error.message)}</div>`;
    }
  }

  function closeDetail() {
    modal.hidden = true;
    document.body.classList.remove('archive-modal-open');
    detail.innerHTML = '';
  }

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeDetail();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeDetail();
  });

  async function load() {
    list.className = 'empty'; list.textContent = '불러오는 중...';
    try {
      const summaries = (await req('/beta-api/jobs')).items || [];
      jobs = await Promise.all(summaries.map(async (item) => {
        try { return { ...item, ...(await req(`/beta-api/jobs/${encodeURIComponent(item.beta_job_id)}`)).job }; }
        catch (_) { return item; }
      }));
      jobs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      renderList();
    } catch (error) {
      list.className = 'empty'; list.textContent = `보관함 조회 실패: ${error.message}`;
    }
  }

  search?.addEventListener('input', renderList);
  filter?.addEventListener('change', renderList);
  sort?.addEventListener('change', renderList);
  refresh?.addEventListener('click', load);
  load();
})();

(() => {
  'use strict';

  const list = document.getElementById('beta-archive-list');
  const detail = document.getElementById('beta-archive-detail');
  const search = document.getElementById('beta-archive-search');
  const refresh = document.getElementById('beta-archive-refresh');
  let jobs = [];

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  async function req(url) {
    const response = await fetch(url, { cache: 'no-store' });
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

  function renderList() {
    const query = String(search?.value || '').trim().toLowerCase();
    const filtered = jobs.filter((job) => !query || [job.title, job.beta_job_id, job.business?.name, job.business?.region]
      .some((value) => String(value || '').toLowerCase().includes(query)));
    if (!filtered.length) {
      list.className = 'empty';
      list.textContent = jobs.length ? '검색 결과가 없습니다.' : 'Beta 제작 결과가 아직 없습니다.';
      return;
    }
    list.className = 'archive-grid';
    list.innerHTML = filtered.map((job) => {
      const f = flags(job);
      return `<article class="archive-card">
        <div class="card-head"><h3>${esc(job.title || 'Beta 제작')}</h3><span class="status-pill">${esc(job.status || 'created')}</span></div>
        <p>${esc(job.business?.name || '업체 미등록')} · ${esc(job.business?.region || '지역 미등록')} · 이미지 ${job.assets?.images?.length || 0}장</p>
        <div class="asset-row">${badge('SNS 8채널', f.sns)}${badge('이미지', f.images)}${badge('MP3', f.mp3)}${badge('SRT', f.srt)}${badge('썸네일', f.thumb)}${badge('MP4', f.mp4)}</div>
        <div class="job-id">${esc(job.beta_job_id)}</div>
        <button type="button" class="detail-button" data-job="${esc(job.beta_job_id)}">상세 보기</button>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-job]').forEach((button) => button.addEventListener('click', () => openDetail(button.dataset.job)));
  }

  async function openDetail(jobId) {
    detail.hidden = false;
    detail.innerHTML = '<div class="empty">상세 자료를 불러오는 중...</div>';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        <section class="detail-block"><h3>업로드 이미지 ${images.length}장</h3><div class="image-grid">${images.map((_, index) => `<a href="/beta-api/browser/jobs/${encodeURIComponent(jobId)}/image/${index + 1}" target="_blank"><img loading="lazy" src="/beta-api/browser/jobs/${encodeURIComponent(jobId)}/image/${index + 1}" alt="이미지 ${index + 1}"></a>`).join('') || '<div class="empty-mini">이미지가 없습니다.</div>'}</div></section>
        <div class="media-grid">
          <section class="detail-block"><h3>팟캐스트 MP3</h3>${audioUrl ? `<audio controls src="${audioUrl}"></audio><a class="download-link" href="${audioUrl}" target="_blank">MP3 열기</a>` : '<div class="empty-mini">MP3가 없습니다.</div>'}</section>
          <section class="detail-block"><h3>자막 SRT</h3>${subtitleUrl ? `<a class="download-link" href="${subtitleUrl}" target="_blank">SRT 보기·다운로드</a>` : '<div class="empty-mini">SRT가 없습니다.</div>'}</section>
          <section class="detail-block"><h3>썸네일</h3>${thumbnailUrl ? `<a href="${thumbnailUrl}" target="_blank"><img class="thumbnail-preview" src="${thumbnailUrl}" alt="썸네일"></a>` : '<div class="empty-mini">썸네일이 없습니다.</div>'}</section>
          <section class="detail-block"><h3>최종 MP4</h3>${videoUrl ? `<video controls src="${videoUrl}"></video><a class="download-link" href="${videoUrl}" target="_blank">MP4 열기</a>` : '<div class="empty-mini">MP4가 없습니다.</div>'}</section>
        </div>`;
      document.getElementById('archive-detail-close')?.addEventListener('click', () => { detail.hidden = true; });
      detail.querySelectorAll('[data-channel]').forEach((button) => button.addEventListener('click', () => {
        detail.querySelectorAll('[data-channel]').forEach((item) => item.classList.toggle('active', item === button));
        document.getElementById('archive-channel-content').textContent = channels[button.dataset.channel]?.content || '';
      }));
    } catch (error) {
      detail.innerHTML = `<div class="empty">상세 조회 실패: ${esc(error.message)}</div>`;
    }
  }

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
  refresh?.addEventListener('click', load);
  load();
})();

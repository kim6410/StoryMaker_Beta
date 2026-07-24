let betaRenderBrowserShortform = null;

async function loadBetaRenderBrowserShortform() {
  if (betaRenderBrowserShortform) return betaRenderBrowserShortform;
  const module = await import('./assets/beta-mediabunny-webcodecs-renderer-20260724.js?v=20260724-user-settings-transition-position-1');
  if (typeof module.c !== 'function') throw new Error('Beta Mediabunny/WebCodecs 렌더 함수를 찾지 못했습니다.');
  betaRenderBrowserShortform = module.c;
  return betaRenderBrowserShortform;
}

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = { job:$('job'), load:$('load'), mp3:$('mp3'), mp4:$('mp4'), upload:$('upload'), diag:$('diag'), status:$('status'), canvas:$('canvas'), audio:$('audio'), video:$('video'), podcastProgressWrap:$('podcast-progress-wrap'), podcastProgressBar:$('podcast-progress-bar'), podcastProgressText:$('podcast-progress-text'), slideshowProgressWrap:$('slideshow-progress-wrap'), slideshowProgressBar:$('slideshow-progress-bar'), slideshowProgressText:$('slideshow-progress-text'), thumbnailImage:$('thumbnail-live-image'), thumbnailStatus:$('thumbnail-live-status') };
  const ctx = ui.canvas.getContext('2d');
  let manifest = null, mp3Blob = null, mp4Blob = null, subtitles = [];
  const gpu = { ready:false, canvas:null, context:null, device:null, pipeline:null, sampler:null, uniformBuffer:null, textures:[] };
  const progressTimers = { podcast:null, slideshow:null };

  function setProgress(kind, percent, state='running') {
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const wrap = kind === 'podcast' ? ui.podcastProgressWrap : ui.slideshowProgressWrap;
    const bar = kind === 'podcast' ? ui.podcastProgressBar : ui.slideshowProgressBar;
    const text = kind === 'podcast' ? ui.podcastProgressText : ui.slideshowProgressText;
    if (!wrap || !bar || !text) return;
    wrap.hidden = false;
    wrap.classList.toggle('complete', state === 'complete');
    wrap.classList.toggle('error', state === 'error');
    bar.style.width = `${safe}%`;
    text.textContent = `${safe}%`;
  }

  function startPreparingProgress(kind, initial=2, cap=18) {
    if (progressTimers[kind]) clearInterval(progressTimers[kind]);
    let value = initial;
    setProgress(kind, value);
    progressTimers[kind] = setInterval(() => {
      value = Math.min(cap, value + Math.max(1, Math.round((cap - value) * 0.18)));
      setProgress(kind, value);
    }, 280);
  }

  function stopPreparingProgress(kind) {
    if (progressTimers[kind]) clearInterval(progressTimers[kind]);
    progressTimers[kind] = null;
  }

  async function initWebGPU() {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    const canvas = document.createElement('canvas');
    canvas.width = ui.canvas.width;
    canvas.height = ui.canvas.height;
    const context = canvas.getContext('webgpu');
    if (!context) return false;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode:'opaque' });
    const shader = device.createShaderModule({ code: `
      struct Params { cropX:f32, cropY:f32, zoom:f32, pad:f32 };
      @group(0) @binding(0) var imageSampler: sampler;
      @group(0) @binding(1) var imageTexture: texture_2d<f32>;
      @group(0) @binding(2) var<uniform> params: Params;
      struct Out { @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32> };
      @vertex fn vs(@builtin(vertex_index) i:u32) -> Out {
        var pos=array<vec2<f32>,6>(vec2(-1.0,-1.0),vec2(1.0,-1.0),vec2(-1.0,1.0),vec2(-1.0,1.0),vec2(1.0,-1.0),vec2(1.0,1.0));
        var uv=array<vec2<f32>,6>(vec2(0.0,1.0),vec2(1.0,1.0),vec2(0.0,0.0),vec2(0.0,0.0),vec2(1.0,1.0),vec2(1.0,0.0));
        var out:Out; out.position=vec4(pos[i],0.0,1.0); out.uv=uv[i]; return out;
      }
      @fragment fn fs(input:Out) -> @location(0) vec4<f32> {
        let centered=(input.uv-vec2(0.5))*vec2(params.cropX,params.cropY)/params.zoom+vec2(0.5);
        return textureSample(imageTexture,imageSampler,clamp(centered,vec2(0.001),vec2(0.999)));
      }` });
    const pipeline = device.createRenderPipeline({
      layout:'auto',
      vertex:{ module:shader, entryPoint:'vs' },
      fragment:{ module:shader, entryPoint:'fs', targets:[{format}] },
      primitive:{ topology:'triangle-list' }
    });
    gpu.ready=true; gpu.canvas=canvas; gpu.context=context; gpu.device=device; gpu.pipeline=pipeline;
    gpu.sampler=device.createSampler({ magFilter:'linear', minFilter:'linear' });
    gpu.uniformBuffer=device.createBuffer({ size:16, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
    return true;
  }

  async function prepareGpuTextures(images) {
    if (!gpu.ready) return;
    gpu.textures = [];
    for (const image of images) {
      const bitmap = await createImageBitmap(image);
      const texture = gpu.device.createTexture({
        size:[bitmap.width, bitmap.height, 1], format:'rgba8unorm',
        usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT
      });
      gpu.device.queue.copyExternalImageToTexture({source:bitmap},{texture},[bitmap.width,bitmap.height]);
      const targetAspect=ui.canvas.width/ui.canvas.height, imageAspect=bitmap.width/bitmap.height;
      const cropX=imageAspect>targetAspect ? targetAspect/imageAspect : 1;
      const cropY=imageAspect<targetAspect ? imageAspect/targetAspect : 1;
      const bindGroup=gpu.device.createBindGroup({
        layout:gpu.pipeline.getBindGroupLayout(0),
        entries:[
          {binding:0,resource:gpu.sampler},
          {binding:1,resource:texture.createView()},
          {binding:2,resource:{buffer:gpu.uniformBuffer}}
        ]
      });
      gpu.textures.push({texture,bindGroup,cropX,cropY});
    }
  }

  function drawGpuCover(index, progress=0) {
    const item=gpu.textures[index];
    if (!gpu.ready || !item) return false;
    gpu.device.queue.writeBuffer(gpu.uniformBuffer,0,new Float32Array([item.cropX,item.cropY,1+progress*0.05,0]));
    const encoder=gpu.device.createCommandEncoder();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:gpu.context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(gpu.pipeline); pass.setBindGroup(0,item.bindGroup); pass.draw(6); pass.end();
    gpu.device.queue.submit([encoder.finish()]);
    ctx.drawImage(gpu.canvas,0,0,ui.canvas.width,ui.canvas.height);
    return true;
  }


  function parseSrtTime(value) {
    const match=String(value||'').trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if(!match) return 0;
    return Number(match[1])*3600+Number(match[2])*60+Number(match[3])+Number(match[4].padEnd(3,'0').slice(0,3))/1000;
  }

  function parseSrt(text) {
    return String(text||'').replace(/\r/g,'').trim().split(/\n{2,}/).map((block)=>{
      const lines=block.split('\n');
      const timing=lines.find((line)=>line.includes('-->')) || '';
      const parts=timing.split('-->');
      return {start:parseSrtTime(parts[0]),end:parseSrtTime(parts[1]),text:lines.filter((line)=>line && !/^\d+$/.test(line.trim()) && !line.includes('-->')).join(' ')};
    }).filter((item)=>item.text && item.end>item.start);
  }

  function wrapCanvasText(text, maxWidth) {
    const words=String(text||'').split(/\s+/); const lines=[]; let line='';
    for(const word of words){
      const test=line ? `${line} ${word}` : word;
      if(ctx.measureText(test).width>maxWidth && line){lines.push(line);line=word;} else line=test;
    }
    if(line) lines.push(line);
    return lines.slice(0,3);
  }

  function drawSubtitleAndWatermark(time) {
    const cue=subtitles.find((item)=>time>=item.start && time<item.end);
    const watermark=String(manifest?.watermark || 'StoryMaker Beta').trim();
    ctx.save();
    ctx.textAlign='right'; ctx.font='bold 30px sans-serif';
    ctx.fillStyle='rgba(255,255,255,.86)'; ctx.strokeStyle='rgba(0,0,0,.72)'; ctx.lineWidth=5;
    ctx.strokeText(watermark,1030,72); ctx.fillText(watermark,1030,72);
    if(cue){
      ctx.textAlign='center'; ctx.font='bold 52px sans-serif';
      const lines=wrapCanvasText(cue.text,920); const lineHeight=68; const boxHeight=lines.length*lineHeight+54; const top=1780-boxHeight;
      ctx.fillStyle='rgba(0,0,0,.68)'; ctx.fillRect(50,top,980,boxHeight);
      ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(0,0,0,.95)'; ctx.lineWidth=7;
      lines.forEach((line,index)=>{const y=top+54+index*lineHeight;ctx.strokeText(line,540,y);ctx.fillText(line,540,y);});
    }
    ctx.restore();
  }

  function diagnostics() {
    const mp4Types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4'
    ];
    const supportedMp4 = mp4Types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    return {
      secureContext: window.isSecureContext,
      webgpu: !!navigator.gpu,
      webgpuActive: gpu.ready,
      wasm: typeof WebAssembly === 'object',
      videoEncoder: 'VideoEncoder' in window,
      audioEncoder: 'AudioEncoder' in window,
      mediaRecorder: 'MediaRecorder' in window,
      mp4MimeType: supportedMp4,
      userAgent: navigator.userAgent
    };
  }

  function refreshDiag() {
    const d = diagnostics();
    ui.diag.textContent = JSON.stringify(d, null, 2);
    ui.diag.className = d.wasm && d.audioEncoder && d.mp4MimeType ? 'ok' : 'bad';
    return d;
  }

  async function request(url, options={}) {
    const response = await fetch(url, {cache:'no-store', ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  async function loadImage(url) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    await image.decode();
    return image;
  }

  async function loadVideo(url) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('삽입 동영상을 불러오지 못했습니다.'));
    });
    return video;
  }

  function drawCover(image, progress=0, index=0) {
    if (drawGpuCover(index, progress)) return;
    const cw=ui.canvas.width, ch=ui.canvas.height;
    const scale=Math.max(cw/image.naturalWidth, ch/image.naturalHeight) * (1 + progress*0.05);
    const w=image.naturalWidth*scale, h=image.naturalHeight*scale;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,cw,ch);
    ctx.drawImage(image,(cw-w)/2,(ch-h)/2,w,h);
  }

  function drawVideoCover(video) {
    const cw=ui.canvas.width, ch=ui.canvas.height;
    const vw=video.videoWidth || cw, vh=video.videoHeight || ch;
    const scale=Math.max(cw/vw, ch/vh);
    const w=vw*scale, h=vh*scale;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,cw,ch);
    ctx.drawImage(video,(cw-w)/2,(ch-h)/2,w,h);
  }

  async function loadJob() {
    const id=ui.job.value.trim();
    if (!id) return;
    ui.status.textContent='현재 작업의 매니페스트를 확인하는 중...';
    const data=await request(`/beta-api/browser/jobs/${encodeURIComponent(id)}/manifest?t=${Date.now()}`);
    const nextManifest=data.manifest;
    if (!nextManifest || nextManifest.beta_job_id !== id) throw new Error('현재 작업과 다른 매니페스트가 반환되었습니다.');
    manifest=nextManifest;
    subtitles = manifest.subtitle ? parseSrt(await fetch(manifest.subtitle,{cache:'no-store'}).then(r=>r.ok?r.text():'')) : [];
    if (!manifest.voice_wav) throw new Error('현재 PODCAST_50 음성이 아직 준비되지 않았습니다.');
    if (manifest.voice_script_hash && manifest.script_hash && manifest.voice_script_hash !== manifest.script_hash) throw new Error('현재 원고와 음성 버전이 다릅니다. 팟캐스트 생성을 다시 눌러주세요.');
    ui.mp3.disabled=false; ui.mp4.disabled=false;
    ui.status.textContent=`현재 작업 준비 완료 · ${manifest.script_key || 'PODCAST_50'} · 이미지 ${manifest.images.length}장 · 동영상 ${(manifest.videos || []).length}개`;
  }

  function parseWav(buffer) {
    const view=new DataView(buffer);
    const text=(o,n)=>String.fromCharCode(...new Uint8Array(buffer,o,n));
    if (text(0,4)!=='RIFF' || text(8,4)!=='WAVE') throw new Error('지원하지 않는 WAV입니다.');
    let offset=12, fmt=null, dataOffset=0, dataSize=0;
    while(offset+8<=view.byteLength){
      const id=text(offset,4), size=view.getUint32(offset+4,true), start=offset+8;
      if(id==='fmt ') fmt={format:view.getUint16(start,true),channels:view.getUint16(start+2,true),sampleRate:view.getUint32(start+4,true),bits:view.getUint16(start+14,true)};
      if(id==='data'){dataOffset=start;dataSize=size;break;}
      offset=start+size+(size%2);
    }
    if(!fmt || !dataOffset || fmt.format!==1 || fmt.bits!==16) throw new Error('PCM 16비트 WAV만 지원합니다.');
    return {fmt, pcm:new Int16Array(buffer,dataOffset,Math.floor(dataSize/2))};
  }

  async function encodeMp3() {
    stopPreparingProgress('podcast');
    setProgress('podcast', 22);
    refreshDiag();
    if (!window.WasmMediaEncoder) throw new Error('Beta 전용 MP3 WASM 인코더를 불러오지 못했습니다.');
    const wav=await fetch(manifest.voice_wav).then(r=>r.arrayBuffer());
    const parsed=parseWav(wav), {channels,sampleRate}=parsed.fmt;
    const encoder=await WasmMediaEncoder.createEncoder('audio/mpeg','/beta-static/vendor/mp3.wasm');
    encoder.configure({sampleRate,channels,bitrate:128});
    const chunkFrames=1152*20, totalFrames=Math.floor(parsed.pcm.length/channels), parts=[];
    for(let frame=0;frame<totalFrames;frame+=chunkFrames){
      const frames=Math.min(chunkFrames,totalFrames-frame);
      const planar=Array.from({length:channels},()=>new Float32Array(frames));
      for(let i=0;i<frames;i++){
        for(let ch=0;ch<channels;ch++) planar[ch][i]=parsed.pcm[(frame+i)*channels+ch]/32768;
      }
      const encoded=encoder.encode(planar);
      if(encoded.length) parts.push(new Uint8Array(encoded));
      const rawPercent=(frame+frames)/totalFrames;
      const percent=Math.round(22 + rawPercent*78);
      setProgress('podcast', percent);
      ui.status.textContent=`팟캐스트 생성 중 · ${percent}%`;
      await new Promise(r=>setTimeout(r,0));
    }
    const last=encoder.finalize(); if(last.length) parts.push(new Uint8Array(last));
    mp3Blob=new Blob(parts,{type:'audio/mpeg'});
    if(mp3Blob.size<128) throw new Error('WASM MP3 결과가 비어 있습니다.');
    ui.audio.src=URL.createObjectURL(mp3Blob); ui.audio.hidden=false; ui.audio.controls=true; ui.audio.currentTime=0; ui.upload.disabled=!mp4Blob;
    ui.audio.scrollIntoView({behavior:'smooth',block:'nearest'});
    ui.audio.pause();
    ui.audio.currentTime=0;
    setProgress('podcast', 100, 'complete');
    ui.status.textContent=`팟캐스트 생성 완료 · ${(mp3Blob.size/1024).toFixed(1)}KB`;
  }

  async function fetchAsFile(url, name, fallbackType='application/octet-stream') {
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw new Error(`미디어 불러오기 실패 · HTTP ${response.status}`);
    const blob = await response.blob();
    return new File([blob], name, {type:blob.type || fallbackType});
  }

  async function seekVideo(video, time) {
    const target = Math.max(0, Math.min(time, Math.max(0, (video.duration || 0) - 0.05)));
    if (Math.abs((video.currentTime || 0) - target) < 0.01) return;
    await new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('삽입 동영상 프레임을 읽지 못했습니다.')); };
      const cleanup = () => {
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('seeked', done, {once:true});
      video.addEventListener('error', fail, {once:true});
      video.currentTime = target;
    });
  }

  async function extractVideoFrameFiles(url, videoIndex, requestedCount = 5) {
    const video = await loadVideo(url);
    const duration = Math.max(0.1, Number(video.duration || 0.1));
    const sampleCount = Math.max(2, Math.min(90, Math.round(requestedCount || 5)));
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const frameCtx = canvas.getContext('2d');
    const files = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const time = sampleCount === 1 ? 0 : (duration * index) / sampleCount;
      await seekVideo(video, time);
      const vw = video.videoWidth || canvas.width;
      const vh = video.videoHeight || canvas.height;
      const scale = Math.max(canvas.width / vw, canvas.height / vh);
      const width = vw * scale;
      const height = vh * scale;
      frameCtx.fillStyle = '#000';
      frameCtx.fillRect(0, 0, canvas.width, canvas.height);
      frameCtx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (blob) files.push(new File([blob], `video_${videoIndex + 1}_frame_${index + 1}.jpg`, {type:'image/jpeg'}));
    }
    video.removeAttribute('src');
    video.load();
    return files;
  }

  async function renderMp4(settings = {}, detailCallback = null) {
    startPreparingProgress('slideshow', 2, 20);
    refreshDiag();
    if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
      throw new Error('이 브라우저는 WebCodecs H.264/AAC 인코딩을 지원하지 않습니다.');
    }

    const sourceImages = [];
    for (let index = 0; index < manifest.images.length; index += 1) {
      sourceImages.push(await fetchAsFile(manifest.images[index], `image_${String(index + 1).padStart(3, '0')}.jpg`, 'image/jpeg'));
      setProgress('slideshow', 5 + ((index + 1) / Math.max(1, manifest.images.length)) * 10);
    }

    const videoUrls = manifest.videos || [];
    const estimatedDuration = Math.max(12, Number(manifest.duration_seconds || 45));
    const totalSlots = Math.max(sourceImages.length + (videoUrls.length ? 3 : 0), Math.ceil(estimatedDuration / 1.15));
    const targetVideoSlots = videoUrls.length ? Math.max(videoUrls.length * 2, Math.round(totalSlots * 0.30)) : 0;
    const targetImageSlots = Math.max(sourceImages.length, totalSlots - targetVideoSlots);
    const imageFiles = [];
    for (let i = 0; i < targetImageSlots && sourceImages.length; i += 1) imageFiles.push(sourceImages[i % sourceImages.length]);
    const videoFrames = [];
    for (let index = 0; index < videoUrls.length; index += 1) {
      const count = Math.max(2, Math.round(targetVideoSlots / videoUrls.length));
      const frames = await extractVideoFrameFiles(videoUrls[index], index, count);
      videoFrames.push(...frames);
      setProgress('slideshow', 15 + ((index + 1) / Math.max(1, videoUrls.length)) * 8);
    }
    for (let i = videoFrames.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [videoFrames[i], videoFrames[j]] = [videoFrames[j], videoFrames[i]];
    }
    for (const frame of videoFrames.slice(0, targetVideoSlots)) {
      const min = Math.min(imageFiles.length, 1);
      const max = Math.max(min, imageFiles.length - 1);
      const position = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
      imageFiles.splice(position, 0, frame);
    }

    if (!imageFiles.length) throw new Error('렌더링할 이미지 또는 동영상 프레임이 없습니다.');
    const audioBlob = await fetch(manifest.voice_mp3 || manifest.voice_wav, {cache:'no-store'}).then((response) => {
      if (!response.ok) throw new Error(`음성 불러오기 실패 · HTTP ${response.status}`);
      return response.blob();
    });

    stopPreparingProgress('slideshow');
    setProgress('slideshow', 24);
    ui.status.textContent='Mediabunny/WebCodecs 고속 렌더링을 시작합니다.';
    const startedAt = performance.now();
    const renderBrowserShortform = await loadBetaRenderBrowserShortform();
    const result = await renderBrowserShortform({
      audioBlob,
      imageFiles,
      title: settings.title_line_2 || manifest.watermark || 'StoryMaker Beta',
      caption: settings.title_line_1 || '',
      eyebrow: settings.title_line_1 || 'StoryMaker Beta',
      businessName: settings.business_name || manifest.watermark || '',
      businessPhone: settings.business_phone || '',
      businessNameFontSize: Number(settings.brand_size || 46),
      businessPhoneFontSize: Number(settings.phone_size || 43),
      bottomMargin: Number(settings.bottom_margin || 80),
      scriptLines: subtitles.map((cue) => cue.text),
      subtitleCues: subtitles,
      subtitleStartSeconds: 0,
      subtitleDurationSeconds: 180,
      subtitleFontSize: Number(settings.subtitle_size || 30),

      subtitlePosition: settings.subtitle_position || 'bottom',

      transitionType: settings.transition_type || 'random',
      width: 720,
      height: 1280,
      fps: Number(settings.fps || 24),
      maxDurationSeconds: 180,
      perfScreen: 'storymaker-beta',
      onProgress: (progress) => {
        const raw = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
        const percent = 24 + raw * 0.74;
        setProgress('slideshow', percent);
        const elapsed = Math.max(0.1, (performance.now() - startedAt) / 1000);
        const remaining = raw > 1 ? Math.max(0, elapsed * (100 - raw) / raw) : 0;
        ui.status.textContent = `${progress?.stage || '고속 MP4 제작 중'} · ${Math.round(raw)}%${remaining ? ` · 약 ${Math.ceil(remaining)}초 남음` : ''}`;
        detailCallback?.({type:'render', rawPercent:raw, stage:progress?.stage || '고속 MP4 제작 중', remaining});
      }
    });

    mp4Blob = result.mp4Blob;
    if (!mp4Blob || mp4Blob.size < 1024) throw new Error('WebCodecs MP4 결과가 비어 있습니다.');
    ui.video.src=URL.createObjectURL(mp4Blob);ui.video.hidden=false;ui.video.controls=true;ui.upload.disabled=!mp3Blob;
    ui.video.scrollIntoView({behavior:'smooth',block:'nearest'});
    setProgress('slideshow', 100, 'complete');
    detailCallback?.({type:'complete', size:mp4Blob.size, seconds:(performance.now()-startedAt)/1000});
    ui.status.textContent=`슬라이드쇼 생성 완료 · Mediabunny/WebCodecs · ${(mp4Blob.size/1024/1024).toFixed(2)}MB · ${((performance.now()-startedAt)/1000).toFixed(1)}초`;
  }

  async function upload() {
    if(!manifest || !mp4Blob) throw new Error('MP4를 먼저 생성하세요.');
    const body=new FormData();
    if (mp3Blob) body.append('browser_mp3',mp3Blob,'browser_podcast.mp3');
    body.append('browser_mp4',mp4Blob,'browser_final.mp4');
    body.append('diagnostics',JSON.stringify(refreshDiag()));
    const data=await request(`/beta-api/browser/jobs/${manifest.beta_job_id}/upload`,{method:'POST',body});
    ui.status.textContent=`Beta 보관함 저장 완료 · ${Object.keys(data.saved).join(', ')} · 보관함으로 이동합니다.`;
    await new Promise((resolve)=>setTimeout(resolve,700));
    location.href='/beta/archive';
  }


  async function startThumbnailBackground() {
    if (!manifest?.beta_job_id || !window.StoryMakerBetaQueueThumbnail) return;
    if (ui.thumbnailStatus) ui.thumbnailStatus.textContent = 'AI 썸네일 프롬프트를 전송하는 중...';
    try {
      await window.StoryMakerBetaQueueThumbnail();
      const started = Date.now();
      while (Date.now() - started < 240000) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const state = await request('/beta-api/gemini-worker/thumbnail/status');
        const data = state.data || {};
        if (data.job_id !== manifest.beta_job_id) continue;
        if (ui.thumbnailStatus) ui.thumbnailStatus.textContent = `AI 썸네일 · ${data.status || '대기 중'}`;
        if (data.status === 'completed') {
          if (ui.thumbnailImage) {
            ui.thumbnailImage.src = `/beta-api/jobs/${encodeURIComponent(manifest.beta_job_id)}/file/thumbnail?t=${Date.now()}`;
            ui.thumbnailImage.hidden = false;
          }
          if (ui.thumbnailStatus) ui.thumbnailStatus.textContent = 'AI 썸네일 생성 완료';
          return;
        }
        if (data.status === 'error') throw new Error(data.error || 'AI 썸네일 생성 실패');
      }
      throw new Error('AI 썸네일 응답 시간이 초과되었습니다.');
    } catch (error) {
      if (ui.thumbnailStatus) ui.thumbnailStatus.textContent = `AI 썸네일: ${error.message}`;
    }
  }

  async function ensurePodcastReady(settings = {}) {
    const currentJobId=ui.job.value.trim();
    if (!currentJobId) throw new Error('현재 작업 ID가 없습니다.');
    manifest=null; mp3Blob=null; mp4Blob=null; subtitles=[];
    ui.audio.pause(); ui.video.pause();
    ui.audio.removeAttribute('src'); ui.video.removeAttribute('src');
    ui.audio.hidden=true; ui.video.hidden=true; ui.upload.disabled=true; ui.mp4.disabled=true;
    if (!window.StoryMakerBetaPrepareVoice) throw new Error('현재 PODCAST_50 음성 준비 기능을 찾지 못했습니다.');
    ui.status.textContent='현재 PODCAST_50으로 여자·남자 음성을 새로 만드는 중...';
    await window.StoryMakerBetaPrepareVoice(settings);
    if (ui.job.value.trim()!==currentJobId) throw new Error('음성 생성 중 작업이 변경되었습니다.');
    await loadJob();
  }

  ui.load.onclick=()=>loadJob().catch(e=>ui.status.textContent=`불러오기 실패: ${e.message}`);
  ui.mp3.onclick=async()=>{
    ui.mp3.disabled=true;
    startPreparingProgress('podcast', 2, 20);
    ui.status.textContent='팟캐스트 음성과 인코더를 준비하는 중...';
    try {
      startThumbnailBackground();
      await ensurePodcastReady();
      await encodeMp3();
    } catch(e) {
      stopPreparingProgress('podcast');
      setProgress('podcast',0,'error');
      ui.status.textContent=`팟캐스트 실패: ${e.message}`;
    } finally {
      ui.mp3.disabled=false;
    }
  };
  ui.mp4.onclick=async()=>{
    ui.mp4.disabled=true;
    startPreparingProgress('slideshow', 2, 22);
    ui.status.textContent='슬라이드쇼 자원과 영상 프레임을 준비하는 중...';
    try {
      await renderMp4({});
    } catch(e) {
      stopPreparingProgress('slideshow');
      setProgress('slideshow',0,'error');
      ui.status.textContent=`슬라이드쇼 실패: ${e.message}`;
    } finally {
      ui.mp4.disabled=false;
    }
  };
  ui.upload.onclick=()=>upload().catch(e=>ui.status.textContent=`저장 실패: ${e.message}`);
  window.StoryMakerBetaBrowserRenderer = {
    setJob(jobId) { ui.job.value = String(jobId || ''); },
    prime(jobId) {
      const nextJobId=String(jobId||'');
      ui.job.value=nextJobId; manifest=null; mp3Blob=null; mp4Blob=null; subtitles=[];
      ui.audio.pause(); ui.video.pause();
      ui.audio.removeAttribute('src'); ui.video.removeAttribute('src');
      ui.audio.hidden=true; ui.video.hidden=true; ui.upload.disabled=true; ui.mp4.disabled=true;
      ui.mp3.disabled=!nextJobId;
      ui.status.textContent=nextJobId?'현재 작업의 PODCAST_50 음성을 새로 만들 준비가 됐습니다.':'작업을 준비 중입니다.';
    },
    loadJob: () => loadJob(),
    async createVideoOnly(jobId, settings = {}, onProgress = () => {}) {
      ui.job.value = String(jobId || '');
      manifest = null; mp3Blob = null; mp4Blob = null; subtitles = [];
      await request(`/beta-api/shortform/jobs/${encodeURIComponent(jobId)}/reset-generated`, {method:'POST'});
      onProgress(12, '현재 설정으로 TTS 음성과 SRT를 새로 만드는 중...');
      await ensurePodcastReady(settings);
      onProgress(36, '새 랜덤 배경음악을 선택하고 음성과 믹싱하는 중...', {type:'media', images:[...(manifest?.images || [])], videos:[...(manifest?.videos || [])]});
      let prepared;
      if (settings.bgm_mode === 'one_time' && settings.one_time_music_file) {
        const form = new FormData();
        Object.entries(settings).forEach(([key,value]) => { if (key !== 'one_time_music_file' && value != null) form.append(key, String(value)); });
        form.append('bgm_file_upload', settings.one_time_music_file, settings.one_time_music_file.name);
        prepared = await request(`/beta-api/shortform/jobs/${encodeURIComponent(jobId)}/prepare-audio`, {method:'POST', body:form});
      } else {
        prepared = await request(`/beta-api/shortform/jobs/${encodeURIComponent(jobId)}/prepare-audio`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...settings, force_new_music:true})});
      }
      await loadJob();
      onProgress(45, `음악 선택 완료 · ${prepared.music_name || '음악 없음'}`, {type:'music', musicName:prepared.music_name || ''});
      await encodeMp3();
      onProgress(51, '이미지와 동영상 30% 구간을 무작위 배치하는 중...');
      await renderMp4(settings, (detail) => {
        if (detail.type === 'render') onProgress(51 + Math.max(0, Math.min(100, Number(detail.rawPercent || 0))) * 0.47, `${detail.stage || 'MP4 렌더링'} · ${Math.round(detail.rawPercent || 0)}%`, detail);
        if (detail.type === 'complete') onProgress(98, 'MP4 제작 완료 · 보관함 저장 대기', detail);
      });
      onProgress(100, 'MP4 제작 완료 · 보관함 바로가기를 누르면 저장됩니다.', {type:'ready'});
      return { videoUrl: URL.createObjectURL(mp4Blob), musicName: prepared.music_name || manifest?.music_name || '' };
    },
    async saveCurrentToArchive(jobId) {
      if (!mp4Blob || !mp3Blob) throw new Error('먼저 영상 만들기를 완료해 주세요.');
      const body = new FormData();
      body.append('browser_mp3', mp3Blob, 'browser_podcast.mp3');
      body.append('browser_mp4', mp4Blob, 'browser_final.mp4');
      body.append('diagnostics', JSON.stringify(refreshDiag()));
      return await request(`/beta-api/browser/jobs/${encodeURIComponent(jobId)}/upload`, {method:'POST', body});
    },
    refreshDiag: () => refreshDiag()
  };
  window.dispatchEvent(new CustomEvent('storymaker-beta-renderer-ready'));
  const params=new URLSearchParams(location.search);
  const saved=params.get('job') || sessionStorage.getItem('storymaker_beta_current_job');
  if(saved){
    window.StoryMakerBetaBrowserRenderer.prime(saved);
    window.dispatchEvent(new CustomEvent('storymaker-beta-renderer-ready', { detail:{ jobId:saved } }));
  }
  initWebGPU().finally(refreshDiag);
})();
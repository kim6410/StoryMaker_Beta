(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = { job:$('job'), load:$('load'), mp3:$('mp3'), mp4:$('mp4'), upload:$('upload'), diag:$('diag'), status:$('status'), canvas:$('canvas'), audio:$('audio'), video:$('video') };
  const ctx = ui.canvas.getContext('2d');
  let manifest = null, mp3Blob = null, mp4Blob = null;
  const gpu = { ready:false, canvas:null, context:null, device:null, pipeline:null, sampler:null, uniformBuffer:null, textures:[] };

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
    ui.status.textContent='작업 매니페스트를 읽는 중...';
    const data=await request(`/beta-api/browser/jobs/${encodeURIComponent(id)}/manifest`);
    manifest=data.manifest;
    if (!manifest.voice_wav) throw new Error('먼저 백엔드 음성 준비를 실행해 voice.wav를 생성하세요.');
    ui.mp3.disabled=false; ui.mp4.disabled=false;
    ui.status.textContent=`작업 준비 완료 · 기본 대본 ${manifest.script_key || 'PODCAST_50'} · 이미지 ${manifest.images.length}장 · 동영상 ${(manifest.videos || []).length}개`;
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
      ui.status.textContent=`브라우저 WASM MP3 생성 중 · ${Math.round((frame+frames)/totalFrames*100)}%`;
      await new Promise(r=>setTimeout(r,0));
    }
    const last=encoder.finalize(); if(last.length) parts.push(new Uint8Array(last));
    mp3Blob=new Blob(parts,{type:'audio/mpeg'});
    if(mp3Blob.size<128) throw new Error('WASM MP3 결과가 비어 있습니다.');
    ui.audio.src=URL.createObjectURL(mp3Blob); ui.audio.hidden=false; ui.upload.disabled=!mp4Blob;
    ui.status.textContent=`브라우저 WASM MP3 생성 완료 · ${(mp3Blob.size/1024).toFixed(1)}KB`;
  }

  async function renderMp4() {
    const d=refreshDiag();
    if(!d.mp4MimeType) throw new Error('이 브라우저는 MP4 MediaRecorder를 지원하지 않습니다.');
    const images=await Promise.all(manifest.images.map(loadImage));
    const videos=await Promise.all((manifest.videos || []).map(loadVideo));
    const media=[...images.map((item,index)=>({type:'image',item,index})),...videos.map((item)=>({type:'video',item}))];
    if (!media.length) throw new Error('렌더링할 이미지 또는 동영상이 없습니다.');
    if (!gpu.ready) await initWebGPU().catch(()=>false);
    await prepareGpuTextures(images).catch(()=>{});
    const wavBuffer=await fetch(manifest.voice_wav).then(r=>r.arrayBuffer());
    const audioContext=new AudioContext();
    const audioBuffer=await audioContext.decodeAudioData(wavBuffer.slice(0));
    const source=audioContext.createBufferSource(); source.buffer=audioBuffer;
    const destination=audioContext.createMediaStreamDestination(); source.connect(destination); source.connect(audioContext.destination);
    const stream=ui.canvas.captureStream(30); destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    const chunks=[]; const recorder=new MediaRecorder(stream,{mimeType:d.mp4MimeType,videoBitsPerSecond:5000000,audioBitsPerSecond:192000});
    recorder.ondataavailable=(e)=>{if(e.data.size)chunks.push(e.data)};
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    const duration=audioBuffer.duration, started=performance.now();
    recorder.start(1000); source.start();
    await new Promise(resolve=>{
      function frame(now){
        const t=(now-started)/1000, p=Math.min(1,t/duration), slot=Math.min(media.length-1,Math.floor(p*media.length));
        const local=(p*media.length)-slot, current=media[slot];
        if(current.type==='video'){
          const clipDuration=Math.max(current.item.duration || 0,0.1);
          const targetTime=Math.min(clipDuration-0.03,Math.max(0,local*clipDuration));
          if(Math.abs(current.item.currentTime-targetTime)>0.08) current.item.currentTime=targetTime;
          drawVideoCover(current.item);
        }else{
          drawCover(current.item,local,current.index);
        }
        ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,1540,1080,380);
        ctx.fillStyle='#fff';ctx.font='bold 52px sans-serif';ctx.textAlign='center';
        const label=manifest.script_key === 'PODCAST_50' ? '팟캐스트 50초' : '팟캐스트';ctx.fillText(label,540,1650);
        if(t<duration) requestAnimationFrame(frame); else resolve();
      } requestAnimationFrame(frame);
    });
    await new Promise(r=>setTimeout(r,300)); recorder.stop(); await stopped; await audioContext.close();
    mp4Blob=new Blob(chunks,{type:'video/mp4'});
    ui.video.src=URL.createObjectURL(mp4Blob);ui.video.hidden=false;ui.upload.disabled=!mp3Blob;
    ui.status.textContent=`브라우저 MP4 생성 완료 · ${(mp4Blob.size/1024/1024).toFixed(2)}MB`;
  }

  async function upload() {
    if(!manifest || !mp3Blob || !mp4Blob) throw new Error('MP3와 MP4를 모두 먼저 생성하세요.');
    const body=new FormData();
    body.append('browser_mp3',mp3Blob,'browser_podcast.mp3');
    body.append('browser_mp4',mp4Blob,'browser_final.mp4');
    body.append('diagnostics',JSON.stringify(refreshDiag()));
    const data=await request(`/beta-api/browser/jobs/${manifest.beta_job_id}/upload`,{method:'POST',body});
    ui.status.textContent=`Beta 보관함 저장 완료 · ${Object.keys(data.saved).join(', ')}`;
  }

  ui.load.onclick=()=>loadJob().catch(e=>ui.status.textContent=`불러오기 실패: ${e.message}`);
  ui.mp3.onclick=()=>encodeMp3().catch(e=>ui.status.textContent=`MP3 실패: ${e.message}`);
  ui.mp4.onclick=()=>renderMp4().catch(e=>ui.status.textContent=`MP4 실패: ${e.message}`);
  ui.upload.onclick=()=>upload().catch(e=>ui.status.textContent=`저장 실패: ${e.message}`);
  const params=new URLSearchParams(location.search);
  const saved=params.get('job') || sessionStorage.getItem('storymaker_beta_current_job');
  if(saved){ ui.job.value=saved; setTimeout(()=>loadJob().catch(e=>ui.status.textContent=`불러오기 실패: ${e.message}`),200); }
  initWebGPU().finally(refreshDiag);
})();
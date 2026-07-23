const targets = await fetch('http://127.0.0.1:9333/json').then(r => r.json());
const page = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:8021/beta/browser-render'));
if (!page) throw new Error('Beta browser page target not found');
const ws = new WebSocket(page.webSocketDebuggerUrl); let seq=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}};
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
async function ev(expression,awaitPromise=false){const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(pattern, timeout){const start=Date.now();while(Date.now()-start<timeout){const s=await ev(`document.getElementById('status').textContent`);if(pattern.test(s))return s;if(/실패/.test(s))throw new Error(s);await sleep(500)}throw new Error('timeout: '+await ev(`document.getElementById('status').textContent`))}
await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload',{ignoreCache:true});
await sleep(2500);
await ev(`document.getElementById('job').value='beta_20260724_021409_e44051';document.getElementById('load').click();true`); await waitFor(/작업 준비 완료/,5000);
await ev(`document.getElementById('mp3').click();true`); console.log('MP3',await waitFor(/브라우저 MP3 생성 완료/,30000));
await ev(`document.getElementById('mp4').click();true`); console.log('MP4',await waitFor(/브라우저 MP4 생성 완료/,120000));
console.log('BLOBS',await ev(`({audio:document.getElementById('audio').src.startsWith('blob:'),video:document.getElementById('video').src.startsWith('blob:'),uploadEnabled:!document.getElementById('upload').disabled})`));
await ev(`document.getElementById('upload').click();true`); console.log('UPLOAD',await waitFor(/Beta 보관함 저장 완료/,30000));
ws.close();

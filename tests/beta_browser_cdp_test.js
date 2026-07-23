const targets = await fetch('http://127.0.0.1:9333/json').then(r => r.json());
const page = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:8021/beta/browser-render'));
if (!page) throw new Error('Beta browser page target not found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const {resolve, reject} = pending.get(message.id); pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
  }
};
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
function send(method, params={}) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, {resolve, reject}); ws.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression, awaitPromise=false) {
  const r = await send('Runtime.evaluate', {expression, awaitPromise, returnByValue:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'Runtime exception');
  return r.result.value;
}
await send('Runtime.enable');
const diagnostic = await evaluate(`(() => ({
  webgpu: !!navigator.gpu,
  wasm: typeof WebAssembly === 'object',
  videoEncoder: 'VideoEncoder' in window,
  audioEncoder: 'AudioEncoder' in window,
  mediaRecorder: 'MediaRecorder' in window,
  mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=h264,aac','video/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '',
  secureContext: isSecureContext,
  pageTitle: document.title
}))()`);
console.log('DIAGNOSTIC', JSON.stringify(diagnostic));
await evaluate(`document.getElementById('job').value='beta_20260724_021409_e44051'; document.getElementById('load').click(); true`);
await new Promise(r => setTimeout(r, 1500));
console.log('LOAD_STATUS', await evaluate(`document.getElementById('status').textContent`));
console.log('MP3_ENABLED', await evaluate(`!document.getElementById('mp3').disabled`));
console.log('MP4_ENABLED', await evaluate(`!document.getElementById('mp4').disabled`));
ws.close();

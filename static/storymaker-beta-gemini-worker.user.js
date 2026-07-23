// ==UserScript==
// @name         StoryMaker Beta - Gemini Web Worker V2
// @namespace    storymaker-beta-gemini-worker-v2
// @version      2.1.3
// @description  StoryMaker Beta dedicated Gemini web worker
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      192.168.0.62
// @updateURL    http://192.168.0.62:8021/beta-static/storymaker-beta-gemini-worker.user.js
// @downloadURL  http://192.168.0.62:8021/beta-static/storymaker-beta-gemini-worker.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BACKEND = 'http://192.168.0.62:8021';
  const POLL_MS = 1500;
  const VERSION = '2.1.3';
  const SINGLETON = '__STORYMAKER_BETA_GEMINI_WORKER_V2__';
  const ACTIVE_JOB_KEY = 'storymaker_beta_active_gemini_job_id';

  if (window[SINGLETON]?.timer) clearInterval(window[SINGLETON].timer);
  const state = { timer: null, running: false };
  window[SINGLETON] = state;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function request(method, path, data) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: BACKEND + path,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        data: data ? JSON.stringify(data) : undefined,
        onload: (res) => {
          let body = {};
          try { body = JSON.parse(res.responseText || '{}'); } catch (_) {}
          if (res.status < 200 || res.status >= 300) {
            reject(new Error(body.detail || `HTTP ${res.status}`));
            return;
          }
          resolve(body);
        },
        onerror: () => reject(new Error('Beta 서버 연결 실패'))
      });
    });
  }

  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function queryAll(selector) {
    const out = [];
    const seen = new Set();
    function walk(root) {
      if (!root || seen.has(root)) return;
      seen.add(root);
      try {
        out.push(...root.querySelectorAll(selector));
        root.querySelectorAll('*').forEach((el) => el.shadowRoot && walk(el.shadowRoot));
      } catch (_) {}
    }
    walk(document);
    return [...new Set(out)];
  }

  function isEditablePromptCandidate(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    const editable = el.isContentEditable || el.getAttribute?.('contenteditable') === 'true';
    const role = el.getAttribute?.('role') || '';
    const multiline = el.getAttribute?.('aria-multiline') || '';
    const disabled = el.disabled || el.getAttribute?.('aria-disabled') === 'true';
    if (disabled) return false;
    return editable || tag === 'TEXTAREA' || tag === 'INPUT' || role === 'textbox' || multiline === 'true';
  }

  function promptBoxCandidates() {
    const selectors = [
      'rich-textarea div[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      'rich-textarea textarea',
      'rich-textarea',
      'div.ql-editor[contenteditable="true"]',
      '[contenteditable="true"][aria-multiline="true"]',
      '[role="textbox"][aria-multiline="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea[aria-label]',
      'textarea[placeholder]',
      'div[aria-label*="프롬프트"]',
      'div[aria-label*="Enter a prompt"]',
      '[aria-label*="메시지"]',
      '[aria-label*="Gemini에게"]',
      '[data-placeholder*="Gemini"]',
      '[data-placeholder*="prompt"]',
      '[role="textbox"]',
      '[contenteditable="true"]',
      'textarea'
    ];
    const candidates = [...new Set(selectors.flatMap(queryAll))];
    return candidates.map((el) => {
      if (isEditablePromptCandidate(el)) return el;
      return el.querySelector?.('[contenteditable="true"], textarea, [role="textbox"]') || null;
    }).filter(Boolean);
  }

  function promptBox() {
    const candidates = promptBoxCandidates();
    const visible = candidates.find((el) => isVisible(el) && isEditablePromptCandidate(el));
    if (visible) return visible;
    const mounted = candidates.find((el) => isEditablePromptCandidate(el) && el.isConnected);
    return mounted || null;
  }

  async function waitPromptBox(timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const box = promptBox();
      if (box) return box;
      await sleep(500);
    }
    const candidateCount = promptBoxCandidates().length;
    throw new Error(`Gemini 입력창을 찾지 못했습니다. 후보 ${candidateCount}개`);
  }

  function injectText(el, text) {
    if (!el) return false;
    const value = String(text || '');
    el.focus();
    el.click?.();
    const richTextarea = el.closest?.('rich-textarea') || el;
    const editTarget = el.isContentEditable ? el : (richTextarea.querySelector?.('[contenteditable="true"]') || el);
    editTarget.focus?.();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, value);
    } catch (_) {}
    if (editTarget.tagName === 'TEXTAREA' || editTarget.tagName === 'INPUT') editTarget.value = value;
    for (const target of [editTarget, richTextarea, el].filter(Boolean)) {
      target.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function sendButton() {
    const selectors = [
      'button[aria-label*="보내기"]',
      'button[aria-label*="전송"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button[data-testid*="send"]'
    ];
    for (const selector of selectors) {
      const button = queryAll(selector).find((el) => isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (button) return button;
    }
    const iconButton = queryAll('button mat-icon, mat-icon')
      .map((icon) => ['send', 'arrow_upward'].includes((icon.textContent || '').trim()) ? icon.closest('button') : null)
      .find((el) => el && isVisible(el) && !el.disabled);
    if (iconButton) return iconButton;
    const box = promptBox();
    const scope = box?.closest('form, rich-textarea, [role="form"], [class*="input"], [class*="prompt"]');
    if (scope) {
      const scoped = [...scope.querySelectorAll('button')].reverse()
        .find((el) => isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (scoped) return scoped;
    }
    return null;
  }

  async function sendPrompt(box) {
    for (let i = 0; i < 20; i++) {
      const button = sendButton();
      if (button) {
        button.click();
        await sleep(800);
        return;
      }
      await sleep(400);
    }
    box.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    }));
  }

  function assistantNodes() {
    const selectors = [
      'message-content',
      '.model-response-text',
      'div.response-container-content',
      '[data-message-author-role="assistant"]',
      '[data-role="assistant"]',
      'model-response',
      '[class*="model-response"]',
      '[class*="response-container"]'
    ];
    const nodes = [...new Set(selectors.flatMap(queryAll))].filter(isVisible);
    return nodes
      .filter((node) => !nodes.some((other) => other !== node && node.contains(other)))
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  function nodeText(node) {
    if (!node) return '';
    const codeCandidates = [...node.querySelectorAll('pre, code, [class*="code-block"], [data-testid*="code"]')]
      .map((el) => String(el.innerText || el.textContent || '').trim())
      .filter((text) => text.includes('"channels"') && text.includes('"title"'));
    if (codeCandidates.length) return codeCandidates[codeCandidates.length - 1];
    return String(node.innerText || node.textContent || '').trim();
  }

  function textHash(text) {
    const value = String(text || '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function snapshotAssistantResponses() {
    return assistantNodes().map((node) => {
      const text = nodeText(node);
      return { node, text, length: text.length, hash: textHash(text) };
    });
  }

  function findCurrentAnswer(beforeSnapshot) {
    const current = snapshotAssistantResponses();
    for (let i = current.length - 1; i >= 0; i--) {
      const item = current[i];
      const previous = beforeSnapshot.find((entry) => entry.node === item.node);
      if (!previous) return { ...item, reason: 'new_node' };
      if (previous.hash !== item.hash && item.length > previous.length) {
        return { ...item, reason: 'changed_node' };
      }
    }
    return null;
  }

  async function waitForNewAnswer(beforeSnapshot) {
    let selectedNode = null;
    let last = '';
    let stable = 0;
    for (let i = 0; i < 180; i++) {
      await sleep(1000);
      const candidate = selectedNode
        ? { node: selectedNode, text: nodeText(selectedNode) }
        : findCurrentAnswer(beforeSnapshot);
      if (!candidate?.node || !candidate.text) continue;
      if (!selectedNode) {
        selectedNode = candidate.node;
        console.log('[StoryMaker Beta Gemini] 새 응답 노드 선택:', candidate.reason || 'selected');
      }
      const text = candidate.text.trim();
      if (text.length > 100 && text === last) stable += 1;
      else stable = 0;
      last = text;
      if (stable >= 3 && text.includes('"channels"') && text.includes('"title"')) return text;
      if (stable >= 6 && text.length > 100) return text;
    }
    throw new Error('Gemini 새 응답 완료를 확인하지 못했습니다.');
  }

  async function ack(jobId, status, error = null) {
    return request('POST', '/beta-api/gemini-worker/ack', {
      job_id: jobId,
      status,
      worker_id: `tampermonkey-beta-v2-${VERSION}`,
      error
    });
  }

  async function runJob(job) {
    const jobId = job.job_id;
    try {
      await ack(jobId, 'claimed');
      const promptData = await request('GET', `/beta-api/gemini-worker/prompt/${encodeURIComponent(jobId)}`);
      let box = await waitPromptBox();
      if (!box) throw new Error('Gemini 입력창을 찾지 못했습니다.');

      const before = snapshotAssistantResponses();
      const prompt = String(promptData.prompt || '');
      if (!prompt) throw new Error('Beta 프롬프트가 비어 있습니다.');
      if (!injectText(box, prompt)) throw new Error('Gemini 프롬프트 주입에 실패했습니다.');
      await sleep(500);
      let injected = String(box.innerText || box.textContent || box.value || '').trim();
      if (injected.length < Math.min(40, prompt.trim().length)) {
        const retryBox = await waitPromptBox(5000);
        if (!retryBox || !injectText(retryBox, prompt)) throw new Error('Gemini 입력창에 프롬프트가 유지되지 않았습니다.');
        box = retryBox;
        await sleep(500);
        injected = String(box.innerText || box.textContent || box.value || '').trim();
      }
      if (!injected) throw new Error('Gemini 프롬프트 입력 확인에 실패했습니다.');
      await sendPrompt(box);
      await sleep(1000);
      const remaining = String(box.innerText || box.textContent || box.value || '').trim();
      if (remaining.length > 20) throw new Error('Gemini 전송 후 입력창이 비워지지 않았습니다.');
      localStorage.setItem(ACTIVE_JOB_KEY, jobId);
      await ack(jobId, 'sent');

      const resultText = await waitForNewAnswer(before);
      await request('POST', '/beta-api/gemini-worker/result', {
        job_id: jobId,
        result_text: resultText,
        result_raw: resultText,
        source: `tampermonkey-beta-v2-${VERSION}`
      });
      localStorage.removeItem(ACTIVE_JOB_KEY);
      console.log('[StoryMaker Beta Gemini] 완료:', jobId);
      await sleep(1200);
      location.href = 'https://gemini.google.com/app?storymaker_beta_new_chat=' + Date.now();
    } catch (error) {
      console.error('[StoryMaker Beta Gemini] 실패:', error);
      try { await ack(jobId, 'error', error.message || String(error)); } catch (_) {}
    }
  }

  async function recoverSentJob(job) {
    const jobId = job.job_id;
    if (!jobId || localStorage.getItem(ACTIVE_JOB_KEY) !== jobId) return false;
    let last = '';
    let stable = 0;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const nodes = assistantNodes();
      const text = nodeText(nodes[nodes.length - 1]);
      if (!text || !text.includes('"channels"') || !text.includes('"title"')) continue;
      stable = text === last ? stable + 1 : 0;
      last = text;
      if (stable < 3) continue;
      await request('POST', '/beta-api/gemini-worker/result', {
        job_id: jobId,
        result_text: text,
        result_raw: text,
        source: `tampermonkey-beta-${VERSION}-recovery`
      });
      localStorage.removeItem(ACTIVE_JOB_KEY);
      console.log('[StoryMaker Beta Gemini] sent 상태 응답 복구 완료:', jobId);
      return true;
    }
    return false;
  }

  async function loop() {
    if (state.running) return;
    state.running = true;
    try {
      const response = await request('GET', '/beta-api/gemini-worker/status');
      const job = response.data || {};
      if (job.action === 'GENERATE_BETA_GEMINI' && job.job_id) {
        if (job.status === 'pending' || job.status === 'claimed') await runJob(job);
        else if (job.status === 'sent') await recoverSentJob(job);
      }
    } catch (error) {
      console.warn('[StoryMaker Beta Gemini] polling:', error.message || error);
    } finally {
      state.running = false;
    }
  }

  state.timer = setInterval(loop, POLL_MS);
  setTimeout(loop, 1000);
})();

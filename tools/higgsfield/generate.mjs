#!/usr/bin/env node
// 베르넬 아트 생성 도구 (개발용 CLI) — Higgsfield REST API
// - API 키는 서버/로컬 전용: 프로젝트 루트 .env.local 의 HF_API_KEY (복사한 키 그대로)
// - 브라우저 번들에 절대 포함되지 않음 (src/ 에서 import 금지)
//
// 사용법:
//   node tools/higgsfield/generate.mjs --list                     프리셋 목록
//   node tools/higgsfield/generate.mjs player_guardian               프리셋 1개 생성
//   node tools/higgsfield/generate.mjs --all                       모든 프리셋 생성
//   node tools/higgsfield/generate.mjs --model <path> --prompt "..." [--param key=value ...] --out name
//   node tools/higgsfield/generate.mjs --status <request_id>       상태만 조회
//   node tools/higgsfield/generate.mjs --cancel <request_id>       큐 대기 요청 취소
//
// 실행 중 Ctrl+C → 진행 중 요청에 cancel 요청을 실제로 보냄 (폴링만 멈추지 않음)

import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, DEFAULT_MODEL } from './presets.mjs';
import { validate } from './schemas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'public', 'art');
const LOG_FILE = join(__dirname, 'requests.log.jsonl'); // request_id 기록 (키·서명 URL은 기록 안 함)
const BASE = process.env.HF_API_BASE_URL || 'https://api.higgsfield.ai';
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

// ---------- env ----------
function loadKey() {
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f);
    if (existsSync(p)) { try { process.loadEnvFile(p); } catch {} }
  }
  const key = (process.env.HF_API_KEY || '').trim().replace(/^Key\s+/i, '');
  if (!key) {
    console.error('[오류] HF_API_KEY 가 없습니다. 프로젝트 루트의 .env.local 에 다음 한 줄을 넣으세요:\n  HF_API_KEY=<open.higgsfield.ai 에서 복사한 키 그대로>');
    process.exit(1);
  }
  return key;
}

// ---------- http ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(key, method, path, body, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path.replace(/^\//, '')}`, {
      method,
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 500) }; }
    return { status: res.status, headers: res.headers, json };
  } finally { clearTimeout(t); }
}

function explainHttp(status, json) {
  const detail = json?.detail || json?.error || json?.message || json?.raw || '';
  const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
  if (status === 401) return `401 인증 실패 — API 키를 확인하세요. ${msg}`;
  if (/not_enough_credits/.test(msg)) return `${status} 크레딧 부족 — open.higgsfield.ai 에서 API 크레딧을 충전하세요.`;
  if (status === 403) return `403 권한 없음 — 이 계정에서 해당 모델 접근 불가일 수 있음. ${msg}`;
  if (status === 404) return `404 — 모델 경로 또는 request_id 확인. ${msg}`;
  if (status === 422 || status === 400) return `${status} 입력값 오류 — ${msg}`;
  if (status === 402) return `402 크레딧 부족 — ${msg}`;
  if (status === 429) return `429 요청 한도 초과 — 잠시 후 다시 시도. ${msg}`;
  return `${status} ${msg}`;
}

// ---------- submit / poll / cancel ----------
let active = null; // { key, requestId }

async function submit(key, model, input) {
  // 생성 POST 는 모호한 타임아웃 시 자동 재시도하지 않음 (중복 과금 방지)
  let r;
  try {
    r = await api(key, 'POST', model, input, { timeoutMs: 60000 });
  } catch (e) {
    throw new Error(`제출 응답을 받지 못했습니다(${e.name}). 중복 생성 방지를 위해 자동 재시도하지 않습니다. 대시보드에서 요청 여부를 확인하세요.`);
  }
  if (r.status === 429) {
    const ra = Number(r.headers.get('retry-after')) || 10;
    throw new Error(`429 요청 한도 초과 — ${ra}초 후 다시 실행하세요.`);
  }
  if (r.status < 200 || r.status >= 300) throw new Error(explainHttp(r.status, r.json));
  if (!r.json.request_id) throw new Error(`예상치 못한 응답: ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.json;
}

async function poll(key, requestId, { maxMs = 10 * 60 * 1000 } = {}) {
  let delay = 2000; const start = Date.now(); let last = '';
  while (true) {
    let r;
    try { r = await api(key, 'GET', `requests/${requestId}/status`); }
    catch { r = { status: 0, json: {} }; }
    if (r.status === 401 || r.status === 404) throw new Error(explainHttp(r.status, r.json));
    if (r.status === 200) {
      const s = r.json.status;
      if (s !== last) { process.stdout.write(`\n  상태: ${s}`); last = s; } else process.stdout.write('.');
      if (TERMINAL.has(s)) { process.stdout.write('\n'); return r.json; }
    } // 5xx / 네트워크 / 429 → 백오프 후 재시도 (GET 은 안전)
    if (Date.now() - start > maxMs) throw new Error(`시간 초과(${maxMs / 1000}s). request_id=${requestId} 로 --status 조회 가능`);
    await sleep(delay + Math.random() * 500);
    delay = Math.min(delay * 1.5, 10000);
  }
}

async function cancel(key, requestId) {
  const r = await api(key, 'POST', `requests/${requestId}/cancel`);
  if (r.status >= 200 && r.status < 300) console.log(`취소 요청 전송됨: ${requestId}`);
  else console.log(`취소 불가(${explainHttp(r.status, r.json)}) — 이미 처리 중이면 취소되지 않을 수 있습니다.`);
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('mp4') ? 'mp4' : 'jpg';
  const path = `${file}.${ext}`;
  writeFileSync(path, buf);
  return path;
}

function logRequest(entry) {
  try { appendFileSync(LOG_FILE, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n'); } catch {}
}

async function runJob(key, { id, model, input }) {
  const errs = validate(model, input);
  if (errs === null) console.log(`  [주의] '${model}' 의 입력 스키마는 이 도구에서 검증되지 않았습니다. API가 최종 판단합니다.`);
  else if (errs.length) throw new Error(`입력값 오류:\n  - ${errs.join('\n  - ')}`);

  console.log(`\n▶ ${id}  (${model})`);
  const sub = await submit(key, model, input);
  active = { key, requestId: sub.request_id };
  logRequest({ id, model, request_id: sub.request_id, phase: 'submitted' });
  console.log(`  request_id: ${sub.request_id}`);

  const res = await poll(key, sub.request_id);
  active = null;
  logRequest({ id, model, request_id: sub.request_id, phase: res.status, error: res.error ?? null });
  if (res.status !== 'completed') throw new Error(`종료 상태: ${res.status}${res.error ? ` — ${res.error}` : ''}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const urls = [...(res.images || []).map((m) => m.url), ...(res.video ? [res.video.url] : [])];
  const saved = [];
  for (let i = 0; i < urls.length; i++) {
    const name = urls.length > 1 ? `${id}_${i + 1}` : id;
    saved.push(await download(urls[i], join(OUT_DIR, name)));
  }
  saved.forEach((p) => console.log(`  저장: ${p}`));
  return saved;
}

// ---------- cli ----------
function parseArgs(argv) {
  const a = { _: [], param: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--param') a.param.push(argv[++i]);
    else if (v.startsWith('--')) { const k = v.slice(2); const n = argv[i + 1]; if (n && !n.startsWith('--')) { a[k] = n; i++; } else a[k] = true; }
    else a._.push(v);
  }
  return a;
}

function coerce(v) { if (v === 'true') return true; if (v === 'false') return false; if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v); return v; }

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.list || (!a._.length && !a.all && !a.prompt && !a.status && !a.cancel)) {
    console.log('프리셋 목록 (기본 모델:', DEFAULT_MODEL + ')');
    for (const [id, p] of Object.entries(PRESETS)) console.log(`  ${id.padEnd(22)} ${p.title}`);
    console.log('\n예) node tools/higgsfield/generate.mjs player_guardian');
    return;
  }
  const key = loadKey();

  process.on('SIGINT', async () => {
    if (active) { console.log('\n중단 — 취소 요청을 보냅니다...'); try { await cancel(active.key, active.requestId); } catch {} }
    process.exit(130);
  });

  if (a.status) { const r = await api(key, 'GET', `requests/${a.status}/status`); console.log(JSON.stringify(r.json, null, 2)); return; }
  if (a.cancel) { await cancel(key, a.cancel); return; }

  const jobs = [];
  if (a.prompt) {
    const input = { prompt: a.prompt };
    for (const p of a.param) { const [k, ...rest] = p.split('='); input[k] = coerce(rest.join('=')); }
    jobs.push({ id: a.out || `custom_${Date.now()}`, model: a.model || DEFAULT_MODEL, input });
  } else {
    const ids = a.all ? Object.keys(PRESETS) : a._;
    for (const id of ids) {
      const p = PRESETS[id];
      if (!p) { console.error(`알 수 없는 프리셋: ${id} (--list 로 확인)`); process.exit(1); }
      jobs.push({ id, model: a.model || p.model || DEFAULT_MODEL, input: { ...p.input } });
    }
  }

  let failed = 0;
  for (const job of jobs) { // 순차 실행 — 중복 제출/레이트리밋 방지
    try { await runJob(key, job); } catch (e) { failed++; console.error(`  ✖ ${job.id}: ${e.message}`); }
  }
  console.log(`\n완료: ${jobs.length - failed}/${jobs.length} 성공`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e.message); process.exit(1); });

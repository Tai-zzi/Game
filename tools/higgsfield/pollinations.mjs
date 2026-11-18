#!/usr/bin/env node
// 무료 대안: Pollinations (https://enter.pollinations.ai) — 같은 프리셋(presets.mjs) 사용
// 키: 프로젝트 루트 .env.local 의 POLLINATIONS_API_KEY  (enter.pollinations.ai/keys 에서 발급)
// 사용법:
//   node tools/higgsfield/pollinations.mjs player_guardian
//   node tools/higgsfield/pollinations.mjs --all
//   node tools/higgsfield/pollinations.mjs --model zimage --seed 7 npc_elder
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './presets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'public', 'art');
const BASE = 'https://gen.pollinations.ai';
const SIZES = { '1:1': [1024, 1024], '2:3': [832, 1248], '3:4': [896, 1184], '4:3': [1184, 896], '16:9': [1344, 768], '9:16': [768, 1344] };

for (const f of ['.env.local', '.env']) { const p = join(ROOT, f); if (existsSync(p)) try { process.loadEnvFile(p); } catch {} }
const KEY = (process.env.POLLINATIONS_API_KEY || '').trim();

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : def; };
const model = opt('model', 'zimage'); // Z-Image Turbo: 무료 계정 Pollen 으로 사용 가능(paid_only=false)
const seed = opt('seed', '42');
const all = args.includes('--all');
const ids = all ? Object.keys(PRESETS) : args.filter((a) => !a.startsWith('--'));

if (!ids.length) {
  console.log('프리셋:'); for (const [id, p] of Object.entries(PRESETS)) console.log(`  ${id.padEnd(22)} ${p.title}`);
  process.exit(0);
}
if (!KEY) {
  console.error('[오류] POLLINATIONS_API_KEY 가 없습니다.\n  1) https://enter.pollinations.ai 에서 가입(GitHub 로그인)\n  2) Keys 메뉴에서 Secret key(sk_...) 발급\n  3) D:\\Claude\\Bernel\\.env.local 에 POLLINATIONS_API_KEY=<키> 한 줄 추가');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
for (const id of ids) { // 순차 실행 (per-user rpm 제한 고려)
  const p = PRESETS[id];
  if (!p) { console.error(`알 수 없는 프리셋: ${id}`); continue; }
  const [w, h] = SIZES[p.input.aspect_ratio] || [1024, 1024];
  const url = `${BASE}/image/${encodeURIComponent(p.input.prompt)}?model=${encodeURIComponent(model)}&width=${w}&height=${h}&seed=${seed}&nologo=true`;
  process.stdout.write(`▶ ${id} (${model}, ${w}x${h}) ... `);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(180000) });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.startsWith('image/')) {
      const body = (await res.text()).slice(0, 300);
      const hint = res.status === 401 ? '키 확인' : res.status === 402 ? 'Pollen 잔액 부족 또는 유료 전용 모델' : res.status === 429 ? '요청 한도 초과, 잠시 후 재시도' : '';
      throw new Error(`${res.status} ${hint} ${body}`);
    }
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const file = join(OUT_DIR, `${id}.${ext}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`저장 ${file}`); ok++;
  } catch (e) { console.log(`실패: ${e.message}`); }
}
console.log(`완료 ${ok}/${ids.length}`);
process.exitCode = ok === ids.length ? 0 : 1;

// CC0 에셋 내려받기 (Poly Haven 공개 API, 로그인 불필요). 사용: node tools/fetch_assets.mjs
// 결과: public/assets/polyhaven/{hdri,textures,models}/..., public/assets/CREDITS.md
// 총량 상한(MAX_MB)을 넘기면 멈춘다. 이미 받은 파일은 건너뛴다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/assets/polyhaven');
const MAX_MB = 280;
const UA = { 'User-Agent': 'bernel-asset-fetch' };

export const HDRIS = { kloofendal_48d_partly_cloudy_puresky: '2k' };
export const TEXTURES = {
  leafy_grass: 'ground_grass', forest_ground_04: 'ground_forest', rocky_trail: 'ground_road', cobblestone_floor_08: 'ground_cobble',
  river_small_rocks: 'ground_riverbed', rock_face: 'rock', castle_wall_slates: 'castle_wall', castle_brick_07: 'castle_brick',
  roof_slates_02: 'roof_slate', medieval_wood: 'timber', plastered_wall_04: 'plaster', bark_brown_02: 'bark', wood_planks: 'planks',
};
export const MODELS = [
  'boulder_01', 'rock_moss_set_01', 'shrub_01', 'shrub_02', 'shrub_04', 'fern_02', 'dead_tree_trunk', 'tree_stump_01',
  'barrel_03', 'wooden_barrels_01', 'wooden_crate_01', 'wooden_crate_02', 'wooden_bucket_01', 'wooden_lantern_01', 'spinning_wheel_01', 'wine_barrel_01',
];

let total = 0;
const credits = [];

async function json(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { total += fs.statSync(dest).size; return; }
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  total += buf.length;
  if (total > MAX_MB * 1e6) throw new Error(`총량 상한 ${MAX_MB}MB 초과`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

async function main() {
  for (const [id, res] of Object.entries(HDRIS)) {
    const f = await json(`https://api.polyhaven.com/files/${id}`);
    await download(f.hdri[res].hdr.url, path.join(ROOT, 'hdri', `${id}_${res}.hdr`));
    credits.push(`- HDRI: ${id} (${res}) — https://polyhaven.com/a/${id}`);
  }
  for (const [id, role] of Object.entries(TEXTURES)) {
    const f = await json(`https://api.polyhaven.com/files/${id}`);
    const maps = { diff: f.Diffuse?.['1k']?.jpg, nor: f.nor_gl?.['1k']?.jpg, arm: f.arm?.['1k']?.jpg, rough: f.Rough?.['1k']?.jpg };
    for (const [k, v] of Object.entries(maps)) if (v) await download(v.url, path.join(ROOT, 'textures', role, `${k}.jpg`));
    credits.push(`- 텍스처: ${id} → ${role} — https://polyhaven.com/a/${id}`);
  }
  for (const id of MODELS) {
    const f = await json(`https://api.polyhaven.com/files/${id}`);
    const g = f.gltf?.['1k']?.gltf;
    if (!g) { console.warn('glTF 없음', id); continue; }
    const dir = path.join(ROOT, 'models', id);
    await download(g.url, path.join(dir, `${id}.gltf`));
    for (const [rel, v] of Object.entries(g.include || {})) await download(v.url, path.join(dir, rel));
    credits.push(`- 모델: ${id} — https://polyhaven.com/a/${id}`);
  }
  const md = `# 사용한 외부 에셋 (모두 CC0)\n\n## Poly Haven (https://polyhaven.com, CC0 1.0)\n${credits.join('\n')}\n\n## KayKit Adventurers (Kay Lousberg, CC0)\n- public/models/kaykit/\n\n총 ${(total / 1e6).toFixed(1)}MB (Poly Haven)\n`;
  fs.writeFileSync(path.resolve('public/assets/CREDITS.md'), md);
  console.log(`완료: ${(total / 1e6).toFixed(1)}MB`);
}
main().catch((e) => { console.error(e); process.exit(1); });

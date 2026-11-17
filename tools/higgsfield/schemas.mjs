// 모델별 입력 검증.
// 출처: https://docs.higgsfield.ai/docs/openapi.json (보조 스펙) — 2026-11-18 확인
// 여기 없는 모델은 검증하지 않고(null 반환) 그대로 API에 보냄 — 카탈로그를 임의로 줄이지 않음.

const SCHEMAS = {
  'higgsfield-ai/soul/standard': {
    required: ['prompt'],
    props: {
      prompt: { type: 'string' },
      num_images: { type: 'integer', min: 1, max: 4 },
      resolution: { enum: ['720p', '1080p'] }, // 실제 API 응답 기준 (openapi.json 의 2K/4K 는 구버전),
      aspect_ratio: { enum: ['1:1', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '16:9', '9:16', '21:9'] },
    },
  },
};

export function validate(model, input) {
  const s = SCHEMAS[model];
  if (!s) return null;
  const errs = [];
  for (const r of s.required) if (input[r] === undefined || input[r] === '') errs.push(`필수 항목 누락: ${r}`);
  for (const [k, v] of Object.entries(input)) {
    const p = s.props[k];
    if (!p) { errs.push(`알 수 없는 항목: ${k}`); continue; }
    if (p.type === 'string' && typeof v !== 'string') errs.push(`${k}: 문자열이어야 함`);
    if (p.type === 'integer' && (!Number.isInteger(v) || (p.min != null && v < p.min) || (p.max != null && v > p.max)))
      errs.push(`${k}: ${p.min}~${p.max} 정수`);
    if (p.enum && !p.enum.includes(v)) errs.push(`${k}: ${p.enum.join(', ')} 중 하나`);
  }
  return errs;
}

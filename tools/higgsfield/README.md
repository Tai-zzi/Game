# Higgsfield 아트 생성 도구

베르넬 캐릭터·몬스터·배경 아트를 Higgsfield REST API로 생성하는 **개발용 CLI**입니다.
게임(브라우저)에서는 API를 호출하지 않습니다. 키는 로컬 `.env.local`에만 둡니다.

## 1. API 키 설정
1. https://open.higgsfield.ai/api-keys 에서 키를 만들고 복사합니다.
2. 프로젝트 루트(`D:\Claude\Bernel`)에 `.env.local` 파일을 만들고, 복사한 키를 **그대로** 붙여넣습니다.
   ```
   HF_API_KEY=여기에_복사한_키_그대로
   ```
   - `Key ` 접두어는 붙이지 않습니다. 도구가 `Authorization: Key <키>` 헤더를 만듭니다.
   - `.env.local`은 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## 2. 사용법 (프로젝트 루트에서)
```bash
node tools/higgsfield/generate.mjs --list                 # 프리셋 목록
node tools/higgsfield/generate.mjs player_mender          # 1개 생성 → public/art/player_mender.png
node tools/higgsfield/generate.mjs --all                  # 전체 프리셋 (순차 실행)
node tools/higgsfield/generate.mjs --model higgsfield-ai/soul/standard --prompt "..." --param aspect_ratio=1:1 --out my_art
node tools/higgsfield/generate.mjs --status <request_id>  # 상태 조회
node tools/higgsfield/generate.mjs --cancel <request_id>  # 대기 중 요청 취소
```
npm 스크립트: `npm run art -- player_mender`

- 실행 중 **Ctrl+C**를 누르면 진행 중인 요청에 실제 cancel 요청을 보냅니다.
- 상태 확인은 2초에서 시작해 1.5배씩 늘리고 최대 10초 간격으로 반복합니다. 터미널 상태는 completed / failed / nsfw / canceled입니다.
- 생성 요청(POST)이 응답 없이 끊겨도 **자동 재시도하지 않습니다**(중복 과금 방지).
- request_id는 `tools/higgsfield/requests.log.jsonl`에 기록됩니다. 키와 서명 URL은 기록하지 않습니다.

## 3. 모델
- 기본 모델은 `higgsfield-ai/soul/standard`입니다. openapi.json으로 입력 스키마를 확인했습니다(prompt, num_images 1~4, resolution 720p/1080p — openapi.json 은 2K/4K 로 적혀 있으나 실제 API 는 720p/1080p 만 허용, aspect_ratio).
- `--model`로 다른 경로도 사용할 수 있습니다. explore 페이지에 있는 이미지 모델은 Soul 2, Qwen Image 3, Recraft 4.1, Ideogram 4.0, Z-Image Turbo 등입니다.
  이 모델들의 입력 스키마는 **아직 검증하지 않았습니다**. 도구는 막지 않고 그대로 보내며, 경고만 출력합니다.
- Higgsfield REST API에는 **3D 생성 모델이 없습니다**(2026-11-18 기준). 3D는 다음 경로로 만듭니다.
  `public/art/*.png` (정면 전신) → Blender + Higgsfield 플러그인의 이미지→3D 변환 → `public/models/<id>.glb`

## 4. 게임에서의 사용
- `public/art/<id>_portrait.*`는 대화창과 타깃 프레임의 초상화로 씁니다.
- `public/models/<id>.glb`가 있으면 게임이 자동으로 이 3D 모델을 씁니다. 없으면 절차적 모델로 대체됩니다.

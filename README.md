# 글결 — 나만의 한글 손글꼴

브라우저에서 한글을 한 글자씩 직접 쓰고 OTF로 내려받는 Vue 3 + TypeScript 도구입니다. Ductus의 손글씨 → 글꼴 흐름을 참고해, 직접 쓰기와 문맥별 자소 조합을 함께 지원합니다. 원본 소스·브랜딩·이미지는 사용하지 않습니다.

## 사용하기

**직접 쓰기**와 **자소 조합** 탭은 입력 방법을 고르는 메뉴입니다. 두 탭의 작업은 함께 저장하고 내보내며, 직접 쓴 완성형 글자가 조합 글자보다 항상 우선합니다.

- **직접 쓰기:** 마우스·터치·펜으로 글자를 씁니다. 원하는 문장을 **글자 추가**에 넣으면 필요한 글자만 중복 없이 추가합니다. 최대 200개 완성형 글자를 개별 보완할 수 있습니다.
- **자소 조합:** 초성 4벌(76개), 중성 2벌(42개), 받침 2벌(54개), 총 172개 자소를 준비합니다. 받침 유무와 모음 방향에 맞는 형태를 고르고, 표시된 칸에 해당 자소만 씁니다. 가로·복합 모음에서 공유하는 초성은 배치에 맞게 조정합니다.
- **가·각 빠른 시작:** 5개 자소를 따라 쓰며 시작합니다. 처음 2개로 ‘가’, 나머지 3개까지 쓰면 ‘각’도 완성됩니다. 쓰기 칸 가까이에서 결과를 확인할 수 있습니다.
- **직접 보완:** 미리보기의 **문장의 글자 직접 보완**을 누르면 직접 쓰기로 전환합니다. 개별 글자를 지우면 준비된 조합 형태가 다시 적용됩니다.
- **글꼴 조절:** 획 굵기·글자 크기·자간을 미리보기와 OTF에 함께 적용합니다. Ctrl/Cmd+Z로 마지막 획을 취소할 수 있습니다.
- **글꼴 내보내기:** 직접 쓴 글자와 필요한 자소가 모두 준비된 조합 글자를 OTF에 담습니다. 172개 자소를 모두 준비하면 현대 한글 11,172자를 내보낼 수 있습니다. 글꼴 생성은 Web Worker에서 진행하며 진행률 표시와 취소를 지원합니다.

미리보기에서 크림색은 직접 쓴 글자, 연두색은 자소 조합, 연한 기본 글꼴은 아직 준비되지 않은 글자입니다. 필요한 자소가 부족한 음절은 일부 자소만 섞어 표시하거나 폰트에 포함하지 않습니다. AI 학습·추정은 사용하지 않는 규칙 기반 조합입니다. 자소를 조합한 글자의 자연스러움은 입력한 형태와 조합에 따라 달라지므로, 중요한 글자는 직접 써서 보완할 수 있습니다.

작업은 이 브라우저의 localStorage에 자동 저장하며 서버나 계정으로 동기화하지 않습니다. **작업 저장**으로 JSON을 보관하고 **불러오기**로 다른 기기에서 이어서 편집할 수 있습니다. 새 작업 파일은 version 2이며, 기존 version 1 파일도 불러옵니다. 기존 저장 작업은 자동으로 읽고 별도 v2 키에 저장하므로 예전 저장본을 덮어쓰지 않습니다. OTF 역편집은 지원하지 않습니다. 화면용 Google Fonts 요청은 있지만 손글씨 데이터는 전송하지 않습니다.

## 로컬 개발

Node.js 24 권장.

```sh
npm ci
npm run dev
npm run build
```

- `src/App.vue`: 작업 화면·저장·불러오기
- `src/components/WritingPad.vue`: 포인터/필압 입력
- `src/font.ts`: 획 윤곽·작업 검증·OTF 생성
- `src/hangul.ts`: 172개 자소 구성·배치·완성형 우선 규칙
- `src/font.worker.ts`: 진행률·취소를 지원하는 글꼴 생성
- `src/style.css`: 반응형 디자인

```sh
npx playwright install chromium
npm run test:e2e
python3 -m unittest discover -s tests -v
```

PC·모바일 브라우저 테스트에서 그리기/되돌리기/저장 복원/사용자 글자 추가/JSON 입출력/OTF 파싱과 실제 FontFace 로드를 검사합니다. 조합 테스트는 부분 자소의 누락 처리, 직접 글자 우선과 조합 복귀, 구버전 작업 이관, 11,172자 전체 커버리지와 OTF 내보내기·취소를 포함합니다. 기존 PC Chrome으로 검사하려면 `PLAYWRIGHT_CHROME=1 npm run test:e2e`를 사용합니다.

서버용 비밀값을 `VITE_*`에 넣지 마세요. 프론트 번들에 포함됩니다. DB·영속 볼륨은 사용하지 않습니다.

## 배포 흐름

```text
main push / 수동 실행 → 타입 검사·빌드·배포 스크립트 테스트·컨테이너 HTTP 검사
                    → 검증된 소스를 deploy 브랜치에 게시
                    → Coolify 배포 요청 (최초 연결 후 활성화)
                    → 배포 완료 + 외부 version.json의 원본 SHA 확인
```

PR에서는 검사만 실행합니다. `deploy`는 Actions가 관리하는 자동 생성 브랜치입니다. 직접 작업하지 말고 `main`에서 수정하세요. 배포 작업은 직렬 실행하며, 시작할 때 이미 새 main 커밋이 있으면 이전 작업은 건너뜁니다. Coolify는 검증된 `deploy` 브랜치를 빌드하므로 검사 중인 main을 배포하지 않습니다. 별도 GHCR 계정·레지스트리 인증은 필요 없습니다.

## 최초 Coolify 연결 — 사용자 실행

1. 첫 [Actions](https://github.com/deepria/temp/actions) 실행이 성공하고 `deploy` 브랜치가 생성됐는지 확인합니다.
2. Coolify의 **deepria → production → New Resource → Public Repository**에서 앱을 생성합니다. 기존 앱이 있으면 새로 만들지 말고 같은 값을 적용합니다.

| 설정 | 값 |
| --- | --- |
| Repository | `https://github.com/deepria/temp.git` |
| Branch | **`deploy`** |
| Build Pack | **Dockerfile** |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | **`8080`** |
| Domains | **`http://temp.deepria.com`** |
| Auto Deploy | **꺼짐 / Manual deployments only** |
| Health Check | HTTP, port `8080`, path `/healthz`, expected `200` |
| Memory / CPU | 예: `128m` / `0.5`, 빌드 자원 제한은 별도 |
| Storage / DB / Port mappings | 추가하지 않음 |

기존 구성이 Cloudflare Tunnel에서 HTTPS를 종료하고 Traefik에 HTTP로 전달하는 구조이므로 Coolify 도메인은 `http://`로 지정합니다. 사용자 접속은 `https://temp.deepria.com`입니다. 별도 origin TLS 구조라면 실제 구성에 맞추세요.

3. **기존 `deepria-web-platform` Tunnel**에 Published application route를 추가합니다.
   - Hostname: `temp.deepria.com`
   - Service: `http://127.0.0.1:80`
   - DNS가 이 Tunnel을 가리키는지 확인합니다. 기존 Tunnel이나 다른 앱 경로는 변경하지 않습니다.
   - 현재 Tunnel이 로컬 ingress 파일 관리 방식이면 해당 파일에서 마지막 catch-all 앞에 같은 경로를 추가하고, 기존 운영 절차로 반영합니다.
   - 이 앱은 공개 실험 화면입니다. 별도 Access 로그인 정책을 붙이면 Actions의 공개 revision 검증도 해당 인증 방식에 맞게 수정해야 합니다.
4. Coolify에서 **Deploy**를 눌러 최초 수동 배포합니다. 외부 `/healthz`가 `ok`, `/version.json`이 최신 main SHA를 반환하는지 확인합니다.
5. [GitHub → Settings → Secrets and variables → Actions](https://github.com/deepria/temp/settings/secrets/actions)에 다음을 등록합니다. 토큰 원문을 코드·문서·채팅에 적지 않습니다.

**Repository secrets**

| 이름 | 값 / 권한 |
| --- | --- |
| `CF_ACCESS_CLIENT_ID` | 기존 Coolify API용 Cloudflare Service Auth client ID |
| `CF_ACCESS_CLIENT_SECRET` | 해당 service token secret |
| `COOLIFY_READ_TOKEN` | 이 앱 팀의 Coolify `read` 토큰 |
| `COOLIFY_DEPLOY_TOKEN` | 이 앱 팀의 Coolify `deploy` 토큰 |

기존 API 경로 `coolify.deepria.com/api/v1/*`의 Service Auth 정책을 사용합니다. 다른 레포의 secret 값은 자동 복사되지 않으므로 같은 보관 위치에서 직접 등록합니다. 전체 Access/WAF를 해제할 필요가 없습니다.

**Repository variables** ([등록 화면](https://github.com/deepria/temp/settings/variables/actions))

| 이름 | 값 |
| --- | --- |
| `COOLIFY_APPLICATION_UUID` | 위에서 만든 **앱** UUID. 프로젝트 UUID가 아님 |
| `COOLIFY_DEPLOY_ENABLED` | 설정을 마친 뒤 **`true`** |

6. Actions → **CI & Deploy → Run workflow → main**으로 첫 자동 배포를 검증합니다. 성공한 뒤부터 `main`에 push하면 자동 반영됩니다. 처음에는 활성화 변수가 없으므로 CI와 deploy 브랜치 게시까지만 실행되고, 운영 배포는 명시적으로 건너뜁니다.

공식 참고: [Dockerfile 배포](https://coolify.io/docs/applications/builds/dockerfile), [자동 배포 설정](https://coolify.io/docs/applications/deployments/automatic-deployments), [Deploy API](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid).

## 운영 확인과 복구

- `https://temp.deepria.com/healthz`: nginx HTTP 상태.
- `https://temp.deepria.com/version.json`: 실제 서빙되는 원본 main SHA. 관리 토큰을 보내지 않습니다.
- Actions는 요청 수락뿐 아니라 Coolify의 배포 완료와 외부 SHA 일치까지 기다립니다. 실패하면 Coolify 배포 로그와 DNS/Tunnel 경로를 확인합니다. 배포 요청은 중복 방지를 위해 자동 재시도하지 않습니다.
- 이전 상태로 되돌릴 때는 `main`의 문제 커밋을 revert하고 push합니다. 동일 검증·배포 절차를 거칩니다.
- 코드·Dockerfile·화면만 바꿀 때는 서버에 접속할 필요가 없습니다. DB/파일 저장 기능을 붙일 때는 별도 영속 저장소·백업 등록이 필요합니다.
- 초기 구성은 영속 mount를 추가하지 않습니다. 기존 플랫폼 백업 정책이 계속 정상인지 운영 화면에서 확인하세요.

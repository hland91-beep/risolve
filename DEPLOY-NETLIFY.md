# Netlify 배포 — 자동조회 켜기 (5분, 1회)

GitHub Pages 는 정적 파일만 서빙해서 **자동조회(종목번호→자동 채우기)** 가 안 됩니다.
자동조회 서버(프록시)는 **Netlify** 에 올려야 합니다. 이 저장소는 이미 배포 준비가 끝나 있어
**연결 + 키 입력**만 하면 됩니다. (수기 입력은 어디서나 그대로 작동합니다.)

## 무엇이 필요한가

| 자동조회 항목 | 프록시 | 필요한 키 |
|---|---|---|
| 밸류(PER·PBR·ROE·배당) · 실적 · 컨센서스(목표주가) | `quote-fundamentals.js` (Yahoo) | **없음** ✅ |
| 국내 재무(부채비율·FCF 등 정밀) | `quote-dart.js` (DART) | DART 무료키 |
| 수급(외국인·기관 순매수) | `quote-kis-flow.js` (KIS) | KIS 앱키·시크릿 |

> **키를 하나도 안 넣어도** 밸류·실적·컨센서스 자동조회는 바로 됩니다(Yahoo, 키 불필요).
> 수급 자동조회만 KIS 키가 필요합니다.

## 단계

### 1) 저장소를 Netlify 에 연결
1. https://app.netlify.com → **Add new site → Import an existing project**
2. GitHub 선택 → `hland91-beep/risolve` 선택
3. 빌드 설정은 **그대로 두고**(이 저장소의 `netlify.toml` 이 자동 적용) **Deploy** 클릭
   - publish = `.` (루트), functions = `netlify/functions` 가 자동 인식됩니다.
4. 배포 완료되면 `https://<사이트이름>.netlify.app` 주소가 생깁니다.

### 2) API 키를 환경변수로 등록 (코드에 넣지 말 것)
Netlify 사이트 → **Site configuration → Environment variables → Add a variable** 에서:

- 수급(KIS) 쓰려면:
  - `KIS_APP_KEY` = 발급받은 앱키
  - `KIS_APP_SECRET` = 발급받은 앱시크릿
  - `KIS_BASE` = `https://openapi.koreainvestment.com:9443` (실전) / 모의계좌면 모의 주소
  - 발급: 한국투자증권 계좌 → [KIS Developers](https://apiportal.koreainvestment.com)
- 국내 재무(DART) 쓰려면:
  - `DART_API_KEY` = [opendart.fss.or.kr](https://opendart.fss.or.kr) 무료 발급
- 밸류/실적/컨센(Yahoo): **키 불필요** — 아무것도 안 해도 됨.

환경변수를 추가했으면 **Deploys → Trigger deploy → Deploy site** 로 한 번 재배포하세요(키 반영).

### 3) 끝 — 자동조회 사용
`https://<사이트이름>.netlify.app/valuation-flow.html` 접속 →
"종목번호로 자동 채우기" 열고 **005930** 입력 → **자동조회 → 채우기**.
- 밸류·실적·컨센서스: 즉시 채워짐
- 수급: KIS 키가 있으면 채워짐(없으면 "미반영"으로 표시, 수기 입력 병행)

### (선택) 종목코드→DART 고유번호 매핑 채우기
`quote-dart` 로 국내 재무를 종목코드로 조회하려면 매핑이 필요합니다:
```bash
DART_API_KEY=키 node tools/build-corp-map.mjs   # netlify/functions/corp-map.json 생성 → commit
```
현재는 삼성전자(005930)만 시드돼 있고, 위 스크립트로 전체 상장사를 채운 뒤 커밋하면 됩니다.

## 참고
- 함수는 CORS 를 열어두어(`Access-Control-Allow-Origin: *`) GitHub Pages 사본에서도
  절대경로(`https://<사이트>.netlify.app/.netlify/functions/...`)로 부르면 자동조회를 쓸 수 있습니다.
  기본값은 상대경로라 **Netlify 사이트에서** 바로 동작합니다.
- KIS 수급 응답 필드가 계정/버전에 따라 다를 수 있으니, 처음엔
  `.../.netlify/functions/quote-kis-flow?code=005930&debug=1` 로 원본 키를 확인하세요.
- 키는 **오직 Netlify 환경변수에만**. 코드·커밋에 넣지 마세요.

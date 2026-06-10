# Risolve — 은퇴준비자금 계산기 (프로젝트 메모리)

## 제품 구성
- **단일 HTML 파일 앱** (인라인 JS ~17,000줄, 빌드 도구 없음). 한국어, 재무상담사용 은퇴자금 계산기.
- `basestore.html` — **플레이스토어 정식판** 원본 (`com.risolve.totalrisolution`, Capacitor 안드로이드 앱으로 패키징). 2026-06-10 프로덕션 액세스 승인됨.
- `trial/index.html` — 체험판 (license.js 게이팅 포함, basestore와 코드 분기됨 — 11k줄 vs 28k줄로 상당히 다름)
- `free.html` — 무료판 / `index.html` — 랜딩
- 외부 라이브러리: `js/chart.min.js`, `js/html2canvas.min.js`, `js/jspdf.umd.min.js` (로컬 동봉)
- DEMO_MODE(체험판 잠금)는 URL파라미터/경로(`/trial/`,`/demo/`)/호스트명/localStorage `__ri_demo`로 활성화 — 프로덕션 APK에선 비활성이 정상

## 2026-06-10 세션: 출시 전 환불리스크 정밀검증 + 수정 (PR #1)
사용자가 업로드한 basestore.html(저장소에 없던 파일)을 검증 후 수정해 저장소에 추가함.
브랜치 `claude/base-store-refund-validation-fmg03r`, 커밋 `4455b5e`, **PR #1** (https://github.com/hland91-beep/risolve/pull/1).

### 수정 완료 4건 (모두 헤드리스 Chromium 실구동으로 수정 전 재현 + 수정 후 통과 확인)
1. **무한재귀 2건**: `initCalcTabReverse`/`updateLiquidityGauge`를 같은 스크립트에서 재선언하며
   `const _orig = (구함수)` 패턴 사용 → 함수 선언 호이스팅으로 `_orig`가 래퍼 자신을 참조 → RangeError가
   `try{}catch(_){}`에 삼켜져 **바스켓 카드 영구 미표시 + 유동성 게이지 영구 미갱신**.
   → 원본을 `_initCalcTabReverseBase`/`_updateLiquidityGaugeBase`로 개명, 래퍼가 베이스를 직접 참조.
   ⚠️ 이 패턴이 또 나오면 같은 버그: 같은 스크립트 내 `function f(){}` 2회 선언 시 마지막 선언이 처음부터 이김.
2. **유동성 게이지 데이터 계약**: 게이지가 `portfolioCache.krStock` 등 존재하지 않는 세부 키를 읽어 항상 합계 0
   → `updatePortfolio`가 `liquidTotal/pensionTotal/illiquidTotal` 카테고리 합계를 캐시에 기록, 게이지가 이를 사용.
3. **시나리오 C 키 오타**: `pc.investRe`(소문자) → 실제 키는 `investRE` → 투자부동산 매각 시나리오 항상 0
   → `pc.investRe || pc.investRE` 폴백 (2곳).
4. **CSP `img-src`에 `data:`/`blob:` 누락** → html2canvas가 SVG·data-URI 이미지 차단되어 PDF에 빈칸
   → `img-src 'self' data: blob: https://hland91-beep.github.io` 추가.

### 검증 통과 항목 (수정 불필요)
- 구문/로드/11개 탭 순회 에러 0건, UI에 NaN/undefined 노출 없음
- 저장→불러오기 왕복·고객 2명 교차 전환 안정 (generic 전필드 저장 + 마이그레이션 로직 견고)
- PDF 2종(`doSavePdf`, `exportFullReport`) 생성·다운로드 성공
- 미존재 ID 참조 23건 전부 동적 생성 또는 null 가드됨, DOM ID 중복 0건

### 미수정 잔여 이슈 (다음 세션 후보)
- **[중간] 연금 탭을 열기만 해도 진단 결과 변동** (필요자금 12.4억→9.3억, 국민연금 자동추정이 탭 진입 시 주입).
  의도된 기능으로 보이나 일관성 리스크 — 첫 계산부터 자동 반영 or 반영 안내 배지 검토. **사용자 의사결정 필요.**
- [낮음] 죽은 중복 함수: `calcIsaTransferSim`·`calcAcctCompare` 2회 선언 (뒤 정의=getTaxConfig 버전이 최신이라 동작 정상, 앞 정의는 죽은 코드)
- [낮음] `updateCalcRv`(부족분 역산 슬라이더): gap을 총액인데 월액으로 해석하는 단위 오류 — 해당 슬라이더 UI(`calc-rv-*`)가 HTML에 없어 현재 미실행(죽은 코드)
- trial/index.html에는 basestore 수정사항 미반영 (코드베이스 분기 상태 — 동기화 여부 확인 필요)

### 출시 전 APK 체크리스트 (코드 외부, 미확인)
1. APK 내 웹 자산 경로에 `trial`/`demo` 문자열 금지 (DEMO_MODE 오발동)
2. `@capacitor/filesystem` + `@capacitor/share` 네이티브 플러그인 포함 확인 (PDF 저장 1순위 경로)
3. 실기기: 유동성 게이지 / 바스켓 카드 / PDF 저장 3종 확인

## 검증 환경 재구축 방법 (헤드리스 테스트)
```bash
cd /tmp && npm i playwright-core @sparticuz/chromium   # playwright install은 이 컨테이너에서 실패함
node -e "require('@sparticuz/chromium').default.executablePath().then(p=>console.log(p))"  # /tmp/chromium 추출
# 앱은 file:// 로 로드 가능. js/ 폴더를 html 옆에 복사 필요.
# 입력은 el.value 설정 후 input+change 이벤트 dispatch. 웰컴모달은 _closeWelcomeModal(false).
# 고객 저장/불러오기: saveClientData() / loadClientData('ri_client_이름')
```
단위 주의: 자산 입력 `a-*`는 부동산=천만원(×1000), 금융=백만원(×100) 단위, 내부 계산은 만원. `_calcResult.gap`은 **총액(만원)**.

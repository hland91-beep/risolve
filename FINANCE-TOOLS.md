# 금융 분석 도구 스위트 — 밸류·수급·펀더멘털·컨센서스·종합

컨설턴트(하나증권·KB라이프) PB/상담 실무용 경량 웹 도구. 바닐라 HTML/CSS/JS **단일 파일**,
빌드 없음, 브라우저로 바로 열림. **manual-first**(수기 입력으로 오프라인 100% 동작),
자동 조회는 선택(프록시 배포 시). 공통 다크 테마, "투자 권유 아님" 푸터.

## 도구 (열어서 바로 사용)

| 파일 | 답하는 질문 | 입력 | 출력 |
|---|---|---|---|
| **`report.html`** | **이 종목, 한눈에?** | **종목명 또는 종목번호 1개** (Netlify 배포본에서 자동 조회) | **한 장 종합 보고서**: 종합 등급 + 쉬운 요약 + 항목별 카드(값·실적·기대·수급·차트) + 적정가 + 나눠 살/줄일 가격대 + 체크리스트 |
| `valuation-flow.html` | 싼가? 큰손이 사나? | PER·PBR·ROE·배당·(업종PER/PBR) / 외국인·기관 순매수 | 밸류 스코어·적정가 밴드, 수급 스코어·방향·추세·강도, **밸류×수급 매트릭스** |
| `fundamentals-flow.html` | 사업이 좋아지나? 시장 기대는? | 매출/EPS성장·ROE·마진·부채·FCF·서프라이즈 / 목표주가·투자의견·추이 | 실적 스코어, 컨센서스 스코어(상단여력), **실적×컨센서스 융합** |
| `scorecard.html` | 종합적으로? | 5축(밸류·수급·실적·컨센서스·기술)+매크로 각 −2~+2, 매크로는 RS 간이계산 | 가중합 → **등급 → 대응**, 축별 기여도, 대응 매트릭스 |

각 도구 상단 내비로 서로 이동. 세 도구 모두 `예시 채우기`로 동작을 먼저 확인할 수 있습니다.

### 워크플로
1. `valuation-flow` + `fundamentals-flow` 로 밸류·수급·실적·컨센서스 4축 점수를 얻고
2. (별도) 기술적 대응존은 `zone-analyzer` 의 지지/저항 = **집행 타이밍 축**
3. `scorecard` 에 5축(+매크로)을 넣어 **종합 등급·대응**으로 융합

## 점수 규칙 (요약)

- **밸류/수급**: HANDOFF §5 검증 로직 그대로 이식(`scoreVal/scoreFlow/streak/matrix`).
  적정PBR은 업종PBR, 없으면 `ROE/8`(요구수익률 8% 가정). 수급은 부호 기반(순매수/순매도).
- **실적**: 7개 신호(성장·수익성·안정성·서프라이즈) net 집계 → −2~+2. **업종 프리셋**(일반·제조 /
  IT·성장주 / 금융·지주 / 바이오·제약 / 유틸·배당)으로 ±판정 임계값 보정 — 금융은 영업이익률·부채비율
  판정 제외, 바이오는 적자 감점 완화 등. (예: 부채 300%·영업이익률 3%인 은행이 일반=부진 −1 → 금융=양호 +1)
- **컨센서스**: 상단여력(+15%↑ 우호)·투자의견·목표가 추이 → −2~+2.
- **종합**: 입력 축의 가중평균(기본 밸류25·수급20·실적25·컨센15·기술15·매크로10, 조정 가능,
  미입력 축 자동 제외·정규화). 등급: `≥+1.2 적극매수 / ≥+0.4 매수 / >−0.4 중립 / >−1.2 매도·축소 / else 회피`.

## 자동 조회 프록시 (선택 — 개인용이면 수기 입력만으로 충분)

수기 입력이 귀찮을 때만 배포. `netlify/functions/` 에 두고 Netlify 배포.

| 프록시 | 얻는 것 | 키 | 상태 |
|---|---|---|---|
| `quote-search.js` | 종목명 → 종목코드 (한글 검색, Yahoo search) | 불필요 | report.html 이 사용 |
| `quote-fundamentals.js` | PER·PBR·배당·ROE·성장·마진·목표주가·투자의견 (Yahoo quoteSummary) | 불필요 | 초안 — Yahoo 한국 재무 결측 잦음 |
| `quote-dart.js` | 부채비율·영업이익률·ROE·매출/이익 성장·FCF (DART 국내 정의) | DART 무료키(env) | 초안 — corp_code(8자리) 필요 |
| `quote-kis-flow.js` | 외국인·기관 순매수(수급) (KIS 투자자별) | KIS 앱키(env) | 초안 — **tr_id/필드 검증 필요** |
| `quote-yahoo.js` / `quote.js` | 일봉(대응존용) | 없음 / KIS | 기존 |

`quote-dart.js`·`quote-fundamentals.js` 는 반환 스키마가 같아(`fundamentals.*`, `valuation.roe`)
`fundamentals-flow.html` 의 `FUND_URL` 에 어느 쪽이든 꽂을 수 있습니다. DART 는 국내 소형주 재무가
정확하지만 종목코드(6자리)→고유번호(8자리) 매핑이 필요합니다(예: 삼성전자 005930→00126380).

- Yahoo `quoteSummary` 는 **크럼+쿠키**가 필요해 브라우저 직접 호출 불가 → 서버 프록시 필수.
  `quote-fundamentals.js` 가 ①쿠키 ②크럼 ③quoteSummary 순서로 처리.
- KIS 수급은 계정/문서 버전에 따라 **tr_id·필드명이 다름**. `quote-kis-flow.js` 상단 경고 참고,
  배포 전 본인 앱키 문서로 tr_id(`FHKST01010900` 후보)·output 필드 확인·보정.
- 환경변수: `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_BASE`. 코드에 하드코딩 금지.

### HTML 에서 자동 채우기 배선 ✅ (Netlify 배포 시 즉시 동작)
`valuation-flow.html`·`fundamentals-flow.html` 상단 "종목번호로 자동 채우기" 패널의 URL 상수가
**Netlify 함수 상대경로로 미리 배선**되어 있습니다. `netlify.toml` 포함 → **저장소 연결 + 키 입력**만 하면
종목번호로 폼이 채워집니다. 함수가 없는 곳(GitHub Pages·로컬)에서는 "연결 안 됨" 안내 후 수기 유지(manual-first 불변).
- `valuation-flow.html`: `FUND_URL`(밸류·Yahoo·키불필요) + `FLOW_URL`(수급·KIS)
- `fundamentals-flow.html`: `FUND_URL`(실적·컨센서스; Yahoo 기본, DART 로 교체 가능)
- 배포 절차: **`DEPLOY-NETLIFY.md`** 참고. 자동 미제공 필드(업종평균 PER/PBR, 목표가 추이, 어닝 서프라이즈)는 수기 보완.

## 로드맵 상태

- **Phase 1 ✅**: 수급 + 밸류에이션 (`valuation-flow.html`)
- **Phase 2 ✅**: 펀더멘털·실적 + 컨센서스·목표주가 (`fundamentals-flow.html`)
- **Phase 3 ✅**: 매크로·RS + 5축 종합 스코어카드 (`scorecard.html`)
- **자동조회 초안 ✅**: `quote-fundamentals.js`(Yahoo), `quote-kis-flow.js`(KIS 수급), `quote-dart.js`(DART 재무)
- **자동채우기 배선 ✅**: valuation-flow·fundamentals-flow 종목번호 자동조회
- **정교화 ✅**: KIS 엔드포인트/필드 확정(FHKST01010900, qty/amt 모드, `?debug=1` 키 확인),
  업종 프리셋, 종목코드→고유번호 매핑(`tools/build-corp-map.mjs` + 번들 `corp-map.json`)
- **테스트 ✅**: `node test/proxies.test.mjs` — 변환·계산 로직 fixture 검증(13 케이스)
- **다음(선택·환경 필요)**: KIS 실계정으로 `?debug=1` 응답키 최종 확인, `build-corp-map` 실행으로
  전체 상장사 매핑 생성, Netlify 배포 후 end-to-end 확인

## 견고성 · 테스트

입력 오류로 인한 **오출력(NaN·Infinity·잘못된 등급)을 0으로** 하는 것을 목표로 방어 로직과
자동 테스트를 갖췄습니다.

- **엣지케이스 방어**: 적자(음수 PER)는 저평가로 오판하지 않고 감점, 자본잠식(PBR≤0)·업종PER≤0 은
  판정 보류, 0원·0으로 나눗셈은 밴드/상단여력 산출에서 제외(Infinity 차단), 음수 자본(부채<0)은
  자본잠식 경고, 스코어카드 가중치 합 0 은 가드, 판정 태그는 문자열 추측이 아니라 스코어에서 직접 부여.
- **테스트 35케이스 전부 통과**(`npm test`): 프록시 변환·계산 13, UI 로직·엣지 22.
  검증 케이스(삼성풍 밴드 268,977~310,818 등)를 회귀로 고정, 모든 결과에 NaN/Infinity/∞/undefined
  가 없고 JS 에러 0 임을 실제 브라우저로 확인.

> ⚠️ **보장 범위**: 위 "0 오류"는 **소프트웨어 동작**(입력→출력 계산)의 정확성입니다.
> **투자 결과(수익·손실)를 보장하지 않습니다.** 이 도구는 판단을 *구조화*할 뿐 주가를 예측하지 않으며,
> 스코어는 사용자가 넣은 값·업종 임계값·규칙에 의존합니다. 실제 매매 결정과 책임은 이용자 본인에게 있습니다.

## 테스트 / 매핑 생성

```bash
npm test                                        # 프록시 13 + UI 22 케이스 (UI는 playwright 필요)
node test/proxies.test.mjs                       # 프록시만 (네트워크·의존성 불필요)
DART_API_KEY=키 node tools/build-corp-map.mjs   # 종목코드→고유번호 corp-map.json 생성(전체 상장사)
```
번들 `corp-map.json` 에는 검증된 예시(삼성전자 005930→00126380)만 있습니다. 다른 종목은 위 스크립트로 채우세요.

> 참고: 이 도구들은 기술적 대응존(zone-analyzer)과 짝을 이룹니다. 대응존은 "언제·어디서"(타이밍),
> 본 스위트는 "왜·살 만한가"(가치·실적·수급·기대)에 답합니다.

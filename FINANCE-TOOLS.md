# 금융 분석 도구 스위트 — 밸류·수급·펀더멘털·컨센서스·종합

컨설턴트(하나증권·KB라이프) PB/상담 실무용 경량 웹 도구. 바닐라 HTML/CSS/JS **단일 파일**,
빌드 없음, 브라우저로 바로 열림. **manual-first**(수기 입력으로 오프라인 100% 동작),
자동 조회는 선택(프록시 배포 시). 공통 다크 테마, "투자 권유 아님" 푸터.

## 도구 (열어서 바로 사용)

| 파일 | 답하는 질문 | 입력 | 출력 |
|---|---|---|---|
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
- **실적**: 7개 신호(성장·수익성·안정성·서프라이즈) net 집계 → −2~+2. 임계값은 범용 rule-of-thumb.
- **컨센서스**: 상단여력(+15%↑ 우호)·투자의견·목표가 추이 → −2~+2.
- **종합**: 입력 축의 가중평균(기본 밸류25·수급20·실적25·컨센15·기술15·매크로10, 조정 가능,
  미입력 축 자동 제외·정규화). 등급: `≥+1.2 적극매수 / ≥+0.4 매수 / >−0.4 중립 / >−1.2 매도·축소 / else 회피`.

## 자동 조회 프록시 (선택 — 개인용이면 수기 입력만으로 충분)

수기 입력이 귀찮을 때만 배포. `netlify/functions/` 에 두고 Netlify 배포.

| 프록시 | 얻는 것 | 키 | 상태 |
|---|---|---|---|
| `quote-fundamentals.js` | PER·PBR·배당·ROE·성장·마진·목표주가·투자의견 (Yahoo quoteSummary) | 불필요 | 초안 — Yahoo 한국 재무 결측 잦음 |
| `quote-kis-flow.js` | 외국인·기관 순매수(수급) (KIS 투자자별) | KIS 앱키(env) | 초안 — **tr_id/필드 검증 필요** |
| `quote-yahoo.js` / `quote.js` | 일봉(대응존용) | 없음 / KIS | 기존 |

- Yahoo `quoteSummary` 는 **크럼+쿠키**가 필요해 브라우저 직접 호출 불가 → 서버 프록시 필수.
  `quote-fundamentals.js` 가 ①쿠키 ②크럼 ③quoteSummary 순서로 처리.
- KIS 수급은 계정/문서 버전에 따라 **tr_id·필드명이 다름**. `quote-kis-flow.js` 상단 경고 참고,
  배포 전 본인 앱키 문서로 tr_id(`FHKST01010900` 후보)·output 필드 확인·보정.
- 환경변수: `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_BASE`. 코드에 하드코딩 금지.

### HTML 에서 자동 채우기 배선(선택)
각 HTML 상단에 URL 상수를 두고 종목번호로 `fetch` → 반환 필드를 폼 input 에 채우면 됨
(예: `quote-fundamentals` → `valuation`/`fundamentals`/`consensus` 필드, `quote-kis-flow` → `summary`의 f5/i5/... ).
현재 HTML 은 manual-first 로만 배포되어 있으며, 배선은 다음 단계.

## 로드맵 상태

- **Phase 1 ✅**: 수급 + 밸류에이션 (`valuation-flow.html`)
- **Phase 2 ✅**: 펀더멘털·실적 + 컨센서스·목표주가 (`fundamentals-flow.html`)
- **Phase 3 ✅**: 매크로·RS + 5축 종합 스코어카드 (`scorecard.html`)
- **자동조회 초안 ✅**: `quote-fundamentals.js`, `quote-kis-flow.js`
- **다음(선택)**: HTML↔프록시 자동채우기 배선, KIS tr_id 실계정 검증, DART 재무 보강

> 참고: 이 도구들은 기술적 대응존(zone-analyzer)과 짝을 이룹니다. 대응존은 "언제·어디서"(타이밍),
> 본 스위트는 "왜·살 만한가"(가치·실적·수급·기대)에 답합니다.

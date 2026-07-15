// ============================================================================
//  quote-dart.js — 국내 재무 자동조회 프록시 (Netlify Function)
//  DART OpenAPI 단일회사 전체 재무제표(fnlttSinglAcntAll)에서 국내 정의 기준
//  부채비율·영업이익률·ROE·매출/이익 성장·FCF 를 계산합니다. Yahoo 결측이 잦은
//  국내 소형주에 특히 유용. quote-fundamentals.js 와 동일한 반환 스키마라
//  fundamentals-flow.html 의 FUND_URL 대체로도 쓸 수 있습니다.
//
//  배포:
//    1) 이 파일을 <프로젝트>/netlify/functions/quote-dart.js 에 둠
//    2) Netlify 환경변수: DART_API_KEY (opendart.fss.or.kr 무료 발급)
//    3) fundamentals-flow.html:  const FUND_URL = "/.netlify/functions/quote-dart?corp={corp}";
//
//  쿼리: ?corp=00126380 (고유번호 8자리) 또는 ?code=005930 (종목코드 6자리; corp-map.json 조회)
//        &year=2025(선택; 기본 전년) &fs=CFS|OFS(선택; CFS 실패 시 OFS 자동 폴백)
//    ※ 종목코드→고유번호 매핑: tools/build-corp-map.mjs 로 DART corpCode.xml 을 받아
//      corp-map.json 을 생성해 이 폴더에 두면 code 파라미터로 바로 조회됩니다.
//      (번들 corp-map.json 에는 검증된 예시 몇 종목이 들어 있음)
//  반환(quote-fundamentals 와 동일 형태):
//    { meta:{name,corp,year,fs}, valuation:{roe},
//      fundamentals:{revenueGrowth,earningsGrowth,operatingMargin,debtToEquity,freeCashflow},
//      raw:{revenue,operatingIncome,netIncome,liabilities,equity,ocf,capex} }
// ============================================================================

const KEY = process.env.DART_API_KEY;
const num = v => { if (v == null) return null; const s = String(v).replace(/,/g, "").replace(/^\((.*)\)$/, "-$1"); const n = Number(s); return isFinite(n) ? n : null; };
const pctOf = (a, b) => (a == null || !b) ? null : +((a / b) * 100).toFixed(2);
const growth = (th, fr) => (th == null || fr == null || fr === 0) ? null : +(((th - fr) / Math.abs(fr)) * 100).toFixed(2);

// 계정 조회: sj_div(재무제표 구분) + 계정명 후보(공백 제거 부분일치). 당기/전기 금액 반환.
function pick(list, sjs, names) {
  const S = Array.isArray(sjs) ? sjs : [sjs];
  for (const it of list) {
    if (S.length && !S.includes(it.sj_div)) continue;
    const nm = (it.account_nm || "").replace(/\s/g, "");
    if (names.some(n => nm.includes(n))) return { th: num(it.thstrm_amount), fr: num(it.frmtrm_amount) };
  }
  return { th: null, fr: null };
}

// list(fnlttSinglAcntAll.list) → 폼 매핑 스키마 (순수, 테스트에서 import)
function computeDart(list, meta) {
  const rev = pick(list, ["IS", "CIS"], ["매출액", "수익(매출액)", "영업수익"]);
  const op = pick(list, ["IS", "CIS"], ["영업이익"]);
  const ni = pick(list, ["IS", "CIS"], ["당기순이익", "당기순손익", "분기순이익"]);
  const liab = pick(list, "BS", ["부채총계"]);
  const eq = pick(list, "BS", ["자본총계"]);
  const ocf = pick(list, "CF", ["영업활동현금흐름", "영업활동으로인한현금흐름"]);
  const capex = pick(list, "CF", ["유형자산의취득", "유형자산의증가"]);
  const fcf = ocf.th != null ? ocf.th - Math.abs(capex.th || 0) : null;
  return {
    meta: meta || {},
    valuation: { roe: pctOf(ni.th, eq.th) },
    fundamentals: {
      revenueGrowth: growth(rev.th, rev.fr),
      earningsGrowth: growth(ni.th, ni.fr),
      operatingMargin: pctOf(op.th, rev.th),
      debtToEquity: pctOf(liab.th, eq.th),        // 국내 부채비율 = 부채총계/자본총계
      freeCashflow: fcf,                          // 영업활동CF − |유형자산취득| (근사)
    },
    raw: { revenue: rev.th, operatingIncome: op.th, netIncome: ni.th, liabilities: liab.th, equity: eq.th, ocf: ocf.th, capex: capex.th },
  };
}
module.exports.computeDart = computeDart;

// 종목코드(6자리) → DART 고유번호(8자리). 번들 corp-map.json 조회(있으면).
function resolveCorp(codeOrCorp) {
  const s = String(codeOrCorp || "").replace(/\D/g, "");
  if (/^\d{8}$/.test(s)) return s;                 // 이미 고유번호
  if (/^\d{6}$/.test(s)) {                          // 종목코드 → 매핑
    try { const map = require("./corp-map.json"); if (map[s]) return map[s]; } catch (e) {}
    return null;
  }
  return null;
}
module.exports.resolveCorp = resolveCorp;

async function fetchDart(corp, year, fs) {
  const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json`
    + `?crtfc_key=${KEY}&corp_code=${corp}&bsns_year=${year}&reprt_code=11011&fs_div=${fs}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`DART 조회 실패 ${r.status}`);
  const j = await r.json();
  if (j.status && j.status !== "000") throw new Error(`DART: ${j.message || j.status} (연도/고유번호/연결구분 확인)`);
  const list = j.list || [];
  if (!list.length) throw new Error("재무제표 항목 없음 (해당 연도 미공시일 수 있음)");
  return computeDart(list, { name: null, corp, year: +year, fs });
}

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    if (!KEY) throw new Error("환경변수 DART_API_KEY 미설정 (opendart.fss.or.kr 무료 발급)");
    const p = event.queryStringParameters || {};
    const corp = resolveCorp(p.corp || p.code);
    if (!corp) throw new Error("corp(8자리) 또는 corp-map.json 에 등록된 code(6자리)를 넣으세요. 매핑은 tools/build-corp-map.mjs 로 생성.");
    const year = /^\d{4}$/.test(p.year || "") ? p.year : String(new Date().getFullYear() - 1);
    const fs = (p.fs === "OFS") ? "OFS" : "CFS";
    let data;
    try { data = await fetchDart(corp, year, fs); }
    catch (e) { // 연결(CFS) 미제출 소형주 → 별도(OFS) 폴백
      if (fs === "CFS") data = await fetchDart(corp, year, "OFS"); else throw e;
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

// ============================================================================
//  quote-kis-flow.js — 수급(투자자별 순매수) 자동조회 프록시 (Netlify Function)
//  한국 종목의 외국인/기관 순매수는 Yahoo 에 없습니다 → KIS 로만 조회 가능.
//  quote.js 와 동일한 앱키·토큰 패턴을 재사용합니다.
//
//  엔드포인트: 주식현재가 투자자
//    GET /uapi/domestic-stock/v1/quotations/inquire-investor
//    tr_id: FHKST01010900   (국내주식, custtype P)
//    → 최근 약 30영업일의 일자별 개인/외국인/기관 순매수(수량·거래대금) 반환.
//  표준 output 필드(수량): frgn_ntby_qty(외국인 순매수 수량), orgn_ntby_qty(기관계),
//                          prsn_ntby_qty(개인). 거래대금: *_ntby_tr_pbmn.
//  ※ 위 tr_id/필드는 KIS 표준 규격이지만, 계정 권한·API 버전에 따라 응답 키가
//    다를 수 있어 코드에서 후보 키를 넓게 매핑합니다. 배포 후 /?debug=1 로 실제
//    첫 행 원본 키를 확인해 필요 시 FIELD 매핑을 조정하세요.
//
//  배포:
//    1) 이 파일을 <프로젝트>/netlify/functions/quote-kis-flow.js 에 둠
//    2) quote.js 와 동일 환경변수: KIS_APP_KEY, KIS_APP_SECRET,
//       KIS_BASE = https://openapi.koreainvestment.com:9443 (실전)
//    3) valuation-flow.html:  const FLOW_URL = "/.netlify/functions/quote-kis-flow?code={code}";
//       → 반환 summary(f5/i5/f20/i20/fStreak/iStreak)를 수급 폼에 채움.
//
//  쿼리: ?code=005930 &mode=qty|amt(기본 qty) &debug=1(원본 첫 행 키 확인)
//  반환:
//    { meta:{name,code,asOfDate,mode,rows},
//      series:[{date,foreign,institution,individual}...(과거→최신)],
//      summary:{f5,i5,f20,i20,fStreak,iStreak} }
// ============================================================================

const BASE = process.env.KIS_BASE || "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

// ── 순수 로직(테스트에서 import) ─────────────────────────────────────────────
const n = v => { const x = Number(String(v ?? "").replace(/[,\s]/g, "")); return isFinite(x) ? x : 0; };
const sumLast = (a, k) => a.slice(-k).reduce((x, y) => x + y, 0);
function streak(a) { // 과거→최신 배열 → 부호×연속일수 (valuation-flow 와 동일 규칙)
  if (!a.length) return 0; const s = Math.sign(a.at(-1)); if (!s) return 0;
  let c = 0; for (let i = a.length - 1; i >= 0; i--) { if (Math.sign(a[i]) === s) c++; else break; } return s * c;
}
// mode=qty → 수량 필드, mode=amt → 거래대금 필드. 각기 후보 키를 순서대로 탐색.
const FIELD = {
  qty: { f: ["frgn_ntby_qty", "frgn_ntby_qtty"], o: ["orgn_ntby_qty", "orgn_ntby_qtty"], p: ["prsn_ntby_qty", "prsn_ntby_qtty"] },
  amt: { f: ["frgn_ntby_tr_pbmn"], o: ["orgn_ntby_tr_pbmn"], p: ["prsn_ntby_tr_pbmn"] },
};
const grab = (row, keys) => { for (const k of keys) if (row[k] != null && row[k] !== "") return n(row[k]); return 0; };

function mapFlow(json, mode = "qty", name) {
  const F = FIELD[mode] || FIELD.qty;
  // output: 최신→과거 → 과거→최신으로 뒤집기
  const rows = (json.output || json.output1 || json.output2 || []).slice().reverse();
  const series = rows.map(x => ({
    date: String(x.stck_bsop_date || x.bsop_date || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    foreign: grab(x, F.f), institution: grab(x, F.o), individual: grab(x, F.p),
  })).filter(o => o.date);
  const FF = series.map(o => o.foreign), II = series.map(o => o.institution);
  return {
    meta: { name: name || (json.output1 && json.output1.hts_kor_isnm) || null, asOfDate: series.at(-1)?.date || null, mode, rows: series.length },
    series,
    summary: {
      f5: sumLast(FF, 5), i5: sumLast(II, 5),
      f20: series.length >= 6 ? sumLast(FF, 20) : null,
      i20: series.length >= 6 ? sumLast(II, 20) : null,
      fStreak: streak(FF), iStreak: streak(II),
    },
  };
}
module.exports.mapFlow = mapFlow;
module.exports.streak = streak;
// ─────────────────────────────────────────────────────────────────────────────

let _token = null, _tokenExp = 0;
async function getToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token;
  const r = await fetch(`${BASE}/oauth2/tokenP`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP_KEY, appsecret: APP_SECRET }),
  });
  if (!r.ok) throw new Error(`토큰 발급 실패 ${r.status}`);
  const j = await r.json();
  _token = j.access_token; _tokenExp = Date.now() + (Number(j.expires_in || 86400) * 1000);
  return _token;
}

async function fetchInvestor(code) {
  const token = await getToken();
  const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
  const url = `${BASE}/uapi/domestic-stock/v1/quotations/inquire-investor?${qs}`;
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, appkey: APP_KEY, appsecret: APP_SECRET, tr_id: "FHKST01010900", custtype: "P" },
  });
  if (!r.ok) throw new Error(`수급 조회 실패 ${r.status} (tr_id/권한 확인)`);
  return r.json();
}

module.exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    if (!APP_KEY || !APP_SECRET) throw new Error("환경변수 KIS_APP_KEY / KIS_APP_SECRET 미설정");
    const p = event.queryStringParameters || {};
    const code = String(p.code || "005930").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("code는 6자리 숫자 종목코드여야 합니다");
    const mode = p.mode === "amt" ? "amt" : "qty";
    const json = await fetchInvestor(code);
    if (p.debug) { // 실제 응답 첫 행 키 확인용
      const first = (json.output || json.output1 || [])[0] || {};
      return { statusCode: 200, headers: cors, body: JSON.stringify({ keys: Object.keys(first), sample: first }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify(mapFlow(json, mode, p.name)) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

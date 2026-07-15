// ============================================================================
//  quote-kis-flow.js — 수급(투자자별 순매수) 자동조회 프록시 (Netlify Function)
//  한국 종목의 외국인/기관 순매수는 Yahoo 에 없습니다 → KIS 로만 조회 가능.
//  quote.js 와 동일한 앱키·토큰 패턴을 재사용합니다.
//
//  ⚠️ 중요(HANDOFF §5 경고): KIS 투자자별 매매동향은 계정/문서 버전에 따라
//     tr_id·응답 필드명이 다릅니다. 아래는 "주식현재가 투자자"(일자별 개인/외국인/
//     기관 순매수) 기준 초안입니다. 배포 전 본인 앱키의 KIS API 문서로
//     tr_id 와 output 필드(prsn/frgn/orgn ...)를 반드시 확인·보정하세요.
//     확실치 않으면 valuation-flow.html 의 '수급 상세 붙여넣기'(수기)를 기본으로.
//
//  배포:
//    1) 이 파일을 <프로젝트>/netlify/functions/quote-kis-flow.js 에 둠
//    2) quote.js 와 동일한 환경변수 사용:
//         KIS_APP_KEY, KIS_APP_SECRET,
//         KIS_BASE = https://openapi.koreainvestment.com:9443 (실전)
//    3) valuation-flow.html 에서(선택):
//         const FLOW_URL = "/.netlify/functions/quote-kis-flow?code={code}";
//       → 반환된 f5/i5/f20/i20/fStreak/iStreak 를 수급 폼에 바로 채우면 됨.
//
//  쿼리: ?code=005930 &days=20 (선택; 누적 창)
//  반환:
//    { meta:{name,code,asOfDate},
//      series:[{date,foreign,institution}...(과거→최신)],   // 순매수(원 또는 주, KIS 응답 단위)
//      summary:{f5,i5,f20,i20,fStreak,iStreak} }             // valuation-flow 수급 폼 매핑용
// ============================================================================

const BASE = process.env.KIS_BASE || "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

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

const n = v => { const x = Number(String(v ?? "").replace(/[,\s]/g, "")); return isFinite(x) ? x : 0; };
const sumLast = (a, k) => a.slice(-k).reduce((x, y) => x + y, 0);
function streak(a) { // 과거→최신 배열 → 부호×연속일수 (valuation-flow 와 동일 규칙)
  if (!a.length) return 0; const s = Math.sign(a.at(-1)); if (!s) return 0;
  let c = 0; for (let i = a.length - 1; i >= 0; i--) { if (Math.sign(a[i]) === s) c++; else break; } return s * c;
}

async function fetchFlow(code, name) {
  const token = await getToken();
  // 주식현재가 투자자: 일자별 개인/외국인/기관 순매수(최근 약 30영업일)
  const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code });
  const url = `${BASE}/uapi/domestic-stock/v1/quotations/inquire-investor?${qs}`;
  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`, appkey: APP_KEY, appsecret: APP_SECRET,
      tr_id: "FHKST01010900",       // ⚠️ 계정/문서에 따라 상이 — 반드시 검증
      custtype: "P",
    },
  });
  if (!r.ok) throw new Error(`수급 조회 실패 ${r.status} (tr_id/권한 확인)`);
  const j = await r.json();

  // output = 최신→과거 → 과거→최신으로 뒤집기. 필드명은 KIS 응답에 맞춰 후보를 넓게 매핑.
  const rows = (j.output || j.output1 || []).slice().reverse();
  const series = rows.map(x => ({
    date: String(x.stck_bsop_date || x.bsop_date || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    foreign: n(x.frgn_ntby_qty ?? x.frgn_ntby_tr_pbmn ?? x.frgn_seln_vol),      // 외국인 순매수(수량/금액)
    institution: n(x.orgn_ntby_qty ?? x.orgn_ntby_tr_pbmn ?? x.orgn_seln_vol),  // 기관계 순매수
  })).filter(o => o.date);

  const F = series.map(o => o.foreign), I = series.map(o => o.institution);
  return {
    meta: { name: name || (j.output1 && j.output1.hts_kor_isnm) || code, code, asOfDate: series.at(-1)?.date || null },
    series,
    summary: {
      f5: sumLast(F, 5), i5: sumLast(I, 5),
      f20: series.length >= 6 ? sumLast(F, 20) : null,
      i20: series.length >= 6 ? sumLast(I, 20) : null,
      fStreak: streak(F), iStreak: streak(I),
    },
  };
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
    if (!APP_KEY || !APP_SECRET) throw new Error("환경변수 KIS_APP_KEY / KIS_APP_SECRET 미설정");
    const p = event.queryStringParameters || {};
    const code = String(p.code || "005930").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("code는 6자리 숫자 종목코드여야 합니다");
    const data = await fetchFlow(code, p.name);
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

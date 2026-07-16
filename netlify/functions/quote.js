// ============================================================================
//  quote.js — 한국투자증권(KIS) 일봉 프록시  (Netlify Function)
//  대시보드 템플릿의 DATA_URL 이 호출하는 서버 계층.
//  브라우저에서 직접 KIS를 호출하면 (1) CORS 차단 (2) 앱키 노출 → 반드시 서버 경유.
//
//  배포:
//    1) 이 파일을  <프로젝트>/netlify/functions/quote.js  에 둠
//    2) Netlify 사이트 설정 > Environment variables 에 등록 (절대 코드에 하드코딩 금지):
//         KIS_APP_KEY     = 발급받은 앱키
//         KIS_APP_SECRET  = 발급받은 앱시크릿
//         KIS_BASE        = https://openapi.koreainvestment.com:9443   (실전투자)
//                           https://openapivts.koreainvestment.com:29443 (모의투자)
//    3) 템플릿에서:  const DATA_URL = "/.netlify/functions/quote?code=005930";
//
//  반환 형식(템플릿 compute 모드가 기대하는 모양):
//    { meta:{name,code,currency,price,prevClose,asOf}, candles:[{o,h,l,c,v}, ...(과거→최신)] }
// ============================================================================

const BASE = process.env.KIS_BASE || "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

// 토큰은 24h 유효 → 모듈 스코프에 캐시 (콜드스타트 전까지 재사용, 호출당 재발급 방지)
let _token = null, _tokenExp = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token;
  const r = await fetch(`${BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP_KEY, appsecret: APP_SECRET }),
  });
  if (!r.ok) throw new Error(`토큰 발급 실패 ${r.status}`);
  const j = await r.json();
  _token = j.access_token;
  _tokenExp = Date.now() + (Number(j.expires_in || 86400) * 1000);
  return _token;
}

function yyyymmdd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }

async function fetchDaily(code, name, dateStr) {
  const token = await getToken();
  const end = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const start = new Date(end.getTime() - 400 * 864e5); // 넉넉히 400일(영업일 ~250+) → MA200 계산 가능
  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",           // 주식
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: yyyymmdd(start),
    FID_INPUT_DATE_2: yyyymmdd(end),       // 기준일(없으면 오늘)
    FID_PERIOD_DIV_CODE: "D",              // 일봉
    FID_ORG_ADJ_PRC: "0",                  // 0=수정주가 반영
  });
  const url = `${BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`;
  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY, appsecret: APP_SECRET,
      tr_id: "FHKST03010100",              // 국내주식 기간별 시세(일/주/월/년)
      custtype: "P",
    },
  });
  if (!r.ok) throw new Error(`시세 조회 실패 ${r.status}`);
  const j = await r.json();

  // output2 = 일자별 배열(최신→과거) → 과거→최신으로 뒤집어 숫자 매핑
  const raw = (j.output2 || []).filter(x => x && x.stck_clpr).reverse();
  const candles = raw.map(x => ({
    o: +x.stck_oprc, h: +x.stck_hgpr, l: +x.stck_lwpr, c: +x.stck_clpr, v: +x.acml_vol,
  }));
  const dates = raw.map(x => String(x.stck_bsop_date).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  const last = candles.at(-1), prev = candles.at(-2);

  return {
    meta: {
      name: name || (j.output1 && j.output1.hts_kor_isnm) || code,
      code, currency: "원",
      price: last ? last.c : null,
      prevClose: prev ? prev.c : null,
      asOfDate: dates.at(-1) || null,
      asOf: (dates.at(-1) || "") + " · KIS 일봉",
    },
    dates, candles,
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
    const code = (event.queryStringParameters && event.queryStringParameters.code) || "005930";
    const name = event.queryStringParameters && event.queryStringParameters.name;
    const date = event.queryStringParameters && /^\d{4}-\d{2}-\d{2}$/.test(event.queryStringParameters.date || "") ? event.queryStringParameters.date : null;
    if (!/^\d{6}$/.test(code)) throw new Error("code는 6자리 숫자 종목코드여야 합니다");
    const data = await fetchDaily(code, name, date);
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

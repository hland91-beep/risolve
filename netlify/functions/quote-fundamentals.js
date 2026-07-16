// ============================================================================
//  quote-fundamentals.js — 밸류·펀더멘털·컨센서스 자동조회 프록시 (Netlify Function)
//  Yahoo Finance quoteSummary 에서 PER/PBR/배당/ROE/성장/마진/목표주가/투자의견을
//  서버가 대신 받아옵니다. quoteSummary 는 크럼(crumb)+쿠키가 필요해 브라우저에서
//  직접 못 부르므로(항상 401) 반드시 서버 경유해야 합니다.
//
//  배포:
//    1) 이 파일을 <프로젝트>/netlify/functions/quote-fundamentals.js 에 둠
//    2) Netlify 배포 (환경변수 불필요 — 키 없이 동작)
//    3) valuation-flow.html / fundamentals-flow.html 에서(선택):
//         const FUND_URL = "/.netlify/functions/quote-fundamentals?code={code}";
//       종목번호로 fetch → 아래 필드를 폼에 자동 채우면 됨.
//
//  쿼리: ?code=005930  (KOSPI .KS → KOSDAQ .KQ 자동 폴백)
//  반환:
//    { meta:{name,code,currency,price},
//      valuation:{per,pbr,dividendYield,roe},                     // %는 퍼센트값
//      fundamentals:{revenueGrowth,earningsGrowth,operatingMargin,profitMargin,debtToEquity,freeCashflow},
//      consensus:{targetMean,upside,recommendationMean,recommendationKey,numberOfAnalysts} }
//  주의: Yahoo 한국 재무 필드는 결측/지연이 잦습니다(특히 소형주). null 가능.
// ============================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

// set-cookie 헤더에서 쿠키쌍만 추출(Node18 getSetCookie / 폴백 모두 대응)
function extractCookies(res) {
  let list = [];
  if (typeof res.headers.getSetCookie === "function") list = res.headers.getSetCookie();
  else { const sc = res.headers.get("set-cookie"); if (sc) list = [sc]; }
  return list.map(c => c.split(";")[0]).filter(Boolean).join("; ");
}

// ① 쿠키 → ② 크럼 발급
async function getSession() {
  let cookie = "";
  try {
    const r = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA } });
    cookie = extractCookies(r);
  } catch (e) { /* 일부 리전은 fc.yahoo.com 차단 → 쿠키 없이도 크럼 시도 */ }
  const cr = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, "Accept": "text/plain", ...(cookie ? { Cookie: cookie } : {}) },
  });
  const crumb = (await cr.text()).trim();
  if (!crumb || /<html/i.test(crumb)) throw new Error("크럼 발급 실패 (Yahoo 세션)");
  return { cookie, crumb };
}

// ── 순수 로직(테스트에서 import) ─────────────────────────────────────────────
const raw = x => (x && typeof x === "object" && "raw" in x) ? x.raw : (typeof x === "number" ? x : null);
const pct = x => { const v = raw(x); return v == null ? null : +(v * 100).toFixed(2); };   // 소수배율 → %
const rnd = x => { const v = raw(x); return v == null ? null : Math.round(v); };

// quoteSummary.result[0] → 폼 매핑 스키마 (Yahoo 값은 {raw,fmt} 또는 숫자)
function mapQuoteSummary(res, code, sfx) {
  const P = res.price || {}, S = res.summaryDetail || {}, K = res.defaultKeyStatistics || {}, F = res.financialData || {};
  // ⚠️ 오응답 방어 3중 검증 — Yahoo 가 존재하지 않는 심볼(코스닥 종목의 .KS 등)에
  //    엉뚱한 펀드를 돌려주며 심볼까지 메아리치는 사례 확인됨(소룩스 290690).
  const gotSym = String(P.symbol || "").toUpperCase();
  if (gotSym && gotSym !== `${code}.${sfx}`.toUpperCase()) return null;      // ① 심볼 불일치
  if (/MUTUALFUND/i.test(P.quoteType || "")) return null;                     // ② 비상장 펀드(0P…)
  if (P.market && P.market !== "kr_market") return null;                      // ③ 한국시장 아님
  if (P.currency && String(P.currency).toUpperCase() !== "KRW") return null;  //    원화 아님
  const price = raw(P.regularMarketPrice);
  const target = raw(F.targetMeanPrice);
  return {
    meta: { name: P.longName || P.shortName || `${code}.${sfx}`, code, currency: P.currency || "KRW", price,
      quoteType: P.quoteType || null },   // EQUITY | ETF | MUTUALFUND …
    valuation: {
      per: raw(S.trailingPE) ?? raw(K.trailingPE) ?? null,
      pbr: raw(K.priceToBook),
      dividendYield: pct(S.dividendYield),
      roe: pct(F.returnOnEquity),
    },
    fundamentals: {
      revenueGrowth: pct(F.revenueGrowth),
      earningsGrowth: pct(F.earningsGrowth),
      operatingMargin: pct(F.operatingMargins),
      profitMargin: pct(F.profitMargins),
      debtToEquity: raw(F.debtToEquity),           // Yahoo 기준(부채/자본 %) — 국내 부채비율과 정의 유사
      freeCashflow: rnd(F.freeCashflow),
    },
    consensus: {
      targetMean: rnd(F.targetMeanPrice),
      upside: (price && target) ? +(((target - price) / price) * 100).toFixed(1) : null,
      recommendationMean: raw(F.recommendationMean),   // 1(강력매수)~5(매도)
      recommendationKey: F.recommendationKey || null,
      numberOfAnalysts: raw(F.numberOfAnalystOpinions),
    },
  };
}
module.exports.mapQuoteSummary = mapQuoteSummary;
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOne(code, sfx, sess) {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${code}.${sfx}`
            + `?modules=${modules}&crumb=${encodeURIComponent(sess.crumb)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", ...(sess.cookie ? { Cookie: sess.cookie } : {}) } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
  if (!res) return null;
  return mapQuoteSummary(res, code, sfx);
}

module.exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    const p = event.queryStringParameters || {};
    const code = String(p.code || "005930").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("code는 6자리 숫자 종목코드여야 합니다");
    const sess = await getSession();
    let data = null;
    // sfx 힌트(차트가 검증한 시장)가 오면 그 시장만 조회 — 오응답 원천 차단
    const sfxs = /^(KS|KQ)$/.test(p.sfx || "") ? [p.sfx] : ["KS", "KQ"];
    for (const sfx of sfxs) { data = await fetchOne(code, sfx, sess); if (data && data.meta.price != null) break; }
    if (!data) throw new Error("데이터를 찾지 못했습니다 (코드/상장 확인, Yahoo 결측 가능)");
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

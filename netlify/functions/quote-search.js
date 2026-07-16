// ============================================================================
//  quote-search.js — 종목명 → 종목코드 검색 프록시 (Netlify Function, 키 불필요)
//  한글 종목명(예: "삼성전자")을 Yahoo Finance 검색 API 로 조회해
//  한국 상장 종목(.KS/.KQ)의 6자리 코드와 정식 명칭을 돌려줍니다.
//  브라우저 직접 호출은 CORS 로 차단되므로 서버 경유가 필요합니다.
//
//  배포: <프로젝트>/netlify/functions/quote-search.js (환경변수 불필요)
//  쿼리: ?q=삼성전자  (또는 ?q=005930 — 숫자면 그대로 통과)
//  반환: { results:[{code,name,symbol,exchange}...] }  — 한국 종목만, 관련도순
// ============================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

// Yahoo search 응답 → 한국 종목만 추출 (순수, 테스트에서 import)
function mapSearch(j) {
  const quotes = (j && j.quotes) || [];
  const out = [];
  for (const q of quotes) {
    const sym = String(q.symbol || "");
    const m = sym.match(/^(\d{6})\.(KS|KQ)$/);
    if (!m) continue;                       // 한국 상장(.KS/.KQ) 6자리만
    out.push({
      code: m[1],
      name: q.longname || q.shortname || m[1],
      symbol: sym,
      exchange: m[2] === "KS" ? "KOSPI" : "KOSDAQ",
    });
  }
  return out;
}
module.exports.mapSearch = mapSearch;

module.exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    const p = event.queryStringParameters || {};
    const q = String(p.q || "").trim();
    if (!q) throw new Error("q(종목명 또는 종목코드)를 입력하세요");
    // 이미 6자리 숫자면 검색 없이 그대로 반환 (이름은 미상)
    if (/^\d{6}$/.test(q)) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results: [{ code: q, name: null, symbol: null, exchange: null }] }) };
    }
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) throw new Error(`검색 실패 ${r.status}`);
    const results = mapSearch(await r.json());
    if (!results.length) throw new Error("한국 상장 종목을 찾지 못했습니다 (정식 종목명 또는 6자리 코드로 시도)");
    return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

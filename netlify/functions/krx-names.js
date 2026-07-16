// ============================================================================
//  krx-names.js — 종목명 검색 프록시 v2 (한국거래소 KRX 공식 데이터, 키 불필요)
//  data.krx.co.kr 정보데이터시스템에서 상장 주식 전체 + ETF 목록을 받아
//  한글 종목명 → 6자리 코드 검색을 제공합니다. (Yahoo 검색의 클라우드 IP
//  차단 문제를 피하는 1차 검색 경로. quote-search.js 는 예비로 유지)
//
//  쿼리: ?q=미래에셋증권   → { results:[{code,name,exchange}...] } (최대 8)
//        ?q=006800        → 코드 그대로 + 이름 역조회
//        ?debug=1         → 원천 응답 상태/행수 확인용
//  주의: KRX 응답 스키마가 바뀔 수 있어 행 키를 유연하게 탐색하고,
//        실패 시 명확한 에러를 반환합니다(클라이언트는 Yahoo 검색으로 폴백).
// ============================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const KRX = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

let _cache = null, _cacheAt = 0;              // 모듈 캐시(웜 인보케이션 재사용, 6시간)
const TTL = 6 * 3600 * 1000;

async function krxPost(params) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch(KRX, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
    },
    body,
  });
  if (!r.ok) throw new Error(`KRX ${r.status}`);
  return r.json();
}

// 응답에서 행 배열을 유연하게 추출 (OutBlock_1 / output / block1 …)
function rowsOf(j) {
  if (!j || typeof j !== "object") return [];
  for (const k of ["OutBlock_1", "output", "block1"]) if (Array.isArray(j[k])) return j[k];
  for (const k in j) if (Array.isArray(j[k]) && j[k].length && typeof j[k][0] === "object") return j[k];
  return [];
}
const pick = (row, keys) => { for (const k of keys) if (row[k] != null && row[k] !== "") return String(row[k]).trim(); return null; };

async function loadAll() {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache;
  const list = [];
  const seen = new Set();
  const add = (code, name, exch) => {
    if (!code || !name) return;
    code = code.replace(/\D/g, "");
    if (!/^\d{6}$/.test(code) || seen.has(code)) return;
    seen.add(code); list.push({ code, name, exchange: exch });
  };
  // ① 상장 주식 전체 (KOSPI+KOSDAQ+KONEX)
  try {
    const j = await krxPost({ bld: "dbms/MDC/STAT/standard/MDCSTAT01901", locale: "ko_KR", mktId: "ALL", share: "1", csvxls_isNo: "false" });
    for (const r of rowsOf(j)) add(pick(r, ["ISU_SRT_CD", "ISU_CD"]), pick(r, ["ISU_ABBRV", "ISU_NM"]), pick(r, ["MKT_TP_NM", "MKT_NM"]) || "주식");
  } catch (e) { /* 아래 ETF 만이라도 시도 */ }
  // ② ETF 전체
  try {
    const j = await krxPost({ bld: "dbms/MDC/STAT/standard/MDCSTAT04601", locale: "ko_KR", share: "1", csvxls_isNo: "false" });
    for (const r of rowsOf(j)) add(pick(r, ["ISU_SRT_CD", "ISU_CD"]), pick(r, ["ISU_ABBRV", "ISU_NM"]), "ETF");
  } catch (e) { /* 주식만이라도 */ }
  if (!list.length) throw new Error("KRX 목록 응답이 비었습니다");
  _cache = list; _cacheAt = Date.now();
  return list;
}

// 검색 (순수 — 테스트에서 import): 정확일치 > 시작일치 > 포함
function filterNames(list, q, limit = 8) {
  const norm = s => String(s || "").replace(/\s+/g, "").toLowerCase();
  const n = norm(q);
  if (!n) return [];
  const exact = [], starts = [], incl = [];
  for (const it of list) {
    const nm = norm(it.name);
    if (nm === n) exact.push(it);
    else if (nm.startsWith(n)) starts.push(it);
    else if (nm.includes(n)) incl.push(it);
  }
  return [...exact, ...starts, ...incl].slice(0, limit);
}
module.exports.filterNames = filterNames;
module.exports.rowsOf = rowsOf;

/* ── 예비 검색: 네이버 증권 (KRX 차단 시) ──
   응답 스키마가 바뀔 수 있어, JSON 어디에 있든 "6자리 코드 + 이름" 쌍을
   구조 무관하게 추출한다(순수 — 테스트에서 import). */
function extractPairs(node, out, seen) {
  out = out || []; seen = seen || new Set();
  const scan = vals => {
    const strs = vals.filter(x => typeof x === "string");
    const code = strs.find(s => /^\d{6}$/.test(s));
    const name = strs.find(s => s !== code && /[가-힣A-Za-z]/.test(s) && !/^[\d.,%+-]+$/.test(s) && s.length >= 2 && s.length <= 40);
    if (code && name && !seen.has(code)) { seen.add(code); out.push({ code, name, exchange: null }); }
  };
  if (Array.isArray(node)) { scan(node); node.forEach(x => extractPairs(x, out, seen)); }
  else if (node && typeof node === "object") { scan(Object.values(node)); Object.values(node).forEach(x => extractPairs(x, out, seen)); }
  return out;
}
module.exports.extractPairs = extractPairs;

async function naverSearch(q) {
  const enc = encodeURIComponent(q);
  const urls = [
    `https://m.stock.naver.com/api/search/stock?query=${enc}&page=1&pageSize=10`,
    `https://ac.stock.naver.com/ac?q=${enc}&target=stock,index,marketindicator`,
  ];
  const tried = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://m.stock.naver.com/" } });
      if (!r.ok) { tried.push(`${new URL(u).host} ${r.status}`); continue; }
      const pairs = extractPairs(await r.json());
      if (pairs.length) {
        const norm = s => String(s || "").replace(/\s+/g, "").toLowerCase(), n = norm(q);
        pairs.sort((a, b) => (norm(b.name).includes(n) ? 1 : 0) - (norm(a.name).includes(n) ? 1 : 0));
        return pairs.slice(0, 8);
      }
      tried.push(`${new URL(u).host} 결과없음`);
    } catch (e) { tried.push("연결실패"); }
  }
  throw new Error(tried.join(", ") || "결과없음");
}

module.exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",           // 브라우저 1시간 캐시
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    const p = event.queryStringParameters || {};
    const q = String(p.q || "").trim();
    let list = null, krxErr = null;
    try { list = await loadAll(); } catch (e) { krxErr = String(e.message || e); }
    if (p.debug) return { statusCode: 200, headers: cors, body: JSON.stringify({ krx: list ? list.length : ("실패: " + krxErr), sample: list ? list.slice(0, 3) : null }) };
    if (!q) throw new Error("q(종목명 또는 종목코드)를 입력하세요");
    if (/^\d{6}$/.test(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length === q.length) {
      const code = q.replace(/\D/g, "");
      const hit = list ? list.find(x => x.code === code) : null;
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results: [hit || { code, name: null, exchange: null }] }) };
    }
    let results = list ? filterNames(list, q) : [];
    let naverErr = null;
    if (!results.length) {                      // KRX 실패/무결과 → 네이버 예비
      try { results = await naverSearch(q); } catch (e) { naverErr = String(e.message || e); }
    }
    if (!results.length) throw new Error(`이름 검색 실패 — KRX: ${krxErr || "결과없음"}${naverErr ? ` · Naver: ${naverErr}` : ""}`);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

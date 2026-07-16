// ============================================================================
//  quote-yahoo.js — 키(API key) 없이 쓰는 일봉 프록시  (Netlify Function)
//  Yahoo Finance 공개 차트 데이터를 서버에서 대신 받아 CORS만 열어줍니다.
//  v2: Yahoo 가 클라우드 IP 를 간헐 차단(429/401)하는 문제 대응 —
//      query1/query2 호스트 + period/range 쿼리 + .KS/.KQ 전 조합 폴백,
//      429 시 1회 재시도, 실패 시 시도 내역을 에러 메시지로 반환(진단용).
//
//  쿼리: ?code=005930 &date=2026-07-14(선택; 없으면 최신)
//  반환: { meta:{name,code,currency,price,prevClose,asOfDate,asOf,quoteType}, dates:[...], candles:[{o,h,l,c,v}] }
// ============================================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseChart(j, code) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) return null;
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const candles = [], dates = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const o = q.open && q.open[i], h = q.high && q.high[i],
          l = q.low && q.low[i], c = q.close && q.close[i], v = q.volume && q.volume[i];
    if ([o, h, l, c].every(x => x != null)) {
      candles.push({ o, h, l, c, v: v || 0 });
      dates.push(new Date(res.timestamp[i] * 1000).toISOString().slice(0, 10));
    }
  }
  if (!candles.length) return null;
  const m = res.meta || {};
  return {
    meta: {
      name: m.shortName || m.longName || code, code, currency: m.currency || "원",
      price: candles.at(-1).c,
      prevClose: candles.length > 1 ? candles.at(-2).c : (m.chartPreviousClose ?? null),
      asOfDate: dates.at(-1),
      asOf: dates.at(-1) + " 종가 · Yahoo EOD",
      quoteType: m.instrumentType || null,      // EQUITY | ETF …
    },
    dates, candles,
  };
}

async function yahoo(code, dateStr, attempts) {
  const end = dateStr ? new Date(dateStr + "T23:59:59") : new Date();
  const p2 = Math.floor(end.getTime() / 1000) + 86400;
  const p1 = Math.floor(end.getTime() / 1000) - 400 * 86400;
  const queries = [`period1=${p1}&period2=${p2}&interval=1d`, `range=2y&interval=1d`];
  for (const sfx of ["KS", "KQ"]) {
    for (const qs of queries) {
      for (const host of ["query1", "query2"]) {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${code}.${sfx}?${qs}`;
        for (let attempt = 0; attempt < 2; attempt++) {          // 429 → 1회 재시도
          let r;
          try { r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } }); }
          catch (e) { attempts.push(`${sfx}/${host} 연결실패`); break; }
          if (r.status === 429 && attempt === 0) { await sleep(600); continue; }
          if (!r.ok) { attempts.push(`${sfx}/${host} ${r.status}`); break; }
          const parsed = parseChart(await r.json(), code);
          if (parsed) return parsed;
          attempts.push(`${sfx}/${host} 빈응답`); break;
        }
      }
      // 같은 접미사에서 두 쿼리 모두 404 계열이면 다음 접미사로
    }
  }
  return null;
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
    const p = event.queryStringParameters || {};
    const code = String(p.code || "005930").replace(/\D/g, "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : null;
    if (!/^\d{6}$/.test(code)) throw new Error("code는 6자리 숫자 종목코드여야 합니다");
    const attempts = [];
    const data = await yahoo(code, date, attempts);
    if (!data) throw new Error(`Yahoo 시세 실패 [${attempts.slice(0, 6).join(", ")}] — 잠시 후 재시도하거나 KIS 키를 등록하세요`);
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};

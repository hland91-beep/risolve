// 프록시 순수 변환 로직 테스트 (배포·네트워크 없이 파싱/계산 검증)
//   node test/proxies.test.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const kis = require("../netlify/functions/quote-kis-flow.js");
const fund = require("../netlify/functions/quote-fundamentals.js");
const dart = require("../netlify/functions/quote-dart.js");
const { parseCorpXml } = await import("../tools/build-corp-map.mjs");

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { pass++; } else { fail++; console.error(`✗ ${name}\n    got ${g}\n    exp ${e}`); }
};

/* ── KIS 수급: 최신→과거 응답 → 과거→최신 누적·연속 ── */
const kisRaw = { output: [
  { stck_bsop_date: "20260714", frgn_ntby_qty: "1,200", orgn_ntby_qty: "300", prsn_ntby_qty: "-1,500" },
  { stck_bsop_date: "20260711", frgn_ntby_qty: "410",   orgn_ntby_qty: "30",  prsn_ntby_qty: "-440" },
  { stck_bsop_date: "20260710", frgn_ntby_qty: "300",   orgn_ntby_qty: "120", prsn_ntby_qty: "-420" },
  { stck_bsop_date: "20260709", frgn_ntby_qty: "150",   orgn_ntby_qty: "90",  prsn_ntby_qty: "-240" },
  { stck_bsop_date: "20260708", frgn_ntby_qty: "820",   orgn_ntby_qty: "-140", prsn_ntby_qty: "-680" },
]};
const kf = kis.mapFlow(kisRaw, "qty");
eq("kis.summary", kf.summary, { f5: 2880, i5: 400, f20: null, i20: null, fStreak: 5, iStreak: 4 });
eq("kis.asOfDate", kf.meta.asOfDate, "2026-07-14");
eq("kis.rows/order", [kf.meta.rows, kf.series[0].date], [5, "2026-07-08"]); // 과거→최신
eq("kis.streak.mixed", kis.streak([-1, -1, 2, 3]), 2);

/* ── Yahoo quoteSummary 매핑 ── */
const ys = {
  price: { regularMarketPrice: { raw: 70000 }, longName: "Samsung Electronics", currency: "KRW" },
  summaryDetail: { trailingPE: { raw: 11 }, dividendYield: { raw: 0.025 } },
  defaultKeyStatistics: { priceToBook: { raw: 1.1 } },
  financialData: { returnOnEquity: { raw: 0.095 }, targetMeanPrice: { raw: 90000 }, recommendationMean: { raw: 2.1 },
    revenueGrowth: { raw: 0.123 }, earningsGrowth: { raw: 0.201 }, operatingMargins: { raw: 0.184 },
    profitMargins: { raw: 0.14 }, debtToEquity: { raw: 45.2 }, freeCashflow: { raw: 30000 }, numberOfAnalystOpinions: { raw: 25 } },
};
const fm = fund.mapQuoteSummary(ys, "005930", "KS");
eq("yahoo.valuation", fm.valuation, { per: 11, pbr: 1.1, dividendYield: 2.5, roe: 9.5 });
eq("yahoo.consensus.upside", fm.consensus.upside, 28.6);
eq("yahoo.fundamentals", fm.fundamentals, { revenueGrowth: 12.3, earningsGrowth: 20.1, operatingMargin: 18.4, profitMargin: 14, debtToEquity: 45.2, freeCashflow: 30000 });

/* ── DART 재무 계산 (괄호 음수·천단위) ── */
const dartList = [
  { sj_div: "IS", account_nm: "매출액", thstrm_amount: "3,000,000", frmtrm_amount: "2,500,000" },
  { sj_div: "IS", account_nm: "영업이익", thstrm_amount: "540,000", frmtrm_amount: "400,000" },
  { sj_div: "IS", account_nm: "당기순이익", thstrm_amount: "420,000", frmtrm_amount: "350,000" },
  { sj_div: "BS", account_nm: "부채총계", thstrm_amount: "2,400,000" },
  { sj_div: "BS", account_nm: "자본총계", thstrm_amount: "3,000,000" },
  { sj_div: "CF", account_nm: "영업활동현금흐름", thstrm_amount: "600,000" },
  { sj_div: "CF", account_nm: "유형자산의 취득", thstrm_amount: "(150,000)" },
];
const dc = dart.computeDart(dartList, { corp: "00126380" });
eq("dart.fundamentals", dc.fundamentals, { revenueGrowth: 20, earningsGrowth: 20, operatingMargin: 18, debtToEquity: 80, freeCashflow: 450000 });
eq("dart.roe", dc.valuation.roe, 14);

/* ── code→corp 매핑 ── */
eq("dart.resolve.code", dart.resolveCorp("005930"), "00126380"); // 번들 corp-map.json
eq("dart.resolve.corp", dart.resolveCorp("00126380"), "00126380");
eq("dart.resolve.miss", dart.resolveCorp("000660"), null);

/* ── 종목명 검색: Yahoo search 응답 → 한국 종목만 ── */
const search = require("../netlify/functions/quote-search.js");
const searchRaw = { quotes: [
  { symbol: "005930.KS", shortname: "Samsung Electronics", longname: "Samsung Electronics Co., Ltd." },
  { symbol: "SSNLF", shortname: "SAMSUNG ELECTRONICS" },          // 미국 OTC → 제외
  { symbol: "005935.KS", shortname: "Samsung Electronics Pfd" },
  { symbol: "035420.KQ", shortname: "NAVER (가상)" },              // KQ 형식 확인용
]};
const sr = search.mapSearch(searchRaw);
eq("search.krOnly", sr.length, 3);
eq("search.first", [sr[0].code, sr[0].exchange], ["005930", "KOSPI"]);
eq("search.kq", sr[2].exchange, "KOSDAQ");

/* ── 심볼 검증: 다른 상품 오응답 거부(소룩스 .KS 오탐 재발 방지) ── */
const yq = require("../netlify/functions/quote-yahoo.js");
const chartJ = sym => ({ chart: { result: [{ timestamp: [1, 2], meta: { symbol: sym, currency: "KRW" },
  indicators: { quote: [{ open: [1, 2], high: [2, 3], low: [1, 1], close: [2, 2], volume: [0, 0] }] } }] } });
eq("sym.chart.match", !!yq.parseChart(chartJ("290690.KQ"), "290690", "290690.KQ"), true);
eq("sym.chart.reject", yq.parseChart(chartJ("0P0001L213"), "290690", "290690.KS"), null);
eq("sym.fund.reject", fund.mapQuoteSummary({ price: { symbol: "0P0001L213", regularMarketPrice: { raw: 1 } } }, "290690", "KS"), null);
eq("sym.fund.match", fund.mapQuoteSummary({ price: { symbol: "290690.KQ", regularMarketPrice: { raw: 5000 } } }, "290690", "KQ").meta.price, 5000);
// 심볼을 메아리치는 오응답(소룩스 사례): 펀드 타입/타시장/타통화 거부
eq("sym.fund.echoFund", fund.mapQuoteSummary({ price: { symbol: "290690.KS", quoteType: "MUTUALFUND", regularMarketPrice: { raw: 12140 } } }, "290690", "KS"), null);
eq("sym.fund.usMarket", fund.mapQuoteSummary({ price: { symbol: "290690.KS", quoteType: "EQUITY", market: "us_market", regularMarketPrice: { raw: 1 } } }, "290690", "KS"), null);
eq("sym.fund.usd", fund.mapQuoteSummary({ price: { symbol: "290690.KS", quoteType: "EQUITY", currency: "USD", regularMarketPrice: { raw: 1 } } }, "290690", "KS"), null);
eq("sym.fund.krOk", fund.mapQuoteSummary({ price: { symbol: "290690.KQ", quoteType: "EQUITY", market: "kr_market", currency: "KRW", regularMarketPrice: { raw: 4640 } } }, "290690", "KQ").meta.price, 4640);

/* ── 네이버 예비 검색: 구조 무관 코드+이름 쌍 추출 ── */
const krx2 = require("../netlify/functions/krx-names.js");
eq("naver.objShape", krx2.extractPairs({ stocks: [{ stockCode: "290690", stockName: "소룩스", per: "12.3" }] }), [{ code: "290690", name: "소룩스", exchange: null }]);
eq("naver.arrShape", krx2.extractPairs({ items: [[["소룩스", "290690", "KOSDAQ"], ["소룩스우", "290695"]]] }).map(x => x.code), ["290690", "290695"]);
eq("naver.noNumericName", krx2.extractPairs([["290690", "12,340", "+3.2%"]]), []);

/* ── KRX 이름 검색: 정확>시작>포함, 행 추출 유연성 ── */
const krx = require("../netlify/functions/krx-names.js");
const L = [
  { code: "006800", name: "미래에셋증권", exchange: "KOSPI" },
  { code: "006805", name: "미래에셋증권우", exchange: "KOSPI" },
  { code: "396500", name: "TIGER Fn반도체TOP10", exchange: "ETF" },
  { code: "005930", name: "삼성전자", exchange: "KOSPI" },
];
eq("krx.exactFirst", krx.filterNames(L, "미래에셋증권").map(x => x.code), ["006800", "006805"]);
eq("krx.spacesIgnored", krx.filterNames(L, "미래에셋 증권")[0].code, "006800");
eq("krx.etfIncl", krx.filterNames(L, "반도체")[0].code, "396500");
eq("krx.caseLatin", krx.filterNames(L, "tiger")[0].code, "396500");
eq("krx.rowsOf", krx.rowsOf({ OutBlock_1: [{ a: 1 }] }).length, 1);
eq("krx.rowsOf.alt", krx.rowsOf({ output: [{ a: 1 }] }).length, 1);
eq("krx.rowsOf.any", krx.rowsOf({ zzz: [{ a: 1 }] }).length, 1);

/* ── corpCode.xml 파서 (상장사만) ── */
const xml = `<result>
  <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code></list>
  <list><corp_code>00999999</corp_code><corp_name>비상장사</corp_name><stock_code> </stock_code></list>
</result>`;
eq("corpxml.listedOnly", parseCorpXml(xml), { "005930": "00126380" });

console.log(`\n${fail ? "❌" : "✅"} proxies: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

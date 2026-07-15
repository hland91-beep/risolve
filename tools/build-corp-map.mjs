// ============================================================================
//  build-corp-map.mjs — 종목코드(6자리) → DART 고유번호(8자리) 매핑 생성기
//  DART corpCode.xml(zip) 을 1회 받아 netlify/functions/corp-map.json 을 만듭니다.
//  로컬 개발 도구(람다 아님). Node 18+.
//
//  사용:
//    DART_API_KEY=발급키 node tools/build-corp-map.mjs
//  결과:
//    netlify/functions/corp-map.json  { "005930":"00126380", ... }  (상장사만)
//
//  압축해제는 시스템 `unzip` CLI 를 사용합니다(대부분 설치돼 있음). 없으면 설치 안내.
// ============================================================================
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// XML → {stock_code: corp_code} (상장사=stock_code 존재). 순수 함수(테스트에서 import).
export function parseCorpXml(xml) {
  const map = {};
  const blocks = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
  for (const b of blocks) {
    const corp = (b.match(/<corp_code>\s*([\s\S]*?)\s*<\/corp_code>/) || [])[1];
    const stock = (b.match(/<stock_code>\s*([\s\S]*?)\s*<\/stock_code>/) || [])[1];
    const code = String(stock || "").trim();
    const cc = String(corp || "").trim();
    if (/^\d{6}$/.test(code) && /^\d{8}$/.test(cc)) map[code] = cc;
  }
  return map;
}

// 직접 실행 시에만 다운로드/생성 (import 시엔 파서만 노출)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const KEY = process.env.DART_API_KEY;
  if (!KEY) { console.error("DART_API_KEY 환경변수를 설정하세요 (opendart.fss.or.kr 무료 발급)."); process.exit(1); }
  const dir = mkdtempSync(join(tmpdir(), "corpmap-"));
  const zipPath = join(dir, "corp.zip");
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}`;
  console.log("↓ corpCode.xml 다운로드…");
  const res = await fetch(url);
  if (!res.ok) { console.error(`다운로드 실패 ${res.status}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 2).toString() !== "PK") { // zip 아니면 에러 XML
    console.error("zip 이 아닙니다(키/쿼터 확인):", buf.slice(0, 200).toString("utf8")); process.exit(1);
  }
  writeFileSync(zipPath, buf);
  let xml;
  try { xml = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 1 << 28 }).toString("utf8"); }
  catch (e) { console.error("unzip CLI 필요 (apt-get install unzip / brew install unzip). 수동 해제 후 CORPCODE.xml 경로로 재시도."); process.exit(1); }
  const map = parseCorpXml(xml);
  const cnt = Object.keys(map).length;
  if (cnt < 1000) { console.error(`상장사 매핑이 ${cnt}건뿐 — 파싱 이상. 중단.`); process.exit(1); }
  const out = fileURLToPath(new URL("../netlify/functions/corp-map.json", import.meta.url));
  writeFileSync(out, JSON.stringify(map) + "\n");
  console.log(`✅ ${cnt}개 상장사 → ${out}`);
}

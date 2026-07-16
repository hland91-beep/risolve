// UI 로직 엣지케이스 테스트 (실제 브라우저) — 음수 PER/자본잠식/0원/극단값/빈칸/0가중치
// 출력에 NaN·Infinity·∞·undefined 가 없고 JS 에러 0 이며, 검증 케이스 수치가 정확한지 확인.
const path = require('node:path'), fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  catch { console.log('⚠ playwright 미설치 — UI 테스트 건너뜀 (npm i -D playwright && npx playwright install chromium)'); process.exit(0); } }
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const F = f => 'file://' + path.resolve(__dirname, '..', f);
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error('  ✗ ' + n); } };
const clean = t => !/NaN|Infinity|∞|undefined/.test(t);

(async () => {
  const b = await chromium.launch(EXE?{executablePath:EXE}:{});
  const errs = [];
  const page = async f => { const p = await b.newPage(); p.on('pageerror', e => errs.push(f + ': ' + e.message)); await p.goto(F(f)); return p; };
  const setV = async (p, o) => p.evaluate(o => { for (const [k, v] of Object.entries(o)) { const el = document.getElementById(k); if (el) el.value = v; } }, o);
  const appText = p => p.locator('#app').innerText().catch(() => '');

  /* ── valuation-flow ── */
  { const p = await page('valuation-flow.html');
    await p.click('#demo'); await p.waitForTimeout(150);
    const t = await appText(p);
    ok('val.verified.grade', /다소 저평가/.test(t));
    ok('val.verified.band', t.includes('268,977') && t.includes('310,818'));
    ok('val.verified.matrix', /저평가\+유입/.test(t));
    ok('val.verified.clean', clean(t));

    // 적자기업: 음수 PER 은 저평가 아님
    await p.click('#clear'); await setV(p, { px: '10000', per: '-5', sPer: '13', pbr: '1.1' });
    await p.click('#go'); await p.waitForTimeout(120); let a = await appText(p);
    ok('val.negPER.notCheap', /적자/.test(a) && !/PER -5<업종/.test(a));
    ok('val.negPER.clean', clean(a));
    const perTag = await p.evaluate(() => { const r=[...document.querySelectorAll('#app table tr')].find(x=>/적자/.test(x.textContent)); return r ? (r.querySelector('.tag')||{}).className : null; });
    ok('val.negPER.tagIsSell', /\btag s\b/.test(perTag || '')); // '저평가 아님' 을 매수우호로 오태그하지 않음

    // 자본잠식: PBR<=0 판정 보류, 타깃 없음
    await p.click('#clear'); await setV(p, { px: '10000', pbr: '-0.5', per: '8', sPer: '10' });
    await p.click('#go'); await p.waitForTimeout(120); a = await appText(p);
    ok('val.negPBR.hold', /자본잠식|판정 보류/.test(a));
    ok('val.negPBR.clean', clean(a));

    // per=0 → PER재평가 타깃 없음, Infinity 없음
    await p.click('#clear'); await setV(p, { px: '50000', per: '0', sPer: '10', pbr: '2' });
    await p.click('#go'); await p.waitForTimeout(120); a = await appText(p);
    ok('val.zeroPER.clean', clean(a));

    // 극단값
    await p.click('#clear'); await setV(p, { px: '999999999', per: '0.0001', sPer: '13', pbr: '1' });
    await p.click('#go'); await p.waitForTimeout(120); a = await appText(p);
    ok('val.extreme.clean', clean(a));

    // 빈칸 → 에러
    await p.click('#clear'); await p.click('#go'); await p.waitForTimeout(80);
    ok('val.empty.err', await p.locator('#err').isVisible());
    // 자동조회: 함수 없는 환경(file://) → 크래시 없이 그레이스풀 안내
    await p.evaluate(() => document.getElementById('autoPanel').open = true);
    await p.fill('#code', '005930'); await p.click('#autoBtn'); await p.waitForTimeout(400);
    ok('val.auto.graceful', /연결 안 됨|수기 입력/.test(await p.locator('#autoInfo').innerText()));
    await p.close();
  }

  /* ── fundamentals-flow ── */
  { const p = await page('fundamentals-flow.html');
    await p.click('#demo'); await p.waitForTimeout(150);
    let t = await appText(p);
    ok('fund.demo.upside', t.includes('+28.6%'));
    ok('fund.demo.clean', clean(t));

    // px=0 → 상단여력 division 방어
    await p.click('#clear'); await setV(p, { px: '0', tp: '90000', roe: '15' });
    await p.click('#go'); await p.waitForTimeout(120); t = await appText(p);
    ok('fund.zeroPx.clean', clean(t));

    // debt 음수 → 자본잠식
    await p.click('#clear'); await setV(p, { revG: '5', roe: '10', debt: '-50' });
    await p.click('#go'); await p.waitForTimeout(120); t = await appText(p);
    ok('fund.negDebt.warn', /자본잠식/.test(t) && clean(t));

    // 금융 프리셋: 영업이익률·부채 제외
    await p.click('#clear');
    await p.evaluate(() => { document.getElementById('preset').value = 'finance'; });
    await setV(p, { revG: '8', roe: '11', opm: '3', debt: '300' });
    await p.click('#go'); await p.waitForTimeout(120); t = await appText(p);
    ok('fund.finance.excl', /판정 제외/.test(t) && /양호/.test(t) && clean(t));
    await p.close();
  }

  /* ── scorecard ── */
  { const p = await page('scorecard.html');
    await p.click('#demo'); await p.waitForTimeout(150);
    let t = await appText(p);
    ok('sc.demo.verdict', /적극 매수/.test(t) && clean(t));

    // 모든 가중치 0 → 가드
    await p.evaluate(() => { ['val','flow','fund','cons','tech','macro'].forEach(k => document.getElementById('w_'+k).value='0'); });
    await p.click('#go'); await p.waitForTimeout(100);
    ok('sc.zeroW.guard', await p.locator('#err').isVisible());

    // 축 1개만 → 최소2축 가드
    await p.click('#clear');
    await p.evaluate(() => { document.getElementById('ax_val').value = '2'; });
    await p.click('#go'); await p.waitForTimeout(100);
    ok('sc.oneAxis.guard', await p.locator('#err').isVisible());

    // 극단 혼합 → clean
    await p.click('#clear');
    await p.evaluate(() => { ['val','flow','fund','cons','tech','macro'].forEach((k,i)=>document.getElementById('ax_'+k).value=[2,-2,0,1,-1,2][i]); });
    await p.click('#go'); await p.waitForTimeout(120); t = await appText(p);
    ok('sc.mixed.clean', clean(t) && t.length>0);
    await p.close();
  }

  /* ── report (종합 보고서) ── */
  { const p = await page('report.html');
    // 데모 보고서: 등급·5카드·가격대표·클린
    await p.click('#demo'); await p.waitForTimeout(400);
    let t = await appText(p);
    ok('rpt.demo.verdict', (await p.locator('.verdict .g').count()) === 1);
    ok('rpt.demo.cards', (await p.locator('.sec').count()) === 5);
    ok('rpt.demo.zones', /1차로 살 자리/.test(t) && /줄일 자리/.test(t));
    ok('rpt.demo.clean', clean(t));
    // mock 파이프라인: 이름 검색 → 후보 선택 → 보고서
    await p.evaluate(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 60000;
      for (let i = 0; i < 70; i++) { base *= 1.002; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
      window.fetch = url => {
        if (url.includes('quote-search')) return mk({ results: [{ code: "005930", name: "삼성전자", exchange: "KOSPI" }, { code: "005935", name: "삼성전자우", exchange: "KOSPI" }] });
        if (url.includes('quote-fundamentals')) return mk({ meta: { name: "삼성전자", price: 70000 }, valuation: { per: 11, pbr: 1.1, dividendYield: 2.5, roe: 9.5 }, fundamentals: { revenueGrowth: 12.3, earningsGrowth: 20.1, operatingMargin: 18.4 }, consensus: { targetMean: 90000, recommendationMean: 2.1 } });
        if (url.includes('quote-yahoo')) return mk({ meta: { name: "삼성전자", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t" }, candles });
        if (url.includes('quote-kis-flow')) return mk({ summary: { f5: 1200, i5: 300, f20: 3000, i20: 700, fStreak: 5, iStreak: 5 } });
        return Promise.reject(new Error('no'));
      };
    });
    await p.fill('#q', '삼성전자'); await p.click('#go'); await p.waitForTimeout(250);
    ok('rpt.mock.picks', (await p.locator('.pick').count()) === 2);
    await p.locator('.pick').first().click(); await p.waitForTimeout(400);
    t = await appText(p);
    ok('rpt.mock.full', (await p.locator('.sec').count()) === 5 && /적극 매수 후보/.test(t) && clean(t));
    ok('rpt.mock.status', /5개 항목 자동 수집/.test(await p.locator('#st').innerText()));
    await p.close();
  }
  // 서버 없는 환경(file://): 크래시 없이 안내 화면
  { const p = await page('report.html');
    await p.fill('#q', '005930'); await p.click('#go'); await p.waitForTimeout(700);
    ok('rpt.offline.guide', /데이터를 받아오지 못했어요|연결할 수 없어요/.test(await p.locator('.guide').innerText().catch(() => '')));
    await p.close();
  }

  /* ── 탭 연동: 보고서 → 3개 탭 자동 채움 ── */
  const mockScript = () => {
    const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    const candles = []; let base = 60000;
    for (let i = 0; i < 70; i++) { base *= 1.002; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
    window.fetch = url => {
      if (url.includes('quote-search')) return mk({ results: [{ code: "005930", name: "삼성전자", exchange: "KOSPI" }] });
      if (url.includes('quote-fundamentals')) return mk({ meta: { name: "삼성전자", price: 70000 }, valuation: { per: 11, pbr: 1.1, dividendYield: 2.5, roe: 9.5 }, fundamentals: { revenueGrowth: 12.3, earningsGrowth: 20.1, operatingMargin: 18.4 }, consensus: { targetMean: 90000, recommendationMean: 2.1 } });
      if (url.includes('quote-yahoo')) return mk({ meta: { name: "삼성전자", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t" }, candles });
      if (url.includes('quote-kis-flow')) return mk({ summary: { f5: 1200, i5: 300, f20: 3000, i20: 700, fStreak: 5, iStreak: 5 } });
      return Promise.reject(new Error('no'));
    };
  };
  let scoreLink = null;
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('link-rpt: ' + e.message));
    await p.addInitScript(mockScript);
    await p.goto(F('report.html'));
    await p.fill('#q', '삼성전자'); await p.click('#go'); await p.waitForTimeout(400);
    const val = await p.locator('#app .navrow a').nth(0).getAttribute('href');
    scoreLink = await p.locator('#app .navrow a').nth(2).getAttribute('href');
    ok('link.rpt.val', /valuation-flow\.html\?code=005930/.test(val || ''));
    ok('link.rpt.score', /scorecard\.html\?.*flow=2/.test(scoreLink || ''));
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('link-val: ' + e.message));
    await p.addInitScript(mockScript);
    await p.goto(F('valuation-flow.html') + '?code=005930&name=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90');
    await p.waitForTimeout(500);
    ok('link.val.autofill', (await p.inputValue('#px')) === '70,000' && (await p.inputValue('#f5')) === '1200');
    ok('link.val.analyzed', (await p.locator('.plain').count()) === 1);
    ok('link.val.navkeep', /report\.html\?code=005930/.test(await p.locator('.navrow a[href*="report"]').first().getAttribute('href') || ''));
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('link-fund: ' + e.message));
    await p.addInitScript(mockScript);
    await p.goto(F('fundamentals-flow.html') + '?code=005930&name=x');
    await p.waitForTimeout(500);
    ok('link.fund.autofill', (await p.inputValue('#revG')) === '12.3' && (await p.inputValue('#tp')) === '90,000');
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('link-sc: ' + e.message));
    await p.goto(F('scorecard.html') + '?' + (scoreLink || '').split('?')[1]);
    await p.waitForTimeout(400);
    ok('link.sc.verdict', (await p.locator('.verdict .g').count()) === 1);
    ok('link.sc.filled', (await p.inputValue('#ax_flow')) === '2');
    await p.close(); }

  /* ── ETF 모드 / 차트 KIS 폴백 / 전체실패 안내 ── */
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('etf: ' + e.message));
    await p.addInitScript(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 37000;
      for (let i = 0; i < 70; i++) { base *= 1.001; candles.push({ o: base, h: base * 1.008, l: base * 0.992, c: base, v: 0 }); }
      window.fetch = url => {
        if (url.includes('quote-fundamentals')) return mk({ meta: { name: "TIGER 반도체", price: 37285, quoteType: "ETF" }, valuation: { dividendYield: 1.1 }, fundamentals: {}, consensus: {} });
        if (url.includes('quote-yahoo')) return mk({ meta: { name: "TIGER 반도체", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t", quoteType: "ETF" }, candles });
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KIS 키" }) });
      };
    });
    await p.goto(F('report.html') + '?code=396500');
    await p.waitForTimeout(500);
    const t = await appText(p);
    ok('etf.infocard', /개별 기업 지표가 원래 없어요/.test(t));
    ok('etf.noValCard', !/값이 싼가/.test(t) && /차트 흐름/.test(t) && /1차로 살 자리/.test(t));
    ok('etf.clean', clean(t));
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('fb: ' + e.message));
    await p.addInitScript(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 10000;
      for (let i = 0; i < 40; i++) { base *= 1.002; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
      window.fetch = url => {
        if (url.includes('quote-yahoo')) return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "Yahoo 429" }) });
        if (url.includes('functions/quote?')) return mk({ meta: { name: "미래에셋증권", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t" }, candles });
        if (url.includes('quote-fundamentals')) return mk({ meta: { name: "미래에셋증권", price: 10800, quoteType: "EQUITY" }, valuation: { per: 8, pbr: 0.5, dividendYield: 3.2, roe: 7 }, fundamentals: { revenueGrowth: 5 }, consensus: { targetMean: 13000, recommendationMean: 2.2 } });
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KIS 키" }) });
      };
    });
    await p.goto(F('report.html') + '?code=006800');
    await p.waitForTimeout(500);
    const t = await appText(p);
    ok('chartfb.kis', /차트 흐름/.test(t) && /1차로 살 자리/.test(t) && (await p.locator('.verdict .g').count()) === 1);
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('fail: ' + e.message));
    await p.addInitScript(() => { window.fetch = () => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "Yahoo 시세 실패 [KS/query1 429]" }) }); });
    await p.goto(F('report.html') + '?code=006800');
    await p.waitForTimeout(500);
    ok('fail.reasons', /429/.test(await p.locator('.guide').innerText().catch(() => '')));
    await p.close(); }

  /* ── 소룩스 회귀: 차트가 확정한 시장(sfx)을 기본정보에 전달 + 가격 교차검증 ── */
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('sfx: ' + e.message));
    await p.addInitScript(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 4500;
      for (let i = 0; i < 40; i++) { base *= 1.001; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
      window.__fundUrl = null;
      window.fetch = url => {
        if (url.includes('quote-yahoo')) return mk({ meta: { name: "소룩스", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t", quoteType: "EQUITY", symbol: "290690.KQ" }, candles });
        if (url.includes('quote-fundamentals')) { window.__fundUrl = url;
          return mk({ meta: { name: "소룩스", price: 4640, quoteType: "EQUITY" }, valuation: { per: 20, pbr: 1.4, roe: 5 }, fundamentals: {}, consensus: {} }); }
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KIS" }) });
      };
    });
    await p.goto(F('report.html') + '?code=290690');
    await p.waitForTimeout(500);
    const t = await appText(p);
    ok('sfx.hintPassed', /sfx=KQ/.test(await p.evaluate(() => window.__fundUrl) || ''));
    ok('sfx.notEtf', !/ETF\(묶음 상품\)/.test(t) && /값이 싼가/.test(t));
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('xchk: ' + e.message));
    await p.addInitScript(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 4500;
      for (let i = 0; i < 40; i++) { base *= 1.001; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
      window.fetch = url => {
        if (url.includes('quote-yahoo')) return mk({ meta: { name: "소룩스", price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t", quoteType: "EQUITY" }, candles });
        if (url.includes('quote-fundamentals')) return mk({ meta: { name: "이상한펀드", price: 12140, quoteType: "ETF" }, valuation: { dividendYield: 1 }, fundamentals: {}, consensus: {} });
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KIS" }) });
      };
    });
    await p.goto(F('report.html') + '?code=290690');
    await p.waitForTimeout(500);
    const t = await appText(p);
    ok('xchk.dropBogus', !/12,140/.test(t) && !/ETF\(묶음 상품\)/.test(t) && /차트 흐름/.test(t)); // 차트와 불일치한 기본정보 폐기
    await p.close(); }

  /* ── 검색 체인: KRX 실패→Yahoo 폴백 / 둘 다 실패→종목번호 안내 ── */
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('chain: ' + e.message));
    await p.addInitScript(() => {
      const mk = o => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
      const candles = []; let base = 10000;
      for (let i = 0; i < 40; i++) { base *= 1.002; candles.push({ o: base, h: base * 1.01, l: base * 0.99, c: base, v: 0 }); }
      window.fetch = url => {
        if (url.includes('krx-names')) return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KRX 차단" }) });
        if (url.includes('quote-search')) return mk({ results: [{ code: "006800", name: "미래에셋증권", exchange: "KOSPI" }] });
        if (url.includes('quote-fundamentals')) return mk({ meta: { name: "미래에셋증권", price: 10800, quoteType: "EQUITY" }, valuation: { per: 8, pbr: 0.5, dividendYield: 3.2, roe: 7 }, fundamentals: {}, consensus: {} });
        if (url.includes('quote-yahoo')) return mk({ meta: { price: candles.at(-1).c, prevClose: candles.at(-2).c, asOfDate: "t" }, candles });
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "KIS" }) });
      };
    });
    await p.goto(F('report.html'));
    await p.fill('#q', '미래에셋증권'); await p.click('#go'); await p.waitForTimeout(500);
    ok('chain.yahooFallback', /미래에셋증권/.test(await appText(p)) && (await p.locator('header.rpt').count()) === 1);
    await p.close(); }
  { const p = await b.newPage(); p.on('pageerror', e => errs.push('chain2: ' + e.message));
    await p.addInitScript(() => { window.fetch = () => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: "검색 실패 [query1 429]" }) }); });
    await p.goto(F('report.html'));
    await p.fill('#q', '미래에셋증권'); await p.click('#go'); await p.waitForTimeout(400);
    ok('chain.codeHint', /6자리 종목번호/.test(await p.locator('#st').innerText()));
    await p.close(); }

  console.log(`  pageerrors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  ok('no-pageerrors', errs.length === 0);
  console.log(`\n${fail ? '❌' : '✅'} ui: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();

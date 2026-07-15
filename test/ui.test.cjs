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

  console.log(`  pageerrors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  ok('no-pageerrors', errs.length === 0);
  console.log(`\n${fail ? '❌' : '✅'} ui: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();

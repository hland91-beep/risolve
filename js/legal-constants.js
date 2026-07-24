/* ============================================================
   Next Life — 법령·제도 상수 설정 (Legal & Regulatory Constants)
   매년 개정되는 국민연금 A값·소득기준 등은 이 파일 한 곳만 고치면
   진단 계산 로직과 PDF 보고서("주요 가정 및 근거" 표) 양쪽에 반영됩니다.
   ============================================================ */

const LEGAL_CONSTANTS = {
  // ── 국민연금 ──────────────────────────────────────────
  NPS_A_VALUE_2026: 3193511,          // 2026년 A값(전체가입자 평균소득월액, 원)
  NPS_WORK_REDUCE_THRESHOLD: 519,     // 노령연금 재취업 감액 기준소득월액(만원/월) — 2026년 A값 상승 반영(구 509 → 519)
  NPS_WORK_REDUCE_YEARS: 5,           // 감액 적용 기간(연금 수급 개시 후 n년)
  NPS_EARLY_RATE: 0.70,               // 조기노령연금(-5년) 지급률
  NPS_LATE_RATE: 1.36,                // 연기연금(+5년) 지급률
  NPS_LATE_ACCRUAL_ANNUAL: 0.072,     // 연기 1년당 가산율(7.2%)

  // ── 공무원·직역연금 ────────────────────────────────────
  GOV_ACCRUAL_RATE: 0.01736,          // 공무원연금 지급률(재직 1년당)
  GOV_WORK_THRESHOLD: 280,            // 공무원연금 재취업 일부정지 기준(평균연금월액, 만원)
  GOV_FULL_SUSPEND_INCOME: 913.6,     // 공무원연금 전액정지 근로소득월액(만원)

  // ── 건강보험 ──────────────────────────────────────────
  HEALTH_DEPENDENT_INCOME_LIMIT: 2000, // 건강보험 피부양자 탈락 기준(연 소득, 만원)

  // ── 세제 ─────────────────────────────────────────────
  PRIVATE_PENSION_SEPARATE_TAX_LIMIT: 1500, // 사적연금 분리과세 한도(연 수령액, 만원)
  PRIVATE_PENSION_SEPARATE_TAX_RATE: 0.165, // 한도 초과 시 분리과세율(16.5%)
  PENSION_SAVINGS_CREDIT_CAP: 600,    // 연금저축 세액공제 한도(연, 만원)
  IRP_CREDIT_CAP: 900,                // 연금저축+IRP 합산 세액공제 한도(연, 만원)
  ISA_CAP: 2000,                      // ISA 연간 납입한도(만원)

  // ── 임원 퇴직소득 (법인 대표 퇴직플랜 진단) ──
  EXEC_SEVERANCE_RATE: 0.1,           // 퇴직 전 3년 평균 연급여의 10%
  EXEC_SEVERANCE_MULTIPLE: 2,         // 임원 퇴직소득 한도 배수(2020년 이후 근속분 기준)

  // ── 출처/기준시점 (보고서 "주요 가정 및 근거" 표에 사용) ──
  SOURCES: {
    NPS_WORK_REDUCE: '국민연금법 시행령 (2026년 A값 고시 반영)',
    GOV_SUSPEND: '공무원연금법 소득심사',
    PRIVATE_PENSION_TAX: '소득세법 §20-3',
    HOUSING_PENSION: '한국주택금융공사 종신지급 근사',
    HEALTH_DEPENDENT: '국민건강보험법 시행규칙 (2026 기준)',
    EXEC_SEVERANCE: '소득세법 §22 임원 퇴직소득 한도 (2020년 이후 근속분 2배)'
  },

  UPDATED_AT: '2026-07' // 이 상수 세트의 최종 검토 시점(연-월)
};

if (typeof window !== 'undefined') window.LEGAL_CONSTANTS = LEGAL_CONSTANTS;

# GitHub Pages 호스팅 가이드
## (무료 · 5분 완성)

---

## 📁 올릴 파일 목록 (이 폴더의 파일 4개)

| 파일 | 설명 |
|------|------|
| `index.html` | 메인 랜딩 페이지 (앱 소개 + 무료 체험 링크) |
| `free.html` | 은퇴준비자금 계산기 무료 체험판 (8단계 계산기) |
| `privacy.html` | 은퇴준비자금 계산기 (일반용) 개인정보처리방침 |
| `privacy-totalri.html` | 은퇴준비자금 계산기 개인정보처리방침 |

---

## 🔢 업로드 순서 (총 5분 소요)

### Step 1. GitHub 가입 (이미 있으면 Skip)
1. [github.com](https://github.com) 접속
2. **Sign up** 클릭 → 이메일(hland91@gmail.com) + 비밀번호 설정
3. 이메일 인증 완료

---

### Step 2. 새 Repository(저장소) 만들기

1. 로그인 후 우측 상단 **+** → **New repository** 클릭
2. 아래 정보 입력:

| 항목 | 입력값 |
|------|--------|
| Repository name | `risolve` |
| Description | 은퇴준비자금 계산기 — 무료 체험 & 개인정보처리방침 |
| Public / Private | **Public** 선택 (Pages는 Public만 무료) |
| Initialize with README | ✅ 체크 |

3. **Create repository** 클릭

---

### Step 3. 파일 업로드

1. 생성된 repository 페이지에서 **Add file** → **Upload files** 클릭
2. 이 폴더(github-pages)의 파일 4개를 드래그 앤 드롭:
   - `index.html`
   - `free.html`
   - `privacy.html`
   - `privacy-totalri.html`
3. 하단 **Commit changes** 클릭 → **Commit directly to the main branch** 선택 → **Commit changes** 클릭

> ⚠️ free.html은 119KB — 업로드 시간이 조금 더 걸릴 수 있음

---

### Step 4. GitHub Pages 활성화

1. Repository 상단 탭에서 **Settings** 클릭
2. 왼쪽 메뉴 → **Pages** 클릭
3. **Source** 섹션: **Deploy from a branch** 선택
4. **Branch**: `main` 선택, 폴더: `/ (root)` 선택
5. **Save** 클릭

---

### Step 5. URL 확인

약 1~2분 후 Settings → Pages 페이지에 URL이 표시됩니다:

```
✅ Your site is live at:
https://hland91-beep.github.io/risolve/
```

---

## 📋 최종 URL 목록

### 메인 랜딩 페이지 (홍보용)
```
https://hland91-beep.github.io/risolve/
```

### 무료 체험판 (앱 설치 없이 브라우저 실행)
```
https://hland91-beep.github.io/risolve/free.html
```

### Play Console 개인정보처리방침

| 앱 | URL |
|----|-----|
| 은퇴준비자금 계산기 (일반용) | `https://hland91-beep.github.io/risolve/privacy.html` |
| 은퇴준비자금 계산기 (유료) | `https://hland91-beep.github.io/risolve/privacy-totalri.html` |

---

## 📣 홍보 활용법

| 채널 | 활용 방법 |
|------|-----------|
| 카카오톡 | `https://hland91-beep.github.io/risolve/free.html` 링크 공유 |
| 블로그/카페 | "설치 없이 지금 바로" 문구 + 링크 삽입 |
| Play Store 설명 | "웹 브라우저에서도 무료 체험 가능" + URL 기재 |
| QR코드 | free.html URL로 QR 생성 → 명함/전단지 인쇄 |

---

## ⚠️ 주의사항

- Repository를 **Private**으로 만들면 Pages가 유료! 반드시 **Public** 선택
- URL 입력 시 `https://` 포함한 전체 주소 입력
- Pages 활성화 후 실제 접속 가능해지기까지 최대 5분 소요
- free.html에는 유료앱 Play Store 링크가 내장되어 있음 (자동 전환 유도)

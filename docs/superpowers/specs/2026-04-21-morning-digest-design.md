# morning-digest Design Spec

- **Date**: 2026-04-21
- **Author**: logan (brainstorm with Claude)
- **Status**: Draft → awaiting implementation plan
- **Predecessor**: `../../../morning-digest` (Kotlin + Jekyll markdown digest). v2는 경험만 참고하고 코드는 재사용하지 않는다.

## 1. 목적과 범위

개인이 매일 아침 기술 블로그·트렌드를 한 곳에서 읽기 위한 **정적 웹 UI 기반 큐레이션 사이트**를 구축한다.
핵심 특성:

- RSS/Atom 피드를 수집하고, Claude Code Skill을 통해 **필터 / 요약 / 태깅**한다.
- 결과를 **Astro SSG**로 빌드하여 **GitHub Pages**에 배포한다.
- 소비 창구는 웹 UI 하나 (읽기 전용). 모바일/데스크톱 브라우저 모두 고려.
- 개인 용도. 인증/멀티 유저 없음.

### Non-goals

- 멀티 유저, 로그인, 댓글, 소셜 기능.
- 동적 서버/DB 백엔드 (전부 static + 클라이언트 localStorage).
- v1 코드/데이터 스키마 하위 호환. (깨끗한 재설계)

## 2. 의사결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| 소비 수단 | 직접 만드는 웹 UI | RSS 리더에 갇히지 않은 큐레이션된 뷰 |
| LLM 큐레이션 | 유지 (filter / summarize / tag) | 단순 aggregator 대비 정보 밀도 ↑ |
| 호스팅 | Static (GitHub Pages) | 비용 0, 운영 부담 0 |
| 프레임워크 | Astro | 이미지 최적화, 아일랜드 모델, SEO |
| 파이프라인 스택 | TypeScript/Node 통합 | 단일 언어, 타입 공유, 라이브러리 성숙 |
| 실행 위치 | Hybrid (Local LLM + GH Actions build) | LLM 비용 0, build 안정성 확보 |
| 썸네일 | `astro:assets` remote image (빌드시 fetch+최적화) | repo 부풀림 없이 원본 깨짐 방어 |
| 소스 관리 | `sources.yaml` in repo | 버전 관리, 메타데이터 기재 용이 |
| 보존 정책 | 영구 아카이브 + 홈 최근 30일 | 개인 지식베이스 가치 |

## 3. 아키텍처

```
┌─────────────────────────────────────────────────────┐
│ LOCAL (macOS, launchd KST 05:30)                    │
│                                                      │
│  pnpm digest:daily                                   │
│    ├─ fetch    (rss-parser, sources.yaml)           │
│    ├─ dedupe   (better-sqlite3 seen.db)             │
│    ├─ extract  (article-extractor, og:image)        │
│    ├─ llm      (claude -p /morning-digest-skill)    │
│    │             → filter / summarize / tag          │
│    └─ write    (src/content/items/*.json)           │
│                                                      │
│  git commit + push                                   │
└─────────────────────────────────────────────────────┘
                      │ push
                      ▼
┌─────────────────────────────────────────────────────┐
│ GITHUB ACTIONS (on push to main)                    │
│                                                      │
│  pnpm build                                          │
│    └─ Astro SSG                                      │
│         ├─ content collection → pages                │
│         ├─ astro:assets remote image 최적화         │
│         └─ dist/                                     │
│                                                      │
│  deploy → gh-pages                                   │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
              GitHub Pages (읽기 전용 정적 사이트)
```

### 경계 3개

- `pipeline/` — Node CLI. fetch → write. UI 모름.
- `src/content/` — JSON 스키마 = 파이프라인과 UI 사이의 계약.
- `src/pages/` + `src/components/` — Astro. 파이프라인 모름.

`src/content/` 스키마가 유일한 커플링 지점이다. 파이프라인 교체, UI 리디자인 모두 이 경계만 지키면 독립적이다.

## 4. Data Model

### 4.1 `src/content/config.ts` (Astro content collections)

```ts
// items collection — 1 파일 = 1 아티클
{
  id: string,              // stable hash(sha1(guid || link))
  url: string,
  title: string,
  source: {
    slug: string,
    name: string,
    category: string,      // ai | backend | infra | frontend | devops | career | etc
  },
  publishedAt: string,     // ISO-8601
  ingestedAt: string,      // pipeline 실행 시각
  tags: string[],          // allowlist 기반
  summary: string,         // 한국어 2-3문장
  highlights: string[],    // 불릿 3-5개 (선택)
  filterScore: number,     // 0-10
  thumbnail: string | null,// og:image 원본 URL (빌드시 astro:assets fetch)
  author: string | null,
  lang: "ko" | "en" | "ja" | "other",
}

// sources collection — sources.yaml → typed access
{
  slug, name, feedUrl, siteUrl, category, priority, tags: string[]
}
```

### 4.2 Tag allowlist

고정 세트 (추후 확장 가능, 변경은 PR 필요):

```
ai, llm, agents, backend, frontend, infra, devops, db, security,
architecture, testing, kotlin, typescript, java, python, career, tooling
```

LLM 프롬프트에서 이 집합 밖 태그 생성 금지. 파이프라인에서도 post-validate.

### 4.3 정렬·색인

- 홈 / 태그 / 소스 페이지: `publishedAt` desc, fallback `ingestedAt`
- 검색 인덱스: `public/search-index.json` (title + summary + tags + source.name). Fuse.js 소비.

## 5. Pipeline

### 5.1 CLI

```
pnpm digest:daily [--date=YYYY-MM-DD] [--dry-run] [--force] [--only=<stage>]
```

### 5.2 Stages

| Stage | In | Out | Lib |
|-------|-----|-----|-----|
| fetch | `sources.yaml` | `_workspace/<date>/raw.json` | `rss-parser`, `p-limit` (concurrency 8) |
| dedupe | `raw.json` | `new.json` | `better-sqlite3` on `state/seen.db` |
| extract | `new.json` | `extracted.json` | `@extractus/article-extractor` (본문 + og:image) |
| llm | `extracted.json` | `curated.json` | `execa` → `claude -p /morning-digest-skill` |
| write | `curated.json` | `src/content/items/<id>.json` + `search-index.json` | fs + zod |

### 5.3 LLM stage

- Claude Code Skill: `.claude/skills/morning-digest/SKILL.md`
- Skill responsibilities: filter(`filterScore ≥ 6`, 상위 30개) → 한국어 요약 → allowlist 태깅.
- I/O: stdin으로 `extracted.json` 경로 전달, stdout에 zod-validatable JSON 출력.
- Re-try: 스키마 실패 1회 재요청 (에러 메시지 포함해 재프롬프트), 최종 실패시 해당 item은 `rawFallback` 처리 (summary=title 첫 200자, tags=[]).

### 5.4 멱등성 & 복구

- `seen.db` 가 같은 날짜 재실행을 block.
- `--force`: seen.db 업데이트 없이 재처리. 디버깅용.
- `--dry-run`: seen.db·content·search-index 모두 미기록. 로그만.
- 각 stage는 입력 파일이 있으면 단독 재실행 가능 (`--only=llm`).

## 6. UI (Astro)

### 6.1 라우트

```
/                 최근 30일 홈
/tags/[tag]       태그별
/sources/[slug]   소스별
/archive          월별 인덱스
/archive/[ym]     특정 월 (YYYY-MM)
/rss.xml          자체 재발행 피드 (상위 30)
```

### 6.2 컴포넌트

```
src/
  layouts/
    Base.astro            head + 테마 초기화 + nav
  components/
    ItemCard.astro        썸네일 / 제목 / 요약 / tag / source / read state
    TagFilter.astro       island — 태그 토글, 쿼리 파라미터 동기화
    SearchBox.astro       island — fuse.js + search-index.json
    ThemeToggle.astro     island — prefers-color-scheme + localStorage
    UnreadBadge.astro     island — 읽음 상태 카운트
  pages/
    index.astro
    tags/[tag].astro
    sources/[slug].astro
    archive/index.astro
    archive/[ym].astro
    rss.xml.ts
```

### 6.3 인터랙션

- **읽음 추적**: `localStorage["read-items"]` 에 `itemId` 집합 저장. 카드 클릭 또는 뷰포트 3초 진입시 add. 렌더링은 `[data-read="true"]` 속성 → CSS로 흐릿 처리.
- **다크모드**: `<html data-theme="dark">`, CSS custom properties. `<head>` inline script로 FOUC 방지.
- **검색**: 빌드 타임 `search-index.json` (items 메타만, 수 KB). Fuse.js lazy load, 첫 타이핑 시 fetch.
- **태그 필터**: 홈에서는 URL 쿼리(`?tag=llm`) 기반 서버 렌더 페이지로 유도. `/tags/[tag]`가 정식 경로.

### 6.4 Island 전략

기본 0 JS. Island = `TagFilter`, `SearchBox`, `ThemeToggle`, 읽음 tracker 4개. `client:idle` 또는 `client:visible`.

### 6.5 썸네일

- `astro:assets` `getImage()` with remote URL. webp + srcset 자동.
- `astro.config` 에 허용 도메인 화이트리스트 (수집된 피드 호스트 기반, 주기적 갱신).
- 썸네일 없거나 fetch 실패: source.category 별 SVG fallback.

## 7. Error Handling & Observability

### 7.1 Pipeline 로깅

- `_workspace/logs/<date>.jsonl` — 각 stage `{stage, ok, itemsIn, itemsOut, durationMs, error?}` 1줄씩.
- `_workspace/logs/daily.stderr.log` — launchd stderr 누적.
- `_workspace/<date>/run_summary.json` — 하루치 요약.

### 7.2 실패 격리

- 피드 단위: `Promise.allSettled` 로 개별 실패 고립. raw.json 에 `fetchErrors` 섹션으로 기록.
- Stage 단위: 실패시 stage-level fail 기록 후 후속 stage 스킵 가능.
- LLM 단위: 재시도 1회, 실패시 fallback summary.

### 7.3 Source health

- `seen.db` 에 `source_health(slug, consecutive_failures, last_ok_at)` 테이블.
- 7일 연속 실패시 로컬 로그에 경고 (자동 `sources.yaml` 변경은 안 함 — 검토 후 사람 수동으로 disable).

### 7.4 UI

- 빌드 실패: Actions workflow fail → 기존 `gh-pages` 유지, 사이트는 이전 상태 유지.
- 런타임: 정적이라 서버 에러 없음. 썸네일 404 → fallback SVG.

## 8. Testing

| 범위 | 도구 | 전략 |
|------|------|------|
| pipeline stages | Vitest | pure function 단위 (input JSON → output JSON). fixture: `pipeline/test/fixtures/` |
| LLM stage | Vitest + `FakeClaudeRunner` | 실제 CLI 호출 안 함. JSON 계약만 검증 |
| content schema | Vitest + zod | round-trip + malformed rejection |
| UI smoke | Playwright | 홈 로드 / 태그 필터 클릭 / 다크모드 토글 1 케이스 |

커버리지 목표: pipeline 80%+, UI smoke 1개면 충분 (개인 사이드).

## 9. Deployment & Scheduling

### 9.1 GitHub Actions

```
.github/workflows/
  ci.yml        PR: pnpm install, lint, test, build (deploy 없음)
  deploy.yml    push main: build → actions/deploy-pages@v4 → gh-pages
```

- Node 20, pnpm 9, `actions/cache@v4` for pnpm store.
- `GITHUB_TOKEN` 기본 권한으로 Pages 배포.

### 9.2 Local launchd

- `~/Library/LaunchAgents/me.logan.morning-digest.plist`
- `StartCalendarInterval: {Hour: 5, Minute: 30}`
- `ProgramArguments`: 환경 초기화된 `scripts/daily.sh` 실행
- `scripts/daily.sh`:
  1. `cd repo`
  2. `git pull --ff-only`
  3. `pnpm install --frozen-lockfile`
  4. `pnpm digest:daily`
  5. 변경 있으면 `git add -A && git commit && git push`
  6. 실패해도 `exit 0` (launchd 재시도 루프 회피)
- `StandardOutPath` / `StandardErrorPath`: `_workspace/logs/launchd.{out,err}.log`

## 10. Repo 구조 (예상)

```
morning-digest/
  .claude/
    skills/morning-digest/SKILL.md
  .github/workflows/
    ci.yml
    deploy.yml
  astro.config.mjs
  package.json
  pnpm-lock.yaml
  tsconfig.json
  sources.yaml
  pipeline/
    src/
      index.ts            CLI entry
      stages/{fetch,dedupe,extract,llm,write}.ts
      lib/{hash,log,zod-schemas}.ts
    test/
      fixtures/
      *.test.ts
  src/
    content/
      config.ts
      items/              pipeline 산출물
    layouts/
    components/
    pages/
    styles/
  public/
    fallbacks/            카테고리별 SVG
  state/
    seen.db               (gitignored)
  _workspace/             (gitignored)
    <date>/
    logs/
  scripts/
    daily.sh
    dev.sh
  docs/
    superpowers/specs/
      2026-04-21-morning-digest-design.md   ← 본 문서
```

## 11. Open Questions (구현 계획 단계에서 결정)

- `sources.yaml` 초기 소스 목록 — v1에서 가져올지 처음부터 재선정할지.
- `search-index.json` 크기 상한 (예: 수천 건 넘으면 Pagefind 등으로 전환할지).
- 월별 아카이브 페이지 정렬/디자인 세부.
- 테마 색상 팔레트 (설계 단계에서 세부 디자인 미정).

---

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>

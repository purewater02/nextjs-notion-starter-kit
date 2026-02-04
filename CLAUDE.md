# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Notion을 헤드리스 CMS로 사용하는 Next.js 기반 정적 사이트 생성기입니다. `react-notion-x` 라이브러리를 사용하여 Notion 페이지를 블로그/포트폴리오 웹사이트로 렌더링합니다.

## 핵심 아키텍처

### Notion CMS 플로우

1. **설정** (`site.config.ts`): 사이트 설정의 단일 진실 공급원
   - `rootNotionPageId`: 홈페이지로 사용할 Notion 페이지 ID
   - `rootNotionSpaceId`: 선택적 워크스페이스 제한
   - `pageUrlOverrides`: 특정 페이지에 대한 수동 URL 매핑
   - 네비게이션, 소셜 링크, 분석 설정

2. **페이지 해석 파이프라인** (`lib/resolve-notion-page.ts`):
   - URL 경로와 도메인을 입력받음
   - 먼저 `pageUrlOverrides`와 `pageUrlAdditions`에서 수동 매핑 확인
   - 이전에 해석된 URL의 경우 Redis 캐시 확인 (`uri-to-page-id` 키 패턴)
   - 캐시에 없으면 사이트 맵(`getSiteMap()`)을 쿼리하여 정규 페이지 매핑 찾기
   - Notion 페이지 데이터(`ExtendedRecordMap`)와 메타데이터 반환

3. **사이트 맵 생성** (`lib/get-site-map.ts`):
   - `rootNotionPageId`부터 시작하여 Notion 워크스페이스의 모든 페이지 크롤링
   - 두 가지 매핑 생성:
     - `pageMap`: Notion 페이지 ID → 전체 페이지 데이터
     - `canonicalPageMap`: URL 친화적 슬러그 → Notion 페이지 ID
   - 페이지의 "Public" 속성 존중 (비공개 페이지 숨김)
   - 성능을 위해 `p-memoize`로 캐싱

4. **URL 생성** (`lib/map-page-url.ts`):
   - 개발 모드: URL에 Notion ID 포함 (`/page-title-d1b5dcf8b9ff425b`)
   - 프로덕션 모드: 깔끔한 URL (`/page-title`)
   - `notion-utils`의 `getCanonicalPageId`를 사용하여 페이지 제목에서 슬러그 생성
   - "Slug" 속성이 있는 페이지는 자동 슬러그 생성 오버라이드

### 주요 라이브러리

- **react-notion-x**: Notion 블록을 React 컴포넌트로 렌더링
  - `styles/notion.css`에서 커스텀 스타일링
  - 각 Notion 블록은 고유한 클래스 `.notion-block-{id}` 보유
- **notion-client**: 비공식 API를 통해 Notion 데이터 가져오기
- **lqip-modern**: 부드러운 로딩을 위한 저품질 이미지 플레이스홀더 생성
- **next/image**: AVIF/WebP 지원을 통한 최적화된 이미지 제공

### 데이터 레이어

- **Redis (선택사항)**: URL-페이지ID 매핑 및 프리뷰 이미지 캐싱
  - 설정에서 `isRedisEnabled: true`로 활성화
  - `REDIS_HOST` 및 `REDIS_PASSWORD` 환경 변수 필요
  - 캐시 키: `uri-to-page-id:{domain}:{env}:{path}`

### 특수 기능

- **프리뷰 이미지**: 빌드 시 생성, Redis에 캐시 가능
  - 설정의 `isPreviewImageSupportEnabled`로 제어
  - `lib/preview-images.ts`에서 생성

- **소셜 이미지**: `/api/social-image`에서 동적 OG 이미지 생성
  - Vercel의 OG 이미지 생성 사용
  - `pages/api/social-image.tsx`에 템플릿

- **검색**: CMD+K를 통한 클라이언트 측 검색
  - `/api/search-notion.ts`의 API 엔드포인트

## 개발 명령어

```bash
# 의존성 설치 (pnpm 사용)
pnpm install

# 개발 서버 실행 (localhost:3000)
pnpm dev

# 프로덕션 빌드
pnpm build

# 프로덕션 서버 시작
pnpm start

# Vercel에 배포
pnpm deploy

# 모든 테스트 실행 (lint + prettier)
pnpm test

# Lint만 실행
pnpm run test:lint

# 코드 포맷팅 확인
pnpm run test:prettier

# 번들 분석
pnpm run analyze              # 전체 분석
pnpm run analyze:server       # 서버 번들만
pnpm run analyze:browser      # 브라우저 번들만
```

## 프로젝트 구조

```
├── site.config.ts          # 메인 설정 파일
├── pages/
│   ├── [pageId].tsx        # 동적 페이지 라우팅
│   ├── index.tsx           # 홈페이지
│   ├── _app.tsx            # Next.js 앱 래퍼
│   └── api/                # API 라우트
│       ├── search-notion.ts
│       └── social-image.tsx
├── lib/
│   ├── config.ts           # 사이트 설정 + 환경 변수 처리
│   ├── resolve-notion-page.ts  # 핵심 페이지 해석 로직
│   ├── get-site-map.ts     # 사이트 맵 생성
│   ├── map-page-url.ts     # URL 매핑 유틸리티
│   ├── notion-api.ts       # Notion API 클라이언트 인스턴스
│   └── notion.ts           # Notion 데이터 가져오기 래퍼
├── components/
│   ├── NotionPage.tsx      # 메인 페이지 렌더러
│   └── ...                 # UI 컴포넌트
└── styles/
    └── notion.css          # Notion 콘텐츠 커스터마이징
```

## 중요한 구현 세부사항

### URL 경로 해석

페이지 URL이 결정되는 세 가지 방법:

1. **수동 오버라이드**: `site.config.ts` → `pageUrlOverrides`에서 정의
2. **Slug 속성**: Notion 페이지에 "Slug" 텍스트 속성 추가
3. **자동 생성**: 슬러그화된 페이지 제목 (개발 환경에서는 Notion ID 접미사 선택 사항)

### Vercel 배포 참고사항

- 프로젝트 설정 → Deployment Protection에서 "Vercel Authentication" 비활성화
  - 소셜 이미지 생성이 작동하는 데 필요 (크롤러의 401 오류 방지)
- Redis나 분석 사용 시 Vercel 대시보드에서 환경 변수 설정
- 빌드 타임아웃은 300초로 설정됨 (`staticPageGenerationTimeout`)

### 로컬 개발 링킹

`react-notion-x` 로컬 개발 시:
```bash
# 로컬 패키지 링크
pnpm run deps:link

# 링크 해제 및 게시된 패키지 복원
pnpm run deps:unlink
```

### 이미지 도메인

`next.config.js`에서 설정:
- www.notion.so, notion.so (Notion 에셋)
- images.unsplash.com (Notion 임베드 이미지)
- abs.twimg.com, pbs.twimg.com (트위터 임베드)
- s3.us-west-2.amazonaws.com (Notion S3 스토리지)

## 일반적인 개발 패턴

### 새 페이지 기능 추가

1. `react-notion-x`에서 블록 타입이 이미 지원되는지 확인
2. 필요한 경우 `styles/notion.css`에 커스텀 스타일 추가
3. `.notion-block-{blockId}` 클래스를 사용하여 특정 블록 타겟팅

### 네비게이션 커스터마이징

`site.config.ts`에서 `navigationStyle: 'custom'` 설정 및 `navigationLinks` 정의:
```typescript
navigationLinks: [
  { title: 'About', pageId: 'notion-page-id-here' },
  { title: 'Blog', pageId: 'another-page-id' }
]
```

### 환경 변수 추가

1. 로컬 개발을 위해 `.env`에 추가
2. 프로덕션을 위해 Vercel 프로젝트 설정에 추가
3. `lib/config.ts`의 `getEnv()`를 통해 접근

## 분석 옵션

- **Fathom**: `NEXT_PUBLIC_FATHOM_ID` 환경 변수 설정
- **PostHog**: `NEXT_PUBLIC_POSTHOG_ID` 환경 변수 설정
- 둘 다 프로덕션에서만 활성화

## 테스트

프로젝트는 코드 품질을 위해 ESLint와 Prettier 사용:
- ESLint 설정: `eslint.config.js`
- Prettier 설정: `@fisch0920/config/prettier`에서 임포트
- Pre-commit 훅은 `simple-git-hooks` 및 `lint-staged`로 설정

# FORSOOMIN.md

## 🎯 이 프로젝트가 뭔가요?

이 프로젝트는 Notion을 CMS(Content Management System)로 사용하는 블로그/포트폴리오 사이트입니다. 쉽게 말하면, Notion에서 글을 쓰면 자동으로 예쁜 웹사이트로 변환해주는 시스템이죠.

왜 이게 멋진가? 대부분의 블로그는 WordPress나 별도의 관리자 페이지가 필요합니다. 하지만 많은 개발자들은 이미 Notion에서 메모하고, 정리하고, 글을 씁니다. "그럼 Notion에 쓴 걸 그냥 블로그로 만들면 되잖아?"라는 아이디어에서 시작한 프로젝트입니다.

## 🏗️ 전체 아키텍처: 큰 그림 이해하기

### 1. 흐름의 시작: "Notion에서 웹사이트까지"

이 시스템을 레스토랑에 비유해볼게요:

- **Notion**: 식재료 창고 (당신의 콘텐츠가 저장된 곳)
- **Next.js**: 주방 (식재료를 요리하는 곳)
- **react-notion-x**: 셰프 (Notion 데이터를 HTML로 변환)
- **Vercel**: 레스토랑 홀 (손님들에게 요리를 서빙)

흐름은 이렇습니다:

```
사용자가 blog.puredev.xyz/some-article 접속
    ↓
Next.js가 URL을 받아서 "어떤 Notion 페이지를 보여줘야 하지?" 확인
    ↓
lib/resolve-notion-page.ts가 URL → Notion 페이지 ID 변환
    ↓
Notion API를 통해 페이지 데이터 가져오기
    ↓
react-notion-x가 Notion 블록들을 React 컴포넌트로 변환
    ↓
사용자에게 예쁘게 렌더링된 HTML 제공
```

### 2. 핵심 철학: "빌드 타임 vs 런타임"

이 프로젝트의 가장 중요한 아키텍처 결정은 **정적 사이트 생성(Static Site Generation, SSG)**을 사용한다는 것입니다.

#### 두 가지 방식의 차이:

**방식 1: 런타임 렌더링 (매번 요청마다 Notion API 호출)**
- 장점: 항상 최신 콘텐츠
- 단점: 느림, Notion API 호출 제한에 걸릴 수 있음, 서버 비용 증가

**방식 2: 빌드 타임 정적 생성 (배포할 때 미리 HTML 생성)**
- 장점: 엄청 빠름, 서버 비용 거의 없음, SEO 최적화
- 단점: 콘텐츠 업데이트하려면 재배포 필요

이 프로젝트는 방식 2를 선택했습니다. 블로그는 보통 실시간으로 변하지 않으니까요. 글을 쓰고 → 배포하면 → 정적 HTML이 생성되고 → CDN에서 초고속으로 서빙됩니다.

## 🔍 핵심 모듈 깊이 파기

### 1. `lib/resolve-notion-page.ts`: URL 마법사

이 파일이 하는 일은 간단해 보이지만 매우 중요합니다: **"사용자가 입력한 URL을 어떤 Notion 페이지로 보여줄지 결정"**

#### 해결해야 할 문제:

Notion의 페이지는 `281b3053e30d4487976d26e534feba49` 같은 UUID로 식별됩니다. 하지만 사용자에게 `blog.puredev.xyz/281b3053e30d4487976d26e534feba49`를 보여줄 수는 없죠. `blog.puredev.xyz/my-first-post` 같은 예쁜 URL이 필요합니다.

#### 해결 방법 (3단계 폭포수):

```typescript
// 1단계: 수동 오버라이드 확인
const override = pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]
if (override) {
  pageId = parsePageId(override)
}

// 2단계: Redis 캐시 확인 (이전에 해석한 적이 있나?)
if (!pageId && useUriToPageIdCache) {
  pageId = await db.get(`uri-to-page-id:${domain}:${environment}:${rawPageId}`)
}

// 3단계: 사이트 맵에서 찾기
if (!pageId) {
  const siteMap = await getSiteMap()
  pageId = siteMap.canonicalPageMap[rawPageId]
}
```

**왜 이렇게 3단계로 나눴을까?**

- **1단계 (수동 오버라이드)**: 특정 페이지를 특정 URL에 고정하고 싶을 때. 예: `/about`은 항상 특정 Notion 페이지
- **2단계 (Redis 캐시)**: 성능 최적화. 사이트 맵 생성은 비용이 크니까 이미 해석한 건 캐시
- **3단계 (사이트 맵)**: 전체 Notion 워크스페이스를 크롤링해서 모든 페이지의 URL 매핑 생성

#### 🚨 여기서 배울 수 있는 엔지니어링 사고방식:

**계층적 폴백(Hierarchical Fallback) 패턴**: 빠르고 구체적인 것부터 시도하고, 안 되면 점점 더 비용이 큰 일반적인 방법으로 폴백합니다. 데이터베이스 쿼리에서도 자주 보이는 패턴이죠 (인덱스 → 테이블 스캔).

### 2. `lib/get-site-map.ts`: Notion 크롤러

이 파일은 전체 Notion 워크스페이스를 크롤링해서 두 가지 맵을 만듭니다:

```typescript
{
  pageMap: {
    '281b3053e30d4487976d26e534feba49': ExtendedRecordMap,  // 전체 페이지 데이터
    // ...
  },
  canonicalPageMap: {
    'my-first-post': '281b3053e30d4487976d26e534feba49',  // URL → 페이지 ID
    // ...
  }
}
```

#### 중요한 디테일:

```typescript
const getAllPages = pMemoize(getAllPagesImpl, {
  cacheKey: (...args) => JSON.stringify(args)
})
```

`p-memoize`를 사용해서 함수 결과를 메모이제이션합니다. 왜? `getSiteMap()`이 여러 곳에서 호출될 수 있는데, Notion 전체를 크롤링하는 건 비용이 크니까요.

#### 🎓 교훈: "Public" 속성 확인

```typescript
if (!(getPageProperty<boolean | null>('Public', block!, recordMap) ?? true)) {
  return map  // 이 페이지는 사이트 맵에 포함하지 않음
}
```

이게 왜 중요한가? Notion은 워크스페이스가 공개되어도 특정 페이지를 비공개로 설정할 수 있습니다. 이 코드는 "Public" 속성이 false인 페이지는 건너뜁니다.

**실전 팁**: CMS로 Notion을 사용할 때, 페이지 속성으로 "메타데이터"를 관리하는 게 일반적입니다. "Public", "Published Date", "Tags" 같은 속성들이요.

### 3. `lib/map-page-url.ts`: 개발/프로덕션 URL 전략

```typescript
// include UUIDs in page URLs during local development but not in production
const uuid = !!includeNotionIdInUrls
```

이 한 줄이 중요합니다:

- **개발 환경**: `/my-post-281b3053e30d4487976d26e534feba49`
- **프로덕션**: `/my-post`

#### 왜 개발 환경에서 UUID를 포함할까?

디버깅을 위해서입니다! 로컬에서 개발할 때 "이 페이지가 어떤 Notion 페이지인지" 즉시 알 수 있으면 엄청 편합니다. 브라우저에서 URL만 봐도 Notion에서 바로 찾을 수 있죠.

하지만 프로덕션에서는 깔끔한 URL이 SEO와 사용자 경험에 더 좋습니다.

#### 🧠 엔지니어링 사고: 환경별 설정

```typescript
export const includeNotionIdInUrls: boolean = getSiteConfig(
  'includeNotionIdInUrls',
  !!isDev  // 기본값: 개발 환경이면 true
)
```

"설정 가능하되, 합리적인 기본값을 제공하라." 좋은 라이브러리/프레임워크의 공통점입니다. 사용자가 오버라이드할 수 있지만, 대부분의 경우 기본값이 올바릅니다.

## 🛠️ 기술 스택 선택의 이유

### Next.js 15 - 왜 Next.js인가?

1. **SSG/SSR 하이브리드**: 정적 생성이 필요한 블로그에 완벽
2. **파일 기반 라우팅**: `pages/[pageId].tsx` 하나로 모든 동적 페이지 처리
3. **API Routes**: `/api/social-image`같은 서버리스 함수를 쉽게 만들 수 있음
4. **이미지 최적화**: `next/image`로 자동 WebP/AVIF 변환
5. **Vercel 통합**: 배포가 `git push`만큼 쉬움

### react-notion-x - Notion 렌더러의 선택

Notion의 모든 블록 타입(텍스트, 이미지, 코드, 데이터베이스, 임베드 등)을 React 컴포넌트로 변환하는 라이브러리입니다.

#### 왜 직접 만들지 않았나?

Notion의 블록 타입은 100개가 넘습니다. 각 블록은 다른 구조와 렌더링 로직을 가집니다. 이걸 직접 구현하면 몇 달이 걸리죠. `react-notion-x`는 이미 성숙한 오픈소스 솔루션입니다.

#### 커스터마이징 전략:

```css
/* styles/notion.css */
.notion-block-260baa77f1e1428b97fb14ac99c7c385 {
  display: none;  /* 특정 블록 숨기기 */
}
```

라이브러리는 쓰되, 스타일링으로 커스터마이징합니다. 각 Notion 블록은 고유한 ID를 가진 CSS 클래스를 갖기 때문에 세밀한 제어가 가능합니다.

### TypeScript - 타입 안정성

이 프로젝트는 Notion API의 복잡한 데이터 구조를 다룹니다. `ExtendedRecordMap`, `Block`, `Collection` 등 수많은 타입이 있죠.

```typescript
import { type ExtendedRecordMap } from 'notion-types'

export async function resolveNotionPage(
  domain: string,
  rawPageId?: string
): Promise<PageProps> {
  let recordMap: ExtendedRecordMap
  // ...
}
```

TypeScript 없이 이걸 다루면? 런타임 에러 지옥이 기다립니다. "이 객체에 이 속성이 있나?", "이게 배열인가 객체인가?" 같은 질문을 계속하게 되죠.

## 🐛 흔히 겪는 문제들과 해결책

### 문제 1: 중복된 URL 슬러그

```typescript
if (map[canonicalPageId]) {
  console.warn('error duplicate canonical page id', {
    canonicalPageId,
    pageId,
    existingPageId: map[canonicalPageId]
  })
  return map
}
```

**상황**: 두 개의 Notion 페이지가 같은 제목을 가질 수 있습니다. 예를 들어 "Introduction"이라는 페이지가 여러 개 있을 수 있죠.

**문제**: URL은 고유해야 하는데, 두 페이지가 모두 `/introduction`을 원합니다.

**해결책**:
1. 첫 번째 페이지가 URL을 차지함
2. 경고를 출력해서 개발자에게 알림
3. Notion에서 "Slug" 속성을 추가해서 수동으로 URL 지정 가능

**교훈**: 완벽한 자동화는 불가능합니다. 사용자가 수동으로 오버라이드할 수 있는 "탈출구(escape hatch)"를 항상 제공하세요.

### 문제 2: Notion API Rate Limiting

Notion의 비공식 API는 호출 제한이 있습니다. 페이지가 많으면 빌드 시간에 모든 페이지를 가져오다가 제한에 걸릴 수 있습니다.

**해결책들**:

1. **메모이제이션**: 같은 데이터를 여러 번 요청하지 않음
```typescript
const getAllPages = pMemoize(getAllPagesImpl, {
  cacheKey: (...args) => JSON.stringify(args)
})
```

2. **타임아웃 설정**:
```typescript
return notion.getPage(pageId, {
  kyOptions: {
    timeout: 30_000  // 30초
  }
})
```

3. **Redis 캐싱**: 한 번 가져온 데이터는 캐시에 저장

4. **빌드 타임아웃 연장**:
```javascript
// next.config.js
export default {
  staticPageGenerationTimeout: 300  // 5분
}
```

### 문제 3: 이미지 로딩 성능

Notion 이미지는 Notion의 CDN에서 제공됩니다. 직접 사용하면 느릴 수 있죠.

**해결책**: LQIP (Low Quality Image Placeholder)

```typescript
// lib/preview-images.ts
import { lqip } from 'lqip-modern'
```

작동 방식:
1. 빌드 타임에 모든 이미지의 저해상도 버전 생성 (몇 KB)
2. 페이지 로드 시 저해상도 이미지 먼저 표시 (즉시)
3. 고해상도 이미지를 백그라운드에서 로드
4. 로드 완료되면 부드럽게 전환

사용자는 "빈 공간 → 갑자기 이미지" 대신 "흐릿한 이미지 → 선명한 이미지"를 봅니다. 체감 성능이 훨씬 좋죠.

**트레이드오프**: 빌드 시간이 늘어남. 그래서 `isPreviewImageSupportEnabled` 옵션으로 끌 수 있습니다.

## 🎨 실전 사용 패턴

### 패턴 1: 커스텀 네비게이션

```typescript
// site.config.ts
navigationStyle: 'custom',
navigationLinks: [
  { title: 'About', pageId: '103e4b9f997780309624e6defe179766' },
  { title: 'Blog', pageId: '281b3053e30d4487976d26e534feba49' }
]
```

**왜 이게 필요한가?**

기본 Notion 네비게이션은 Notion의 페이지 구조를 따릅니다. 하지만 웹사이트에서는 다른 네비게이션 구조를 원할 수 있죠. "About", "Blog", "Projects" 같은 명확한 메뉴가 필요합니다.

### 패턴 2: 특정 블록 숨기기

```css
/* styles/notion.css */
.notion-block-260baa77f1e1428b97fb14ac99c7c385 {
  display: none;
}
```

**실전 사용례**:
- Notion에는 보이지만 웹사이트에서는 숨기고 싶은 "작성 노트"
- "TODO" 섹션
- 내부 메모

Notion에서 페이지를 보면서 개발자 도구를 열어서 해당 블록의 ID를 찾고, CSS로 숨깁니다.

### 패턴 3: 페이지별 스타일링

```typescript
// lib/acl.ts에서 페이지별 접근 제어
export async function pageAcl(props: PageProps): Promise<PageProps> {
  // 특정 페이지에 대한 커스텀 로직
  return props
}
```

예를 들어, "포트폴리오" 페이지는 다른 레이아웃을 원할 수 있습니다. `acl.ts`에서 페이지 ID에 따라 다른 props를 반환하면 됩니다.

## 🚀 배포와 성능

### Vercel 배포의 마법

이 프로젝트는 Vercel에 최적화되어 있습니다:

1. **Git 푸시 = 자동 배포**: `main` 브랜치에 푸시하면 자동으로 배포
2. **Edge CDN**: 전 세계 어디서나 빠른 로딩
3. **자동 HTTPS**: SSL 인증서 자동 관리
4. **프리뷰 배포**: PR마다 프리뷰 URL 생성

### 중요한 Vercel 설정

```
Project Settings → Deployment Protection → Vercel Authentication: OFF
```

**왜?**

소셜 이미지(`/api/social-image`)는 Facebook, Twitter 같은 크롤러가 접근합니다. Vercel Authentication이 켜져 있으면 401 에러가 나고, 소셜 미리보기가 작동하지 않습니다.

### 성능 최적화 체크리스트

1. ✅ **정적 생성**: 런타임이 아닌 빌드 타임에 HTML 생성
2. ✅ **이미지 최적화**: next/image + WebP/AVIF
3. ✅ **LQIP**: 부드러운 이미지 로딩
4. ✅ **Redis 캐싱**: 반복적인 데이터 요청 최소화
5. ✅ **메모이제이션**: 중복 계산 방지

## 🧪 테스트와 코드 품질

```json
{
  "scripts": {
    "test": "run-p test:*",
    "test:lint": "eslint .",
    "test:prettier": "prettier '**/*.{js,jsx,ts,tsx}' --check"
  }
}
```

이 프로젝트는 유닛 테스트가 없습니다. 왜?

**실용주의적 결정**: 이 프로젝트는 주로 "glue code" (여러 라이브러리를 연결하는 코드)입니다. 비즈니스 로직보다는 설정과 통합이 주를 이루죠.

대신:
- **ESLint**: 코드 스타일과 잠재적 버그 체크
- **Prettier**: 일관된 포맷팅
- **TypeScript**: 컴파일 타임 타입 체크

**교훈**: 모든 프로젝트가 100% 테스트 커버리지를 필요로 하지 않습니다. 프로젝트의 특성에 맞는 품질 보증 전략을 선택하세요.

## 💡 배운 점과 베스트 프랙티스

### 1. "설정보다 관습(Convention over Configuration)"

```typescript
// site.config.ts - 단일 설정 파일
export default siteConfig({
  rootNotionPageId: '281b3053e30d4487976d26e534feba49',
  name: 'PureDev Blog',
  domain: 'blog.puredev.xyz',
  // ...
})
```

모든 설정이 한 파일에 있습니다. 사용자는 여러 파일을 수정할 필요가 없죠. 좋은 개발자 경험(DX)의 예입니다.

### 2. "점진적 개선(Progressive Enhancement)"

기본 기능은 항상 작동하고, 추가 기능은 선택적입니다:

- Redis 없이도 작동 (느리지만 작동)
- Preview images 없이도 작동 (덜 부드럽지만 작동)
- Analytics 없이도 작동

### 3. "폴백과 우아한 저하(Graceful Degradation)"

```typescript
try {
  pageId = await db.get(cacheKey)
} catch (err: any) {
  // Redis 에러를 무시하고 계속 진행
  console.warn(`redis error get "${cacheKey}"`, err.message)
}
```

Redis가 다운되어도 사이트는 작동합니다. 느리지만 작동하죠. 이게 프로덕션 시스템의 특징입니다.

### 4. "개발자 경험도 사용자 경험이다"

- 명확한 에러 메시지
- 상세한 로그 (개발 환경에서)
- 합리적인 기본값
- 한 곳에서 모든 것을 설정

이런 것들이 이 프로젝트를 "스타터 킷"으로 성공하게 만들었습니다.

## 🎓 당신이 이 프로젝트에서 배울 수 있는 것

### 백엔드 개발자로서:

1. **API 통합**: 외부 API (Notion)를 효율적으로 사용하는 방법
2. **캐싱 전략**: 메모리, Redis, 파일 시스템 - 각각 언제 쓸까?
3. **Rate Limiting 대응**: API 호출 제한을 다루는 실전 전략

### 풀스택 개발자로서:

1. **Next.js SSG**: 정적 생성의 파워
2. **TypeScript**: 복잡한 데이터 구조를 타입으로 관리
3. **성능 최적화**: 이미지, 번들, 캐싱의 조화

### 아키텍트로서:

1. **계층적 폴백**: 최적화된 경로 → 일반적 경로
2. **관심사 분리**: lib/ (로직), pages/ (라우팅), components/ (UI)
3. **설정 관리**: 환경별 설정, 기본값, 오버라이드

## 🔮 개선 아이디어 (당신이 시도해볼 수 있는 것들)

### 1. 증분 정적 재생성 (ISR)

현재는 전체 재배포가 필요합니다. Next.js의 ISR을 사용하면 특정 페이지만 재생성할 수 있습니다:

```typescript
export async function getStaticProps({ params }) {
  return {
    props: { ... },
    revalidate: 60  // 60초마다 재검증
  }
}
```

### 2. Notion Webhook 통합

Notion에서 페이지가 업데이트되면 자동으로 재배포:

```typescript
// pages/api/notion-webhook.ts
export default async function handler(req, res) {
  // Notion webhook 받기
  // Vercel 배포 트리거
}
```

### 3. 검색 성능 개선

현재는 클라이언트 측 검색입니다. 페이지가 많아지면 느려집니다. Algolia나 MeiliSearch 같은 전문 검색 엔진을 통합할 수 있습니다.

### 4. 댓글 시스템 확장

현재 Giscus를 사용하지만, Notion 데이터베이스를 댓글 스토리지로 사용하는 것도 재미있을 것 같습니다.

## 마무리

이 프로젝트는 작지만 실전적인 아키텍처 결정들이 가득합니다. "완벽한" 코드보다는 "작동하는" 코드에 집중했고, 사용자가 쉽게 시작할 수 있도록 설계되었습니다.

좋은 엔지니어링은 복잡한 코드를 작성하는 게 아니라, 복잡한 문제를 단순하게 해결하는 것입니다. 이 프로젝트가 그 좋은 예시가 되길 바랍니다.

Happy coding! 🚀

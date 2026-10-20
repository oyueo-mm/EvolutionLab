# 🧬 Artificial Life Lab (EvolutionLab)

<p align="center">
  <a href="https://oyueo-mm.github.io/EvolutionLab/"><img alt="Live Demo" src="https://img.shields.io/badge/▶_Live_Demo-oyueo--mm.github.io%2FEvolutionLab-2f9e44?style=for-the-badge" height="40"></a>
</p>

<p align="center">
  <a href="https://github.com/oyueo-mm/EvolutionLab/actions/workflows/deploy.yml"><img alt="Test and deploy" src="https://github.com/oyueo-mm/EvolutionLab/actions/workflows/deploy.yml/badge.svg"></a>
</p>

> **👉 [https://oyueo-mm.github.io/EvolutionLab/](https://oyueo-mm.github.io/EvolutionLab/)** : 설치 없이 브라우저에서 바로 실행됩니다. 시작 버튼을 누르고 배속을 10×로 올려 보세요.

EvolutionLab은 브라우저에서 돌아가는 인공생명·진화 시뮬레이터입니다. 피식자(검정)는 먹이(초록)를 먹고, 포식자(빨강)는 피식자를 사냥합니다. 개체는 번식할 때 유전자를 물려주며 돌연변이를 겪습니다. **어떤 방향으로 진화할지는 코드에 정해져 있지 않습니다.** 몸의 모양, 이동, 에너지 비용, 번식 조건이 생존과 번식 확률을 바꾸고, 그 결과로 유전자 분포가 변합니다.

2019년에 공개된 자연선택 시뮬레이터에서 영감을 받아 새로 구현했습니다. 원본 코드를 복제한 것이 아니라 핵심 규칙과 실험 아이디어만 참고했습니다.

## 주요 기능

- **세 가지 원본 재현 실험과 확장 실험**: A(기초 자연선택, 안전구역 포함), B(먹이 기반 번식), C(포식자-피식자 공진화), V(시야 기반 행동)
- **실시간 설정 변경**: 먹이 공급, 번식 조건, 돌연변이 확률과 강도, 에너지 비용, 안전구역 출입 규칙을 실행 중에 바꿉니다.
- **실시간 통계**: 개체 수, 평균 크기·속도·활동성·시야, 출생과 사망 비율, 평균 세대, 유전적 다양성을 시뮬레이션 데이터에서 계산해 그래프로 보여 줍니다. CSV로 내보낼 수 있습니다.
- **개체 관찰**: 클릭하면 유전자, 에너지, 나이, 부모, 세대, 자손 수를 볼 수 있고 카메라가 따라갑니다.
- **재현 가능한 실험**: 난수 시드를 지정하면 같은 설정에서 같은 결과가 나옵니다. 설정은 JSON으로 저장하고 불러올 수 있습니다.
- **고성능**: Web Worker에서 고정 시간 간격으로 계산하고, 공간 해시와 TypedArray를 씁니다. 개체 2만 마리에서도 렌더링 60 FPS를 유지했습니다([측정 기록](docs/BENCHMARK.md)).
- **배속**: 1× · 2× · 5× · 10× · MAX. 배속을 바꿔도 결과는 같습니다.

## 시뮬레이션 원리

| 요소 | 규칙 |
|---|---|
| **유전자** | 길이, 폭, 속도, 활동성, 시야. 유전자 값이 곧 표현형입니다. |
| **번식** | 주기, 먹은 수, 에너지 기준 중에서 고릅니다. 무성생식이며 부모 유전자를 복사한 뒤 돌연변이를 적용합니다. |
| **돌연변이** | 유전자마다 확률적으로, 평균 0인 정규분포를 더하고 허용 범위로 자릅니다. 방향성이 없습니다. |
| **에너지** | 기초 + 크기 + 속도²(이동 중) + 활동성 + 시야. 각 항은 독립 파라미터입니다. |
| **사냥** | 회전하는 직사각형 몸끼리 충돌을 판정합니다. 그래서 몸이 길쭉하거나 납작한 것이 실제로 유불리를 만듭니다. |
| **안전구역** | 출입이 금지된 종은 밀려납니다. 포식자가 들어갈 수 없는 구역의 피식자는 잡히지 않습니다. |

자연선택과 유전적 부동을 구분하는 방법, 시드를 여러 개 돌려 확인한 결과는 [docs/RULES.md](docs/RULES.md)에 정리했습니다. 예를 들어 프리셋 A에서는 8개 시드 모두에서 피식자 속도가 크게 줄었고, 돌연변이를 끈 대조군에서는 형질이 전혀 변하지 않았습니다.

## 기술 스택

React 19 · TypeScript · Vite · Tailwind CSS 4 · HTML Canvas 2D · Web Worker · Recharts · Vitest

WebGL과 WASM은 아직 쓰지 않았습니다. 측정 결과 Canvas 2D로 2만 마리까지 60 FPS가 나와서, 병목이 확인된 뒤에 도입하기로 했습니다([설계 결정 D10](docs/ARCHITECTURE.md)).

## 실행 방법

Node.js 20 이상이 필요합니다(개발은 Node 24에서 했습니다).

```bash
npm install
npm run dev        # http://localhost:5173/EvolutionLab/
npm test           # 단위·통합 테스트 (Vitest)
npm run build      # 타입 검사 + 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 확인 (http://localhost:4173/EvolutionLab/)
npm run bench      # 엔진 성능 측정 (헤드리스)

npx tsx scripts/replicate.ts A 1500 8   # 프리셋 A를 시드 8개로 반복 실험
npx tsx scripts/tune.ts C 1200          # 프리셋 C 진행 상황을 60초 간격으로 출력
```

> 앱은 GitHub Pages의 하위 경로(`/EvolutionLab/`)에서 서비스되므로 개발 서버도 같은 경로를 씁니다.

### 사용법

- **Space**: 시작/일시정지
- **휠**: 확대·축소, **드래그**: 화면 이동, **클릭**: 개체 선택
- 설정 항목 옆의 `재시작` 표시는 초기화한 뒤에 적용된다는 뜻입니다.

## 배포

`main` 브랜치에 push하면 GitHub Actions([deploy.yml](.github/workflows/deploy.yml))가 타입 검사, 테스트, 빌드를 거친 뒤 GitHub Pages에 배포합니다. 풀 리퀘스트에서는 빌드와 테스트만 실행합니다.

저장소를 포크해서 쓰려면 *Settings → Pages → Build and deployment → Source*를 **GitHub Actions**로 선택하고, `vite.config.ts`의 `base`를 저장소 이름에 맞게 바꾸세요.

## 프로젝트 구조

```
.github/workflows/  GitHub Pages 배포 워크플로
src/sim/            엔진 (순수 TS, DOM 없음): types, rng, genome, spatialGrid, geometry, engine, presets
src/worker/         Web Worker 루프와 메시지 프로토콜
src/client/         Worker 핸들과 통계 이력
src/render/         Canvas 2D 렌더러와 카메라
src/ui/             React 컴포넌트와 차트 데이터 변환
scripts/            bench, tune, replicate (헤드리스 실행)
docs/               RULES(규칙과 해석), ARCHITECTURE(설계 결정), BENCHMARK(성능)
```

## 문서

- [docs/RULES.md](docs/RULES.md): 시뮬레이션 규칙 전체, 원본과의 대조(확인한 것 / 추측한 것), 실험 해석 가이드
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 구조와 설계 결정, 확장 지점
- [docs/BENCHMARK.md](docs/BENCHMARK.md): 성능 측정 결과와 병목 분석

## 원본 참고자료 및 출처

이 프로젝트는 아래 자료에서 영감을 받은 독립 구현이며, 원작자와 관련이 없습니다.

- [디시인사이드 HIT 갤러리 게시글 (no. 15053)](https://gall.dcinside.com/board/view/?id=hit&no=15053): 원본 시뮬레이터의 규칙과 관찰 결과. 본문을 직접 읽고 규칙을 분석했습니다.
- [YouTube: 5GiI8rbu2XQ](https://www.youtube.com/watch?v=5GiI8rbu2XQ), [YouTube: YX34D8uXoVQ](https://www.youtube.com/watch?v=YX34D8uXoVQ): 함께 제공된 참고 영상. 이 영상들의 내용은 규칙 분석에 사용하지 않았습니다.

원본에 공개되지 않은 수치와 세부 규칙(세계 크기, 이동 알고리즘, 충돌 판정, 에너지량 등)은 직접 정했고, 어느 부분이 확인된 규칙이고 어느 부분이 추측인지 [docs/RULES.md](docs/RULES.md)에 표로 구분해 두었습니다.

## 향후 개발 계획

- 시야 감지 비용 줄이기 (현재 엔진에서 가장 큰 병목)
- 여러 안전구역과 장애물을 편집하는 UI (엔진은 이미 구역 배열을 지원)
- 계통수 시각화와 유전적 다양성 분석 강화
- 브라우저 안에서 여러 시드를 반복 실험하고 결과를 비교
- 유성생식과 유전자 재조합, 신경망 기반 행동, 날씨와 계절, 질병

## 라이선스

아직 라이선스를 지정하지 않았습니다. 공개 저장소이지만 라이선스 파일이 없으면 기본적으로 모든 권리가 저작자에게 있습니다.

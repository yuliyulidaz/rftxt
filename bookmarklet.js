/**
 * rofan.ai 대화 추출 북마클릿 v4
 * 대화 페이지에서 실행하면 전체 대화를 txt 파일로 다운로드합니다.
 *
 * 로드 방식: 초기 스크롤 → ∧ 버튼 반복 클릭으로 이전 대화 로드
 */
(async function () {
  // === 오버레이 UI ===
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);' +
    'color:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;' +
    'font-size:18px;font-family:sans-serif;flex-direction:column;gap:12px;';
  const statusText = document.createElement('div');
  statusText.textContent = '대화 로딩 중...';
  const progressText = document.createElement('div');
  progressText.style.fontSize = '14px';
  progressText.style.opacity = '0.7';
  overlay.appendChild(statusText);
  overlay.appendChild(progressText);
  document.body.appendChild(overlay);

  function updateStatus(msg, detail) {
    statusText.textContent = msg;
    if (detail !== undefined) progressText.textContent = detail;
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // === 스크롤 컨테이너 찾기 ===
  function findScrollContainer() {
    const candidates = document.querySelectorAll('div');
    for (const div of candidates) {
      const style = getComputedStyle(div);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        div.scrollHeight > div.clientHeight &&
        div.clientHeight > 200
      ) {
        if (div.querySelector('div.mt-5') || div.querySelector('p.mt-1')) {
          return div;
        }
      }
    }
    let best = null;
    let bestHeight = 0;
    for (const div of candidates) {
      const style = getComputedStyle(div);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        div.scrollHeight > div.clientHeight &&
        div.scrollHeight > bestHeight
      ) {
        best = div;
        bestHeight = div.scrollHeight;
      }
    }
    return best;
  }

  const container = findScrollContainer();
  if (!container) {
    updateStatus('스크롤 컨테이너를 찾을 수 없습니다.');
    setTimeout(() => overlay.remove(), 2000);
    return;
  }

  // === ∧ 버튼 찾기 함수 ===
  // SVG가 포함된 작은 클릭 가능 요소 중 수직으로 쌍을 이루는 것을 찾아 위쪽을 반환
  function findUpButton() {
    const svgs = document.querySelectorAll('svg');
    const candidates = [];
    for (const svg of svgs) {
      const parent = svg.closest('button, [role="button"], div[class*="cursor"], div[onclick], a');
      const el = parent || svg.parentElement;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // 작은 클릭 가능 요소 (아이콘 버튼 크기)
      if (rect.width > 10 && rect.width < 80 && rect.height > 10 && rect.height < 80 &&
          rect.top > 0 && rect.bottom < window.innerHeight) {
        candidates.push({ el: el, rect: rect });
      }
    }
    // 수직으로 가까이 있는 쌍 찾기 (∧∨ 버튼)
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i], b = candidates[j];
        const xDiff = Math.abs(a.rect.left - b.rect.left);
        const yDiff = Math.abs(a.rect.top - b.rect.top);
        // 수평 위치 비슷하고, 수직으로 가까이 쌍을 이루는 것
        if (xDiff < 20 && yDiff > 20 && yDiff < 120) {
          // 위에 있는 것이 ∧ 버튼
          return a.rect.top < b.rect.top ? a.el : b.el;
        }
      }
    }
    return null;
  }

  // === UI 버튼 숨기기 (북마크/댓글/편집/삭제 등 오클릭 방지) ===
  const uiToolbars = document.querySelectorAll('.justify-end.items-center');
  const hiddenEls = [];
  uiToolbars.forEach((el) => {
    if (el.style.userSelect === 'none' || el.querySelector('svg')) {
      hiddenEls.push({ el: el, display: el.style.display });
      el.style.display = 'none';
    }
  });

  // === Step 1: 초기 스크롤 (∧ 버튼 출현 유도) ===
  updateStatus('대화 로딩 준비 중...', '스크롤하여 로드 버튼 탐색');

  // 맨 위로 스크롤 시도
  for (let i = 0; i < 10; i++) {
    container.scrollTop = 0;
    container.scrollBy(0, -container.clientHeight);
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
    await delay(300);
    if (findUpButton()) break;
  }

  // === Step 2: ∧ 버튼 반복 클릭 (폴링 방식) ===
  let clickCount = 0;
  const maxClicks = 2000;
  let exitReason = '';

  // 클릭 후 로딩 완료 대기: 버튼 사라짐 확인 → 버튼 재출현 대기
  async function waitForLoadComplete() {
    // Phase 1: 버튼이 사라지는 것을 확인 (최대 3초)
    for (let i = 0; i < 6; i++) {
      await delay(500);
      if (!findUpButton()) break; // 사라짐 확인
    }
    // Phase 2: 버튼이 다시 나타나거나 25초 경과할 때까지 대기
    for (let i = 0; i < 25; i++) {
      await delay(1000);
      updateStatus('대화 로딩 중...', clickCount + '회 클릭 | 로딩 대기 ' + (i + 1) + '/25초 | 높이: ' + container.scrollHeight + 'px');
      if (findUpButton()) return true; // 버튼 돌아옴 = 로딩 완료
    }
    return false; // 25초 동안 버튼 안 돌아옴
  }

  while (clickCount < maxClicks) {
    // 버튼 찾기 (없으면 15초까지 폴링 대기)
    let upBtn = findUpButton();
    if (!upBtn) {
      // 로딩 중 버튼 사라진 상태 — 돌아올 때까지 대기
      for (let i = 0; i < 15; i++) {
        await delay(1000);
        updateStatus('대화 로딩 중...', '버튼 대기 ' + (i + 1) + '/15초 (클릭 ' + clickCount + '회)');
        upBtn = findUpButton();
        if (upBtn) break;
      }
      if (!upBtn) {
        // 스크롤로 버튼 재출현 유도
        container.scrollTop = 0;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
        await delay(2000);
        upBtn = findUpButton();
      }
      if (!upBtn) {
        for (let i = 0; i < 10; i++) {
          await delay(1000);
          updateStatus('스크롤이 최상단인지 확인 중...', (i + 1) + '/10초 | 클릭 ' + clickCount + '회');
          upBtn = findUpButton();
          if (upBtn) break;
        }
        if (!upBtn) {
          exitReason = '최상단 도달 (클릭 ' + clickCount + '회)';
          break;
        }
      }
    }

    // 클릭 & 로딩 완료 대기
    upBtn.click();
    clickCount++;
    const loaded = await waitForLoadComplete();

    if (!loaded) {
      let found = false;
      for (let i = 0; i < 10; i++) {
        await delay(1000);
        updateStatus('스크롤이 최상단인지 확인 중...', (i + 1) + '/10초 | 클릭 ' + clickCount + '회');
        if (findUpButton()) { found = true; break; }
      }
      if (!found) {
        exitReason = '최상단 도달 (클릭 ' + clickCount + '회)';
        break;
      }
    }
  }

  if (clickCount >= maxClicks) exitReason = '최대 클릭 ' + maxClicks + '회 도달';

  // === 숨긴 UI 버튼 복원 ===
  hiddenEls.forEach(({ el, display }) => { el.style.display = display; });

  updateStatus('텍스트 추출 중...');
  await delay(500);

  // === 텍스트 추출 헬퍼: <br> → 줄바꿈 변환 ===
  function extractText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => {
      br.replaceWith('\n');
    });
    return clone.textContent.trim();
  }

  // === UI 요소 필터링 ===
  function isUIElement(node) {
    let el = node;
    while (el && el !== container) {
      if (el.classList && el.classList.contains('justify-end') &&
          el.classList.contains('items-center')) return true;
      if (el.style && el.style.userSelect === 'none') return true;
      el = el.parentElement;
    }
    return false;
  }

  // === 메시지 블록 단위로 추출 ===
  // 1) font-size 스타일이 있는 div를 메시지 블록으로 인식
  // 2) 블록 안에 <p>가 있으면 <p> 단위로, 없으면 블록 전체 텍스트 추출
  const fontDivs = container.querySelectorAll('div[style*="font-size"]');
  const lines = [];

  fontDivs.forEach((block) => {
    if (isUIElement(block)) return;
    const paragraphs = block.querySelectorAll('p');
    if (paragraphs.length > 0) {
      // <p> 태그가 있는 일반 메시지
      const blockLines = [];
      paragraphs.forEach((p) => {
        if (isUIElement(p)) return;
        const text = extractText(p);
        if (text) blockLines.push(text);
      });
      if (blockLines.length > 0) {
        lines.push(blockLines.join('\n'));
      }
    } else {
      // <p> 없는 블록 (첫 캐릭터 메시지 등) — 블록 전체 텍스트 추출
      const text = extractText(block);
      if (text) lines.push(text);
    }
  });

  if (lines.length === 0) {
    updateStatus('추출할 대화를 찾을 수 없습니다.');
    setTimeout(() => overlay.remove(), 2000);
    return;
  }

  const fullText = lines.join('\n\n');

  // === 파일 다운로드 ===
  updateStatus('파일 생성 중...');
  const now = new Date();
  const dateStr =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const fileName = 'rofan_대화_' + dateStr + '.txt';

  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const blob = new Blob([bom, fullText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // === 완료 ===
  updateStatus('완료! ' + lines.length + '개 블록 추출됨', '종료: ' + exitReason + ' | ' + fileName);
  setTimeout(() => overlay.remove(), 3000);
})();

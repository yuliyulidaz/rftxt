/**
 * rofan.ai 대화 추출 북마클릿 v4-clean
 * 기본 버전 + 상황 요약 제거
 *
 * 변경점:
 * 1. 🗂️상황 요약 블록 제거
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
  function findUpButton() {
    const svgs = document.querySelectorAll('svg');
    const candidates = [];
    for (const svg of svgs) {
      const parent = svg.closest('button, [role="button"], div[class*="cursor"], div[onclick], a');
      const el = parent || svg.parentElement;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.width < 80 && rect.height > 10 && rect.height < 80 &&
          rect.top > 0 && rect.bottom < window.innerHeight) {
        candidates.push({ el: el, rect: rect });
      }
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i], b = candidates[j];
        const xDiff = Math.abs(a.rect.left - b.rect.left);
        const yDiff = Math.abs(a.rect.top - b.rect.top);
        if (xDiff < 20 && yDiff > 20 && yDiff < 120) {
          return a.rect.top < b.rect.top ? a.el : b.el;
        }
      }
    }
    return null;
  }

  // === Step 1: 초기 스크롤 (∧ 버튼 출현 유도) ===
  updateStatus('대화 로딩 준비 중...', '스크롤하여 로드 버튼 탐색');

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

  async function waitForLoadComplete() {
    for (let i = 0; i < 6; i++) {
      await delay(500);
      if (!findUpButton()) break;
    }
    for (let i = 0; i < 25; i++) {
      await delay(1000);
      updateStatus('대화 로딩 중...', clickCount + '회 클릭 | 로딩 대기 ' + (i + 1) + '/25초 | 높이: ' + container.scrollHeight + 'px');
      if (findUpButton()) return true;
    }
    return false;
  }

  while (clickCount < maxClicks) {
    let upBtn = findUpButton();
    if (!upBtn) {
      for (let i = 0; i < 15; i++) {
        await delay(1000);
        updateStatus('대화 로딩 중...', '버튼 대기 ' + (i + 1) + '/15초 (클릭 ' + clickCount + '회)');
        upBtn = findUpButton();
        if (upBtn) break;
      }
      if (!upBtn) {
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

  updateStatus('텍스트 추출 중...');
  await delay(500);

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

  // === 텍스트 추출 헬퍼: <br> → 줄바꿈 변환 ===
  function extractText(el) {
    const clone = el.cloneNode(true);
    // 🗂️상황 요약 블록 제거 (details/summary)
    clone.querySelectorAll('details').forEach((d) => d.remove());
    clone.querySelectorAll('br').forEach((br) => {
      br.replaceWith('\n');
    });
    return clone.textContent.trim();
  }

  // === [CLEAN] 🗂️상황 요약 텍스트 후처리 제거 ===
  function removeSummaryBlocks(text) {
    // 🗂️상황 요약부터 블록 끝까지 제거 (여러 줄)
    // 패턴: 🗂️상황 요약 ~ 다음 빈 줄 2개 또는 텍스트 끝
    let result = text.replace(/[\u25b6\u25bc]?\s*\ud83d\uddc2\ufe0f\s*\uc0c1\ud669 \uc694\uc57d[\s\S]*?(?=\n\n\n|\n\n[^\-\{\|\#\ud83d]|$)/g, '');
    // 📌미래 약속 블록도 제거
    result = result.replace(/\#{0,3}\s*\ud83d\udccc\s*\ubbf8\ub798 \uc57d\uc18d[\s\S]*?(?=\n\n\n|\n\n[^\-\{\|\#]|$)/g, '');
    // 남은 빈 줄 정리 (3개 이상 연속 → 2개로)
    result = result.replace(/\n{3,}/g, '\n\n');
    return result.trim();
  }

  // === 메시지 블록 단위로 추출 ===
  const fontDivs = container.querySelectorAll('div[style*="font-size"]');
  const lines = [];

  fontDivs.forEach((block) => {
    if (isUIElement(block)) return;
    const paragraphs = block.querySelectorAll('p');
    if (paragraphs.length > 0) {
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
      const text = extractText(block);
      if (text) lines.push(text);
    }
  });

  if (lines.length === 0) {
    updateStatus('추출할 대화를 찾을 수 없습니다.');
    setTimeout(() => overlay.remove(), 2000);
    return;
  }

  // 🗂️상황 요약 후처리 제거
  let fullText = lines.join('\n\n');
  fullText = removeSummaryBlocks(fullText);

  // === 파일 다운로드 ===
  updateStatus('파일 생성 중...');
  const now = new Date();
  const dateStr =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const fileName = 'rofan_대화_clean_' + dateStr + '.txt';

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

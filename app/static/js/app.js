// Frontend Application Logic for ChronoAFR (v5.0.1 Data Fetching, Three-Factor Synthesis Pipeline & Pro-Forma Engine)

document.addEventListener('DOMContentLoaded', () => {
  loadAvailableDocuments();
  if (document.getElementById('fc-ticker')) {
    loadTickerFinancialHistory();
  }
});

function switchTab(tabId) {
  const targetPanel = document.getElementById(tabId);
  if (!targetPanel) return;

  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

  targetPanel.classList.add('active');

  const targetBtn = document.querySelector(`.nav-tabs button[onclick*="${tabId}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
  }

  if (tabId === 'tab-rag') {
    loadAvailableDocuments();
  } else if (tabId === 'tab-forecast') {
    if (revenueSegments.length === 0) {
      loadTickerFinancialHistory();
    }
  } else if (tabId === 'tab-reports') {
    loadReports();
  }
}

// Global State for Dynamic Pro-Forma Workbench
let revenueSegments = [];
let cogsSegments = [];
let opexSegments = [];
let availableDocsList = [];
let currentCategoryFilter = 'ALL';

let latestAiQuery = "";
let latestAiAnswer = "";
let latestSelectedFiles = [];
let latestForecastPayload = null; // Holds the AI synthesized structured forecast payload

// Safe Number Formatter
function fmtNum(val, digits = 1) {
  if (typeof val !== 'number' || isNaN(val)) return '0.0';
  return val.toLocaleString('en-US', { maximumFractionDigits: digits });
}

// -----------------------------------------------------------------------------
// Tab 1: Data Fetching Engine
// -----------------------------------------------------------------------------

async function executeFetch() {
  const ticker = document.getElementById('fetch-ticker')?.value.trim().toUpperCase() || 'NVDA';
  const source = document.getElementById('fetch-source')?.value || 'all';
  const outBox = document.getElementById('fetch-output');

  if (outBox) {
    outBox.innerHTML = '<div style="font-size: 0.95rem; color: #82776E; padding: 12px;">⏳ 正在連線官方資料庫 (SEC/MOPS/FRED/GDrive) 擷取並解析最新財報...</div>';
  }

  try {
    const res = await fetch('/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        source,
        sync_notebooklm: true
      })
    });
    const data = await res.json();

    if (data.status === 'success') {
      let html = `<div style="line-height: 1.8; font-size: 0.92rem;">`;
      html += `<div style="font-weight: 700; color: #2E7D32; margin-bottom: 8px;">✅ 數據擷取與解析完成！</div>`;
      (data.results || []).forEach(r => {
        html += `<div>• ${r}</div>`;
      });
      html += `<div style="margin-top: 10px; font-size: 0.82rem; color: #82776E;">📂 檔案已同步至 NotebookLM 雲端資料夾：<code>${data.gdrive_path}</code></div>`;
      html += `</div>`;
      if (outBox) outBox.innerHTML = html;
      loadAvailableDocuments(); // Refresh document list in Tab 2!
    } else {
      if (outBox) outBox.innerHTML = `<div style="color: #EF4444; padding: 12px;">❌ 抓取失敗: ${data.message || '未知錯誤'}</div>`;
    }
  } catch (err) {
    if (outBox) outBox.innerHTML = `<div style="color: #EF4444; padding: 12px;">❌ 連線失敗: ${err.message}</div>`;
  }
}

// -----------------------------------------------------------------------------
// Tab 2: Document Selector & RAG Query
// -----------------------------------------------------------------------------

async function loadAvailableDocuments() {
  const container = document.getElementById('doc-selector-container');
  if (!container) return;

  container.innerHTML = '<div style="font-size: 0.85rem; color: #82776E;">⏳ 載入最新檔案清單中...</div>';

  try {
    const res = await fetch('/api/available_documents');
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    availableDocsList = data.documents || [];

    if (availableDocsList.length === 0) {
      container.innerHTML = '<div style="font-size: 0.85rem; color: #82776E;">尚未找到檔案，請在 Google Drive 上傳檔案或執行數據抓取。</div>';
      return;
    }

    let html = '';
    availableDocsList.forEach(doc => {
      let badgeColor = '#82776E';
      if (doc.file_type === 'PDF') badgeColor = '#D96B82';
      else if (doc.file_type === 'XLSX' || doc.file_type === 'CSV') badgeColor = '#34D399';
      else if (doc.file_type === 'DOCX') badgeColor = '#818CF8';

      html += `
        <label class="doc-item" data-type="${doc.file_type}" style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem; padding: 5px 0; cursor: pointer; border-bottom: 1px dashed rgba(0,0,0,0.05);">
          <input type="checkbox" class="doc-chk" value="${doc.filename}" onchange="updateSelectedCountBadge()" ${doc.filename.includes('AMZN') || doc.filename.includes('Amazon') ? 'checked' : ''}>
          <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.05); color: ${badgeColor};">${doc.file_type}</span>
          <span style="word-break: break-all;">${doc.display_label}</span>
          <span style="font-size: 0.75rem; color: #82776E; margin-left: auto;">(${doc.size_kb} KB)</span>
        </label>
      `;
    });

    container.innerHTML = html;
    updateSelectedCountBadge();
    filterDocList();
  } catch (err) {
    console.error("loadAvailableDocuments error:", err);
    container.innerHTML = `<div style="font-size: 0.85rem; color: #D96B82;">⚠️ 載入檔案清單失敗: ${err.message} <button type="button" onclick="loadAvailableDocuments()" style="margin-left: 8px;">重試</button></div>`;
  }
}

function setDocCategoryFilter(cat, btn) {
  currentCategoryFilter = cat;
  document.querySelectorAll('.badge-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filterDocList();
}

function filterDocList() {
  const searchInput = document.getElementById('doc-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const items = document.querySelectorAll('.doc-item');

  items.forEach(item => {
    const text = item.innerText.toLowerCase();
    const type = item.getAttribute('data-type') || 'MD';

    const matchesSearch = !query || text.includes(query);
    let matchesCategory = true;

    if (currentCategoryFilter === 'PDF') {
      matchesCategory = (type === 'PDF');
    } else if (currentCategoryFilter === 'EXCEL') {
      matchesCategory = (type === 'XLSX' || type === 'CSV');
    } else if (currentCategoryFilter === 'DOCX') {
      matchesCategory = (type === 'DOCX' || type === 'MD' || type === 'GDRIVE');
    }

    if (matchesSearch && matchesCategory) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function updateSelectedCountBadge() {
  const checkboxes = document.querySelectorAll('.doc-chk:checked');
  const badge = document.getElementById('selected-count-badge');
  if (badge) {
    badge.innerText = `已選擇 ${checkboxes.length} 個檔案`;
  }
}

function selectAllDocs(selectAll) {
  document.querySelectorAll('.doc-chk').forEach(chk => {
    const parent = chk.closest('.doc-item');
    if (!parent || parent.style.display !== 'none') {
      chk.checked = selectAll;
    }
  });
  updateSelectedCountBadge();
}

function selectGDriveDocsOnly() {
  document.querySelectorAll('.doc-chk').forEach(chk => {
    const parent = chk.closest('.doc-item');
    if (!parent || parent.style.display !== 'none') {
      chk.checked = chk.value.startsWith('GDrive_');
    }
  });
  updateSelectedCountBadge();
}

// -----------------------------------------------------------------------------
// Tab 2: Core Three-Factor Forecast Research & Pipeline Bridging Engine (v5.0.0)
// -----------------------------------------------------------------------------

async function runAiThreeFactorResearch() {
  const selectedDocs = Array.from(document.querySelectorAll('.doc-chk:checked')).map(cb => cb.value);
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';

  const outBox = document.getElementById('rag-output');
  const toolbar = document.getElementById('ai-answer-toolbar');
  const applyBtn = document.getElementById('btn-apply-forecast-to-tab3');

  if (toolbar) toolbar.style.display = 'none';
  if (applyBtn) applyBtn.style.display = 'none';

  if (!selectedDocs || selectedDocs.length === 0) {
    if (outBox) {
      outBox.innerHTML = `
        <div style="background: #FFF0F3; border: 1.5px solid #EF4444; border-radius: 8px; padding: 16px; color: #EF4444;">
          <h4 style="margin: 0 0 8px 0; font-size: 1.05rem;">⚠️ 資料不足警示 (Insufficient Data)</h4>
          <p style="margin: 0; font-size: 0.9rem; color: #4A4036;">
            您尚未在上方勾選任何參考文件！請至少勾選 1 份目標公司之 <strong>10-K/10-Q 財報、年報 PDF 或月營收研報</strong>，AI 才能進行前瞻三大因子深度研讀與成長率推算。
          </p>
        </div>
      `;
    }
    return;
  }

  if (outBox) {
    outBox.innerHTML = `
      <div style="font-size: 0.95rem; color: #82776E; padding: 16px;">
        🤖 <strong>Gemini AI 正在深入研讀被選取的 ${selectedDocs.length} 份文件...</strong><br><br>
        • 正在進行【資料充分性檢核】...<br>
        • 正在計算【(1) 未來營收與業務細項年增率】...<br>
        • 正在推估【(2) 未來營業成本結構與毛利率變化】...<br>
        • 正在分析【(3) 未來營業費用 (研發/行銷/管理) 支出率】...
      </div>
    `;
  }

  try {
    const res = await fetch('/api/ai_synthesize_forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        selected_files: selectedDocs
      })
    });
    const data = await res.json();

    if (data.status === 'insufficient_data') {
      if (outBox) {
        outBox.innerHTML = `
          <div style="background: #FFF0F3; border: 1.5px solid #EF4444; border-radius: 8px; padding: 16px;">
            <h4 style="margin: 0 0 8px 0; font-size: 1.05rem; color: #EF4444;">⚠️ 資料不足警示 (Insufficient Data)</h4>
            <p style="margin: 0 0 10px 0; font-size: 0.9rem; color: #4A4036;">
              ${data.message || data.insufficiency_reason || '目前勾選的資料缺乏足夠之財務細拆數據，無法做出可靠的前瞻預測推論。'}
            </p>
            <div style="font-size: 0.85rem; color: #82776E;">
              建議勾選包含營收細拆、營業費用與損益表明細的完整 10-K 年報或官方季報後再次執行。
            </div>
          </div>
        `;
      }
      return;
    }

    // Data is sufficient!
    latestForecastPayload = data.structured_forecast;
    latestAiQuery = "【前瞻三大因子深度研讀】1.未來營收 2.營業成本 3.營業費用";
    latestAiAnswer = data.research_brief || "";
    latestSelectedFiles = selectedDocs;

    let html = `
      <div style="background: #FDFBF9; border: 1px solid var(--card-border); border-radius: 8px; padding: 18px; line-height: 1.6; font-size: 0.92rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1.5px solid var(--card-border); padding-bottom: 10px;">
          <span style="font-size: 1rem; font-weight: 700; color: #D96B82;">📊 ${data.ticker || ticker} 前瞻三大因子深度研讀報告</span>
          <span style="font-size: 0.8rem; background: #E8F5E9; color: #2E7D32; font-weight: 700; padding: 3px 8px; border-radius: 4px;">✅ 資料充足 (Data Sufficient)</span>
        </div>
        <div style="white-space: pre-wrap; font-family: inherit; color: var(--text-main); margin-bottom: 18px;">
${latestAiAnswer}
        </div>
        <div style="background: #FFF5F7; border: 1.5px solid var(--primary-pink); border-radius: 8px; padding: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-weight: 700; color: #D96B82; font-size: 0.95rem;">💡 審閱確認：若您認可 AI 的前瞻推論與年增率</div>
            <div style="font-size: 0.83rem; color: #82776E;">點擊右側按鈕將自動注入「前瞻財務預測」工作台並生成 3 年 Pro-Forma 損益表與 EPS！</div>
          </div>
          <button type="button" class="btn-primary" style="width: auto; padding: 10px 20px; font-weight: 700; font-size: 0.92rem; background: linear-gradient(135deg, #FFB7C5 0%, #D96B82 100%);" onclick="applyAiForecastToTab3()">
            🚀 採納此推論並一鍵套用至前瞻預測 (Auto-Fill & Run Pro-Forma)
          </button>
        </div>
      </div>
    `;

    if (outBox) outBox.innerHTML = html;
    if (toolbar) toolbar.style.display = 'flex';
    if (applyBtn) applyBtn.style.display = 'inline-block';
  } catch (err) {
    if (outBox) outBox.innerHTML = `<div style="color: #EF4444; padding: 12px;">❌ 研讀分析失敗: ${err.message}</div>`;
  }
}

function applyAiForecastToTab3() {
  if (!latestForecastPayload) {
    alert("尚未有可套用的 AI 前瞻預測數據，請先點擊「執行前瞻三大因子深度研讀」！");
    return;
  }

  const data = latestForecastPayload;

  // 1. Fill Header Controls
  if (data.ticker && document.getElementById('fc-ticker')) {
    document.getElementById('fc-ticker').value = data.ticker;
  }
  if (data.base_revenue && document.getElementById('fc-base-rev')) {
    document.getElementById('fc-base-rev').value = data.base_revenue;
  }
  if (data.current_price && document.getElementById('fc-current-price')) {
    document.getElementById('fc-current-price').value = data.current_price;
  }
  if (data.shares_outstanding && document.getElementById('fc-shares-outstanding')) {
    document.getElementById('fc-shares-outstanding').value = data.shares_outstanding;
  }
  if (data.historical_pe_avg && document.getElementById('fc-pe-avg')) {
    document.getElementById('fc-pe-avg').value = data.historical_pe_avg;
  }

  // 2. Inject Breakdowns
  if (data.revenue_segments && data.revenue_segments.length > 0) {
    revenueSegments = data.revenue_segments;
  }
  if (data.cogs_segments && data.cogs_segments.length > 0) {
    cogsSegments = data.cogs_segments;
  }
  if (data.opex_segments && data.opex_segments.length > 0) {
    opexSegments = data.opex_segments;
  }

  // 3. Switch to Tab 3
  switchTab('tab-forecast');

  // 4. Render and Recalculate
  renderRevenueSegmentRows();
  renderCogsSegmentRows();
  renderOpexSegmentRows();
  recalculateTotals();

  // 5. Automatically Run Pro-Forma & Valuation
  executeForecast();

  // 6. Show Notification Feedback
  const steerFeedback = document.getElementById('ai-steer-feedback');
  if (steerFeedback) {
    steerFeedback.style.display = 'block';
    steerFeedback.innerText = "✨ 成功從「AI 財報研讀中樞」代入三大因子推論，並自動生成 3 年 Pro-Forma 損益表與 EPS！";
  }
}

async function executeAsk() {
  const query = document.getElementById('rag-query')?.value.trim();
  const selectedDocs = Array.from(document.querySelectorAll('.doc-chk:checked')).map(cb => cb.value);

  if (!query) {
    alert("請輸入您的投資分析問題！");
    return;
  }

  const outBox = document.getElementById('rag-output');
  const toolbar = document.getElementById('ai-answer-toolbar');
  const applyBtn = document.getElementById('btn-apply-forecast-to-tab3');

  if (toolbar) toolbar.style.display = 'none';
  if (applyBtn) applyBtn.style.display = 'none';
  if (outBox) outBox.innerText = `💡 正在檢索已選取的 ${selectedDocs.length} 份文件並由 Gemini AI 進行分析...`;

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        selected_files: selectedDocs
      })
    });
    const data = await res.json();
    latestAiQuery = query;
    latestAiAnswer = data.answer || "無回答內容";
    latestSelectedFiles = selectedDocs;

    if (outBox) outBox.innerText = latestAiAnswer;
    if (toolbar) toolbar.style.display = 'flex';
  } catch (err) {
    if (outBox) outBox.innerText = "❌ 查詢失敗: " + err;
  }
}

function downloadAnswerMarkdown() {
  if (!latestAiAnswer) return;
  const filename = `ChronoAFR_AI_Analysis_${new Date().toISOString().slice(0, 10)}.md`;
  const content = `# [ChronoAFR AI 分析報告] ${latestAiQuery}\n\n- **產出時間**: ${new Date().toLocaleString()}\n- **參考文件**: ${latestSelectedFiles.join(', ') || '全庫檢索'}\n\n## 分析回答內容\n\n${latestAiAnswer}\n`;
  
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function copyAnswerMarkdown() {
  if (!latestAiAnswer) return;
  navigator.clipboard.writeText(latestAiAnswer).then(() => {
    alert("📋 分析回答內文已成功複製到剪貼簿！");
  }).catch(err => {
    alert("複製失敗: " + err);
  });
}

async function syncAnswerToNotebookLM() {
  if (!latestAiAnswer) return;
  try {
    const res = await fetch('/api/sync_answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: latestAiQuery,
        answer: latestAiAnswer,
        selected_files: latestSelectedFiles
      })
    });
    const data = await res.json();
    alert(`☁️ 成功同步至 NotebookLM 雲端資料夾：\n${data.filename}`);
  } catch (err) {
    alert("❌ 同步失敗: " + err);
  }
}

// -----------------------------------------------------------------------------
// Tab 3: Pro-Forma Workbench Functions
// -----------------------------------------------------------------------------

async function loadTickerFinancialHistory() {
  const tickerInput = document.getElementById('fc-ticker');
  if (!tickerInput) return;
  const ticker = tickerInput.value.trim().toUpperCase() || 'AMZN';

  try {
    const res = await fetch(`/api/financial_history/${ticker}`);
    const data = await res.json();

    document.getElementById('fc-base-rev').value = data.base_revenue;
    if (document.getElementById('fc-current-price')) document.getElementById('fc-current-price').value = data.current_price || 185.0;
    if (document.getElementById('fc-shares-outstanding')) document.getElementById('fc-shares-outstanding').value = data.shares_outstanding || 10400.0;
    if (document.getElementById('fc-pe-avg')) document.getElementById('fc-pe-avg').value = data.historical_pe_avg || 35.0;

    revenueSegments = data.revenue_segments || [];
    cogsSegments = data.cogs_segments || [];
    opexSegments = data.opex_segments || [];

    renderRevenueSegmentRows();
    renderCogsSegmentRows();
    renderOpexSegmentRows();
    recalculateTotals();
  } catch (err) {
    console.error("loadTickerFinancialHistory error:", err);
  }
}

async function getAiForecastRecommendation() {
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';
  const feedbackEl = document.getElementById('ai-steer-feedback');

  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerText = `🤖 Gemini AI 正在研讀 ${ticker} 最新官方財報並推薦前瞻模型參數...`;
  }

  try {
    const res = await fetch('/api/ai_forecast_recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const data = await res.json();

    if (data.base_revenue) document.getElementById('fc-base-rev').value = data.base_revenue;
    if (data.current_price && document.getElementById('fc-current-price')) document.getElementById('fc-current-price').value = data.current_price;
    if (data.shares_outstanding && document.getElementById('fc-shares-outstanding')) document.getElementById('fc-shares-outstanding').value = data.shares_outstanding;
    if (data.historical_pe_avg && document.getElementById('fc-pe-avg')) document.getElementById('fc-pe-avg').value = data.historical_pe_avg;

    if (data.revenue_segments && data.revenue_segments.length > 0) {
      revenueSegments = data.revenue_segments;
      renderRevenueSegmentRows();
    }
    if (data.cogs_segments && data.cogs_segments.length > 0) {
      cogsSegments = data.cogs_segments;
      renderCogsSegmentRows();
    }
    if (data.opex_segments && data.opex_segments.length > 0) {
      opexSegments = data.opex_segments;
      renderOpexSegmentRows();
    }

    recalculateTotals();

    if (feedbackEl) {
      feedbackEl.innerText = `✨ ${data.ai_explanation || `已為 ${ticker} 載入 AI 研讀推薦之業務線與成本費用細拆參數！`}`;
    }
  } catch (err) {
    if (feedbackEl) feedbackEl.innerText = "❌ 獲取 AI 推薦失敗: " + err;
  }
}

// Business Cycle Presets (景氣循環情境模式)
function applyCyclePreset(presetType, btn) {
  document.querySelectorAll('#btn-cycle-expansion, #btn-cycle-destocking, #btn-cycle-restructuring').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'var(--bg-secondary)';
    b.style.color = 'var(--text-main)';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.background = 'var(--card-bg)';
    btn.style.color = 'var(--text-main)';
  }

  const feedbackEl = document.getElementById('ai-steer-feedback');

  if (presetType === 'EXPANSION') {
    // Standard Healthy Growth
    revenueSegments.forEach((seg, idx) => {
      if (idx === 0) seg.growth_y1 = 0.24;
      else if (idx === 1) seg.growth_y1 = 0.12;
      else seg.growth_y1 = 0.10;
    });
    cogsSegments.forEach(cg => cg.growth_y1 = 0.10);
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.innerText = "📈 已切換為【穩健擴張模式】：各業務線維持常態正成長。";
    }
  } else if (presetType === 'DESTOCKING') {
    // Downside Destocking / Recession Cycle (Negative Growth)
    revenueSegments.forEach((seg, idx) => {
      if (idx === 0) seg.growth_y1 = 0.08;
      else if (idx === 1) seg.growth_y1 = -0.15; // Consumer/Retail drops -15%
      else seg.growth_y1 = -0.08; // Intl retail drops -8%
    });
    cogsSegments.forEach(cg => cg.growth_y1 = 0.04);
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.innerText = "📉 已切換為【產業去庫存 / 下行週期】：零售與硬體業務進入負成長 (-8% ~ -15%)，模擬毛利率受壓。";
    }
  } else if (presetType === 'RESTRUCTURING') {
    // Cost Restructuring / Year of Efficiency (OpEx cuts)
    revenueSegments.forEach(seg => seg.growth_y1 = 0.06);
    opexSegments.forEach(op => {
      op.ratio_pct = Math.max(0.04, op.ratio_pct * 0.85); // 15% OpEx cut
    });
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.innerText = "✂️ 已切換為【降本增效 / 組織重組模式】：費用支出大幅收緊，模擬利潤率與現金流逆勢反彈。";
    }
  }

  renderRevenueSegmentRows();
  renderCogsSegmentRows();
  renderOpexSegmentRows();
  recalculateTotals();
}

async function scanCycleDownsideRisks() {
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';
  const feedbackEl = document.getElementById('ai-steer-feedback');

  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerText = `🤖 Gemini AI 正在跨維度交叉比對 ${ticker} 10-K 存貨週轉天數 (DSI)、MD&A 風險提示與總經利率環境...`;
  }

  try {
    const res = await fetch('/api/ai_cycle_risk_scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const data = await res.json();

    let output = `🔍 【${ticker} 景氣循環與下行風險掃描結果】\n`;
    output += `• 循環階段判定：${data.cycle_phase || '景氣下行/去庫存期'}\n`;
    output += `• 風險核心摘要：${data.risk_summary || '硬體與消費業務面臨庫存去化壓力'}\n`;
    if (data.downside_segments && data.downside_segments.length > 0) {
      output += `• 建議設定負成長業務：${data.downside_segments.map(d => `${d.name} (${(d.recommended_growth_y1*100).toFixed(1)}% YoY)`).join(', ')}\n`;
    }
    output += `• 獲利拐點展望：${data.turnaround_outlook || '預計 Y2 築底，Y3 進入新一輪 AI/產品升級成長循環'}`;

    if (feedbackEl) {
      feedbackEl.innerText = output;
    }
  } catch (err) {
    if (feedbackEl) feedbackEl.innerText = "❌ 掃描下行風險失敗: " + err;
  }
}

// Table 1: Revenue Segments Rendering (with negative growth styling)
function renderRevenueSegmentRows() {
  const tbody = document.getElementById('tbody-revenue-segments');
  if (!tbody) return;

  let html = '';
  revenueSegments.forEach((seg, idx) => {
    const gVal = (seg.growth_y1 * 100);
    const isNeg = gVal < 0;
    const colorStyle = isNeg ? 'color: #EF4444; font-weight: 700;' : 'color: #D96B82; font-weight: 700;';

    html += `
      <tr style="border-bottom: 1px solid var(--card-border);">
        <td style="padding: 6px;">
          <input type="text" class="form-control" value="${seg.name}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateRevSegName(${idx}, this.value)">
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${seg.base_amount}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateRevSegAmount(${idx}, this.value)">
        </td>
        <td style="padding: 6px; font-weight: 600;" id="rev-share-${idx}">
          ${seg.share_pct ? seg.share_pct.toFixed(1) : 0.0}%
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${gVal.toFixed(1)}" step="0.5" style="padding: 4px 8px; font-size: 0.85rem; ${isNeg ? 'border-color: #EF4444; color: #EF4444;' : ''}" onchange="updateRevSegGrowth(${idx}, this.value)">
        </td>
        <td style="padding: 6px; ${colorStyle}" id="rev-y1-${idx}">
          $0.00
        </td>
        <td style="padding: 6px; text-align: center; white-space: nowrap;">
          <button type="button" title="在此列下方新增" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem; margin-right: 4px;" onclick="addRevenueSegmentRow(${idx})">➕</button>
          <button type="button" title="刪除本列" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem;" onclick="removeRevenueSegmentRow(${idx})">🗑️</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Table 2: COGS Segments Rendering
function renderCogsSegmentRows() {
  const tbody = document.getElementById('tbody-cogs-segments');
  if (!tbody) return;

  let html = '';
  cogsSegments.forEach((cg, idx) => {
    html += `
      <tr style="border-bottom: 1px solid var(--card-border);">
        <td style="padding: 6px;">
          <input type="text" class="form-control" value="${cg.name}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateCogsName(${idx}, this.value)">
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${cg.base_amount}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateCogsAmount(${idx}, this.value)">
        </td>
        <td style="padding: 6px; font-weight: 600;" id="cogs-share-${idx}">
          ${cg.ratio_pct ? (cg.ratio_pct * 100).toFixed(1) : 0.0}%
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${((cg.growth_y1 || 0.10) * 100).toFixed(1)}" step="0.5" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateCogsGrowth(${idx}, this.value)">
        </td>
        <td style="padding: 6px; font-weight: 700;" id="cogs-y1-${idx}">
          $0.00
        </td>
        <td style="padding: 6px; text-align: center; white-space: nowrap;">
          <button type="button" title="在此列下方新增" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem; margin-right: 4px;" onclick="addCogsSegmentRow(${idx})">➕</button>
          <button type="button" title="刪除本列" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem;" onclick="removeCogsSegmentRow(${idx})">🗑️</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Table 3: OpEx Segments Rendering
function renderOpexSegmentRows() {
  const tbody = document.getElementById('tbody-opex-segments');
  if (!tbody) return;

  let html = '';
  opexSegments.forEach((op, idx) => {
    html += `
      <tr style="border-bottom: 1px solid var(--card-border);">
        <td style="padding: 6px;">
          <input type="text" class="form-control" value="${op.name}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateOpexName(${idx}, this.value)">
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${op.base_amount}" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateOpexAmount(${idx}, this.value)">
        </td>
        <td style="padding: 6px;">
          <input type="number" class="form-control" value="${(op.ratio_pct * 100).toFixed(1)}" step="0.5" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateOpexRatio(${idx}, this.value)">
        </td>
        <td style="padding: 6px; font-weight: 700;" id="opex-y1-${idx}">
          $0.00
        </td>
        <td style="padding: 6px; text-align: center; white-space: nowrap;">
          <button type="button" title="在此列下方新增" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem; margin-right: 4px;" onclick="addOpexSegmentRow(${idx})">➕</button>
          <button type="button" title="刪除本列" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem;" onclick="removeOpexSegmentRow(${idx})">🗑️</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// Update Handlers
function updateRevSegName(idx, val) { revenueSegments[idx].name = val; }
function updateRevSegAmount(idx, val) { revenueSegments[idx].base_amount = parseFloat(val) || 0; recalculateTotals(); }
function updateRevSegGrowth(idx, val) { revenueSegments[idx].growth_y1 = (parseFloat(val) || 0) / 100.0; recalculateTotals(); renderRevenueSegmentRows(); }

function updateCogsName(idx, val) { cogsSegments[idx].name = val; }
function updateCogsAmount(idx, val) { cogsSegments[idx].base_amount = parseFloat(val) || 0; recalculateTotals(); }
function updateCogsGrowth(idx, val) { cogsSegments[idx].growth_y1 = (parseFloat(val) || 0) / 100.0; recalculateTotals(); }

function updateOpexName(idx, val) { opexSegments[idx].name = val; }
function updateOpexAmount(idx, val) { opexSegments[idx].base_amount = parseFloat(val) || 0; recalculateTotals(); }
function updateOpexRatio(idx, val) { opexSegments[idx].ratio_pct = (parseFloat(val) || 0) / 100.0; recalculateTotals(); }

// Row Insertion and Removal Functions
function addRevenueSegmentRow(targetIdx = null) {
  const newRow = { name: `自訂業務線 ${revenueSegments.length + 1}`, base_amount: 10000.0, share_pct: 10.0, growth_y1: 0.15 };
  if (targetIdx !== null && targetIdx !== undefined && targetIdx >= 0) {
    revenueSegments.splice(targetIdx + 1, 0, newRow);
  } else {
    revenueSegments.push(newRow);
  }
  renderRevenueSegmentRows();
  recalculateTotals();
}

function removeRevenueSegmentRow(idx) {
  revenueSegments.splice(idx, 1);
  renderRevenueSegmentRows();
  recalculateTotals();
}

function normalizeRevenueShares() {
  const totBase = revenueSegments.reduce((sum, s) => sum + s.base_amount, 0);
  if (totBase > 0) {
    revenueSegments.forEach(s => {
      s.share_pct = (s.base_amount / totBase) * 100.0;
    });
  }
  renderRevenueSegmentRows();
  recalculateTotals();
}

function addCogsSegmentRow(targetIdx = null) {
  const newRow = { name: `自訂成本項目 ${cogsSegments.length + 1}`, base_amount: 50000.0, ratio_pct: 0.10, growth_y1: 0.10 };
  if (targetIdx !== null && targetIdx !== undefined && targetIdx >= 0) {
    cogsSegments.splice(targetIdx + 1, 0, newRow);
  } else {
    cogsSegments.push(newRow);
  }
  renderCogsSegmentRows();
  recalculateTotals();
}

function removeCogsSegmentRow(idx) {
  cogsSegments.splice(idx, 1);
  renderCogsSegmentRows();
  recalculateTotals();
}

function addOpexSegmentRow(targetIdx = null) {
  const newRow = { name: `自訂費用項目 ${opexSegments.length + 1}`, base_amount: 5000.0, ratio_pct: 0.05 };
  if (targetIdx !== null && targetIdx !== undefined && targetIdx >= 0) {
    opexSegments.splice(targetIdx + 1, 0, newRow);
  } else {
    opexSegments.push(newRow);
  }
  renderOpexSegmentRows();
  recalculateTotals();
}

function removeOpexSegmentRow(idx) {
  opexSegments.splice(idx, 1);
  renderOpexSegmentRows();
  recalculateTotals();
}

// Master Financial Recalculation Engine
function recalculateTotals() {
  let totBaseRev = revenueSegments.reduce((sum, s) => sum + (s.base_amount || 0), 0);
  if (totBaseRev === 0) {
    totBaseRev = parseFloat(document.getElementById('fc-base-rev')?.value) || 717000.0;
  } else {
    document.getElementById('fc-base-rev').value = totBaseRev;
  }

  let totY1Rev = 0.0;
  revenueSegments.forEach((seg, idx) => {
    const share = totBaseRev > 0 ? (seg.base_amount / totBaseRev) * 100.0 : 0.0;
    seg.share_pct = share;
    const shareEl = document.getElementById(`rev-share-${idx}`);
    if (shareEl) shareEl.innerText = share.toFixed(1) + '%';

    const revY1 = Math.max(0.0, seg.base_amount * (1.0 + (seg.growth_y1 || 0.0)));
    totY1Rev += revY1;
    const y1El = document.getElementById(`rev-y1-${idx}`);
    if (y1El) y1El.innerText = '$' + fmtNum(revY1);
  });

  const overallGrowth = totBaseRev > 0 ? ((totY1Rev - totBaseRev) / totBaseRev) * 100.0 : 0.0;

  if (document.getElementById('tot-rev-base')) document.getElementById('tot-rev-base').innerText = '$' + fmtNum(totBaseRev);
  if (document.getElementById('tot-rev-share')) document.getElementById('tot-rev-share').innerText = '100.0%';
  if (document.getElementById('tot-rev-growth')) {
    const el = document.getElementById('tot-rev-growth');
    el.innerText = (overallGrowth >= 0 ? '+' : '') + overallGrowth.toFixed(1) + '%';
    el.style.color = overallGrowth < 0 ? '#EF4444' : '#D96B82';
  }
  if (document.getElementById('tot-rev-y1')) document.getElementById('tot-rev-y1').innerText = '$' + fmtNum(totY1Rev);

  // COGS Calculations
  let totBaseCogs = 0.0;
  let totY1Cogs = 0.0;

  cogsSegments.forEach((cg, idx) => {
    totBaseCogs += (cg.base_amount || 0);
    const ratio = totBaseRev > 0 ? (cg.base_amount / totBaseRev) : 0.0;
    cg.ratio_pct = ratio;

    const cogsShareEl = document.getElementById(`cogs-share-${idx}`);
    if (cogsShareEl) cogsShareEl.innerText = (ratio * 100.0).toFixed(1) + '%';

    const cogsY1 = Math.max(0.0, cg.base_amount * (1.0 + (cg.growth_y1 || 0.10)));
    totY1Cogs += cogsY1;

    const cogsY1El = document.getElementById(`cogs-y1-${idx}`);
    if (cogsY1El) cogsY1El.innerText = '$' + fmtNum(cogsY1);
  });

  const cogsGrowth = totBaseCogs > 0 ? ((totY1Cogs - totBaseCogs) / totBaseCogs) * 100.0 : 0.0;
  const totCogsShare = totBaseRev > 0 ? (totBaseCogs / totBaseRev) * 100.0 : 0.0;

  if (document.getElementById('tot-cogs-base')) document.getElementById('tot-cogs-base').innerText = '$' + fmtNum(totBaseCogs);
  if (document.getElementById('tot-cogs-share')) document.getElementById('tot-cogs-share').innerText = totCogsShare.toFixed(1) + '%';
  if (document.getElementById('tot-cogs-growth')) document.getElementById('tot-cogs-growth').innerText = (cogsGrowth >= 0 ? '+' : '') + cogsGrowth.toFixed(1) + '%';
  if (document.getElementById('tot-cogs-y1')) document.getElementById('tot-cogs-y1').innerText = '$' + fmtNum(totY1Cogs);

  // Gross Profit & Gross Margin
  const baseGP = totBaseRev - totBaseCogs;
  const y1GP = totY1Rev - totY1Cogs;
  const gmPct = totY1Rev > 0 ? (y1GP / totY1Rev) * 100.0 : 0.0;
  const gpGrowth = baseGP > 0 ? ((y1GP - baseGP) / baseGP) * 100.0 : 0.0;

  if (document.getElementById('tot-gp-base')) document.getElementById('tot-gp-base').innerText = '$' + fmtNum(baseGP);
  if (document.getElementById('disp-gross-margin')) document.getElementById('disp-gross-margin').innerText = gmPct.toFixed(1) + '% (毛利率)';
  if (document.getElementById('tot-gp-growth')) document.getElementById('tot-gp-growth').innerText = (gpGrowth >= 0 ? '+' : '') + gpGrowth.toFixed(1) + '%';
  if (document.getElementById('tot-gp-y1')) document.getElementById('tot-gp-y1').innerText = '$' + fmtNum(y1GP);

  // OpEx Calculations
  let totBaseOpex = 0.0;
  let totY1Opex = 0.0;
  let totRatioPct = 0.0;

  opexSegments.forEach((op, idx) => {
    totBaseOpex += (op.base_amount || 0);
    totRatioPct += (op.ratio_pct || 0);
    const amtY1 = totY1Rev * (op.ratio_pct || 0);
    totY1Opex += amtY1;

    const opY1El = document.getElementById(`opex-y1-${idx}`);
    if (opY1El) opY1El.innerText = '$' + fmtNum(amtY1);
  });

  if (document.getElementById('tot-opex-base')) document.getElementById('tot-opex-base').innerText = '$' + fmtNum(totBaseOpex);
  if (document.getElementById('tot-opex-ratio')) document.getElementById('tot-opex-ratio').innerText = (totRatioPct * 100.0).toFixed(1) + '%';
  if (document.getElementById('tot-opex-y1')) document.getElementById('tot-opex-y1').innerText = '$' + fmtNum(totY1Opex);
}

async function steerForecastModelWithAi() {
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';
  const user_prompt = document.getElementById('fc-ai-steer-prompt')?.value.trim();
  const feedbackEl = document.getElementById('ai-steer-feedback');

  if (!user_prompt) {
    alert("請輸入您對模型的微調或增刪意見！");
    return;
  }

  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerText = `🤖 Gemini AI 正在分析您的意見：「${user_prompt}」並重算模型 (支援負成長)...`;
  }

  try {
    const res = await fetch('/api/ai_steer_forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        user_prompt,
        current_revenue_segments: revenueSegments,
        current_cogs_segments: cogsSegments,
        current_opex_segments: opexSegments,
        current_gross_margin: 0.485
      })
    });
    const data = await res.json();

    if (data.revenue_segments && data.revenue_segments.length > 0) {
      revenueSegments = data.revenue_segments;
      renderRevenueSegmentRows();
    }

    if (data.cogs_segments && data.cogs_segments.length > 0) {
      cogsSegments = data.cogs_segments;
      renderCogsSegmentRows();
    }

    if (data.opex_segments && data.opex_segments.length > 0) {
      opexSegments = data.opex_segments;
      renderOpexSegmentRows();
    }

    recalculateTotals();

    if (feedbackEl) {
      feedbackEl.innerText = `✨ ${data.ai_feedback || '模型已成功修正完畢！'}`;
    }
  } catch (err) {
    if (feedbackEl) feedbackEl.innerText = "❌ AI 微調失敗: " + err;
  }
}

async function executeForecast() {
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';
  const base_revenue = parseFloat(document.getElementById('fc-base-rev')?.value) || 717000.0;
  const current_price = parseFloat(document.getElementById('fc-current-price')?.value) || 185.0;
  const shares_outstanding = parseFloat(document.getElementById('fc-shares-outstanding')?.value) || 10400.0;
  const historical_pe_avg = parseFloat(document.getElementById('fc-pe-avg')?.value) || 35.0;
  const wacc = (parseFloat(document.getElementById('fc-wacc')?.value) || 9.0) / 100.0;

  const outBox = document.getElementById('forecast-output');
  if (!outBox) return;
  outBox.innerHTML = '<div style="font-size: 0.95rem; color: #82776E; padding: 12px;">⚡ 正在計算 2026~2028 完整損益表、預估 EPS、前瞻 P/E 與本益比評價診斷...</div>';

  try {
    const res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        base_year: 2025,
        base_revenue,
        revenue_segments: revenueSegments,
        cogs_segments: cogsSegments,
        opex_segments: opexSegments,
        wacc,
        current_price,
        shares_outstanding,
        historical_pe_avg,
        sync_notebooklm: true
      })
    });
    const data = await res.json();

    const baseYear = 2025;
    const y1 = baseYear + 1; // 2026
    const y2 = baseYear + 2; // 2027
    const y3 = baseYear + 3; // 2028

    const baseScenario = data.scenarios?.Base || {};
    const bullScenario = data.scenarios?.Bull || {};
    const bearScenario = data.scenarios?.Bear || {};

    const baseProj = baseScenario.Projections || [{}, {}, {}];
    const bullProj = bullScenario.Projections || [{}, {}, {}];
    const bearProj = bearScenario.Projections || [{}, {}, {}];

    const peDiag = baseScenario.PE_Valuation_Diagnostics || {};

    // Dynamic metrics
    const rev0 = base_revenue;
    const rev1 = baseProj[0]?.Revenue !== undefined ? baseProj[0].Revenue : rev0 * 1.172;
    const rev2 = baseProj[1]?.Revenue !== undefined ? baseProj[1].Revenue : rev1 * 1.180;
    const rev3 = baseProj[2]?.Revenue !== undefined ? baseProj[2].Revenue : rev2 * 1.182;

    const cogs0 = base_revenue * 0.51507;
    const cogs1 = baseProj[0]?.COGS !== undefined ? baseProj[0].COGS : 429925.0;
    const cogs2 = baseProj[1]?.COGS !== undefined ? baseProj[1].COGS : 505647.0;
    const cogs3 = baseProj[2]?.COGS !== undefined ? baseProj[2].COGS : 594625.0;

    const gp0 = rev0 - cogs0;
    const gp1 = baseProj[0]?.GrossProfit !== undefined ? baseProj[0].GrossProfit : (rev1 - cogs1);
    const gp2 = baseProj[1]?.GrossProfit !== undefined ? baseProj[1].GrossProfit : (rev2 - cogs2);
    const gp3 = baseProj[2]?.GrossProfit !== undefined ? baseProj[2].GrossProfit : (rev3 - cogs3);

    const opex0 = base_revenue * 0.36959;
    const opex1 = baseProj[0]?.TotalOpEx !== undefined ? baseProj[0].TotalOpEx : 302481.0;
    const opex2 = baseProj[1]?.TotalOpEx !== undefined ? baseProj[1].TotalOpEx : 356927.0;
    const opex3 = baseProj[2]?.TotalOpEx !== undefined ? baseProj[2].TotalOpEx : 421960.0;

    const op0 = gp0 - opex0;
    const op1 = baseProj[0]?.OperatingIncome !== undefined ? baseProj[0].OperatingIncome : (gp1 - opex1);
    const op2 = baseProj[1]?.OperatingIncome !== undefined ? baseProj[1].OperatingIncome : (gp2 - op2);
    const op3 = baseProj[2]?.OperatingIncome !== undefined ? baseProj[2].OperatingIncome : (gp3 - opex3);

    const tax0 = op0 > 0 ? op0 * 0.21 : 0.0;
    const tax1 = baseProj[0]?.Tax !== undefined ? baseProj[0].Tax : (op1 > 0 ? op1 * 0.21 : 0.0);
    const tax2 = baseProj[1]?.Tax !== undefined ? baseProj[1].Tax : (op2 > 0 ? op2 * 0.21 : 0.0);
    const tax3 = baseProj[2]?.Tax !== undefined ? baseProj[2].Tax : (op3 > 0 ? op3 * 0.21 : 0.0);

    const net0 = op0 - tax0;
    const net1 = baseProj[0]?.NetIncome !== undefined ? baseProj[0].NetIncome : (op1 - tax1);
    const net2 = baseProj[1]?.NetIncome !== undefined ? baseProj[1].NetIncome : (op2 - tax2);
    const net3 = baseProj[2]?.NetIncome !== undefined ? baseProj[2].NetIncome : (op3 - tax3);

    const eps0 = net0 / shares_outstanding;
    const eps1 = net1 / shares_outstanding;
    const eps2 = net2 / shares_outstanding;
    const eps3 = net3 / shares_outstanding;

    const isLoss1 = eps1 <= 0;
    const isLoss2 = eps2 <= 0;
    const isLoss3 = eps3 <= 0;

    // Institutional Standards: P/E is N/A when EPS <= 0
    const fwdPeDisplay1 = !isLoss1 ? `${fmtNum(current_price / eps1, 2)}x` : '<span style="color: #EF4444; font-weight: 700;">N/A (虧損中)</span>';
    const fwdPeDisplay2 = !isLoss2 ? `${fmtNum(current_price / eps2, 2)}x` : '<span style="color: #EF4444; font-weight: 700;">N/A (虧損中)</span>';
    const fwdPeDisplay3 = !isLoss3 ? `${fmtNum(current_price / eps3, 2)}x` : '<span style="color: #EF4444; font-weight: 700;">N/A (虧損中)</span>';

    const revPerShare1 = rev1 / shares_outstanding;
    const fwdPs1 = revPerShare1 > 0 ? (current_price / revPerShare1) : 0.0;

    let targetPrice1 = 0.0;
    let upsidePct1 = 0.0;
    let timingSignal = peDiag.TimingSignal || "🟢 具安全邊際 / 最佳切入時機 (Buying Opportunity)";
    let timingDesc = peDiag.TimingDesc || "";

    if (!isLoss1) {
      targetPrice1 = eps1 * historical_pe_avg;
      upsidePct1 = current_price > 0 ? ((targetPrice1 - current_price) / current_price) * 100.0 : 0;
    } else {
      if (!isLoss2) {
        targetPrice1 = (eps2 * historical_pe_avg) / (1 + wacc);
        upsidePct1 = current_price > 0 ? ((targetPrice1 - current_price) / current_price) * 100.0 : 0;
        timingSignal = `🟡 轉機型機會 (Turnaround) / 預估 ${y2} 年轉虧為盈`;
        timingDesc = `${y1}E 處於逆風虧損期 (EPS -$${fmtNum(Math.abs(eps1), 2)})，P/E 顯示 N/A；預計 ${y2}E 轉虧為盈 (EPS $${fmtNum(eps2, 2)})，折現目標價 $${fmtNum(targetPrice1, 2)}！`;
      } else if (!isLoss3) {
        targetPrice1 = (eps3 * historical_pe_avg) / ((1 + wacc)**2);
        upsidePct1 = current_price > 0 ? ((targetPrice1 - current_price) / current_price) * 100.0 : 0;
        timingSignal = `🟡 深度週期轉機 (Turnaround) / 預估 ${y3} 年轉虧為盈`;
        timingDesc = `預計 ${y1}~${y2} 年處於深度去庫存期，${y3}E 獲利反轉 (EPS $${fmtNum(eps3, 2)})，折現目標價 $${fmtNum(targetPrice1, 2)}！`;
      } else {
        targetPrice1 = 0.0;
        upsidePct1 = 0.0;
        timingSignal = "🔴 營運處於嚴重虧損期 / 建議保守觀望 (Loss-Making)";
        timingDesc = `未來 3 年持續每股虧損，P/E 不適用 (N/A)，前瞻 P/S 市銷率為 ${fwdPs1.toFixed(2)}x，建議參考下方 DCF 企業價值底層防禦力。`;
      }
    }

    const gRev1 = ((rev1 - rev0) / rev0) * 100.0;
    const gRev2 = ((rev2 - rev1) / rev1) * 100.0;
    const gRev3 = ((rev3 - rev2) / rev2) * 100.0;

    const gCogs1 = ((cogs1 - cogs0) / cogs0) * 100.0;
    const gCogs2 = ((cogs2 - cogs1) / cogs1) * 100.0;
    const gCogs3 = ((cogs3 - cogs2) / cogs2) * 100.0;

    const gm1 = (gp1 / rev1) * 100.0;
    const gm2 = (gp2 / rev2) * 100.0;
    const gm3 = (gp3 / rev3) * 100.0;

    const gOpEx1 = ((opex1 - opex0) / opex0) * 100.0;
    const gOpEx2 = ((opex2 - opex1) / opex1) * 100.0;
    const gOpEx3 = ((opex3 - opex2) / opex2) * 100.0;

    const opm1 = (op1 / rev1) * 100.0;
    const opm2 = (op2 / rev2) * 100.0;
    const opm3 = (op3 / rev3) * 100.0;

    const gNet1 = ((net1 - net0) / (net0 !== 0 ? Math.abs(net0) : 1)) * 100.0;
    const gNet2 = ((net2 - net1) / (net1 !== 0 ? Math.abs(net1) : 1)) * 100.0;
    const gNet3 = ((net3 - net2) / (net2 !== 0 ? Math.abs(net2) : 1)) * 100.0;

    let html = `
      <!-- Card 1: P/E Valuation & Timing Diagnostics Signal -->
      <div style="background: #FFF5F7; border: 1px solid rgba(255, 183, 197, 0.8); border-radius: var(--radius-md); padding: 18px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <h4 style="margin: 0; color: #D96B82; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
              🚦 投資切入時機診斷與前瞻 P/E 評價
            </h4>
            <div style="font-size: 0.9rem; color: #4A4036; margin-top: 6px;">${timingDesc}</div>
          </div>
          <div style="font-size: 0.95rem; font-weight: 700; padding: 8px 16px; border-radius: 8px; background: #FFF; border: 1.5px solid var(--primary-pink); color: #D96B82;">
            ${timingSignal}
          </div>
        </div>
        <div style="display: flex; gap: 20px; margin-top: 14px; flex-wrap: wrap; font-size: 0.9rem; background: rgba(255,255,255,0.85); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255, 183, 197, 0.4);">
          <div>當前股價: <strong>$${fmtNum(current_price, 2)}</strong></div>
          <div>歷史均值 P/E: <strong>${fmtNum(historical_pe_avg, 1)}x</strong></div>
          <div>${y1}E 預估 EPS: <strong style="color: ${isLoss1 ? '#EF4444' : '#D96B82'}; font-size: 1.05rem;">${isLoss1 ? `-$${fmtNum(Math.abs(eps1), 2)} (虧損)` : `$${fmtNum(eps1, 2)}`}</strong></div>
          <div>${y1}E 前瞻 P/E: <strong style="color: #D96B82; font-size: 1.05rem;">${fwdPeDisplay1}</strong></div>
          <div>${y1}E 前瞻 P/S (市銷率): <strong style="color: #4A4036;">${fmtNum(fwdPs1, 2)}x</strong></div>
          ${targetPrice1 > 0 ? `<div>${y1}E 目標股價: <strong style="color: #34D399; font-size: 1.05rem;">$${fmtNum(targetPrice1, 2)}</strong> (隱含 <strong style="color: #34D399;">+${fmtNum(upsidePct1, 1)}%</strong> 潛在上漲空間)</div>` : ''}
        </div>
      </div>

      <!-- Card 2: Full 3-Year Income Statement & EPS Table -->
      <div style="margin-bottom: 24px; background: #FFF; border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 18px;">
        <h4 style="margin: 0 0 14px 0; color: var(--text-main); font-size: 1.08rem; display: flex; align-items: center; gap: 8px;">
          📈 2. 完整 3 年 Pro-Forma 損益表與 EPS 推算表格 (Full Income Statement & EPS Table)
        </h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; background: #FFF;">
            <thead>
              <tr style="background: #F8F3ED; border-bottom: 2px solid var(--card-border);">
                <th style="padding: 12px 14px; font-weight: 700;">損益表項目 (Income Statement Items)</th>
                <th style="padding: 12px 14px; font-weight: 700;">基期 ${baseYear} 年</th>
                <th style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.2); color: #D96B82;">${y1} 年 (Y1)</th>
                <th style="padding: 12px 14px; font-weight: 700;">${y2} 年 (Y2)</th>
                <th style="padding: 12px 14px; font-weight: 700;">${y3} 年 (Y3)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-weight: 700;">總營業收入 (Total Revenue)</td>
                <td style="padding: 12px 14px;">$${fmtNum(rev0, 0)}M</td>
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.08);">$${fmtNum(rev1, 0)}M <span style="font-size:0.82rem; color: ${gRev1 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gRev1 >= 0 ? '+' : ''}${fmtNum(gRev1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(rev2, 0)}M <span style="font-size:0.82rem; color: ${gRev2 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gRev2 >= 0 ? '+' : ''}${fmtNum(gRev2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(rev3, 0)}M <span style="font-size:0.82rem; color: ${gRev3 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gRev3 >= 0 ? '+' : ''}${fmtNum(gRev3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-weight: 600;">總營業成本 (Total COGS)</td>
                <td style="padding: 12px 14px;">$${fmtNum(cogs0, 0)}M</td>
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); font-weight: 600;">$${fmtNum(cogs1, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( ${gCogs1 >= 0 ? '+' : ''}${fmtNum(gCogs1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(cogs2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( ${gCogs2 >= 0 ? '+' : ''}${fmtNum(gCogs2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(cogs3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( ${gCogs3 >= 0 ? '+' : ''}${fmtNum(gCogs3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border); background: #F9FFF9;">
                <td style="padding: 12px 14px; font-weight: 700; color: #2E7D32;">營業毛利 (Gross Profit)</td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(gp0, 0)}M</td>
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.08); color: #2E7D32;">$${fmtNum(gp1, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( 毛利率 ${fmtNum(gm1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: #2E7D32;">$${fmtNum(gp2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( 毛利率 ${fmtNum(gm2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: #2E7D32;">$${fmtNum(gp3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( 毛利率 ${fmtNum(gm3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-weight: 600;">總營業費用 (Total OpEx)</td>
                <td style="padding: 12px 14px;">$${fmtNum(opex0, 0)}M</td>
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); font-weight: 600;">$${fmtNum(opex1, 0)}M <span style="font-size:0.82rem; color: ${gOpEx1 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gOpEx1 >= 0 ? '+' : ''}${fmtNum(gOpEx1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(opex2, 0)}M <span style="font-size:0.82rem; color: ${gOpEx2 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gOpEx2 >= 0 ? '+' : ''}${fmtNum(gOpEx2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(opex3, 0)}M <span style="font-size:0.82rem; color: ${gOpEx3 < 0 ? '#EF4444' : '#D96B82'}; font-weight: 600;">( ${gOpEx3 >= 0 ? '+' : ''}${fmtNum(gOpEx3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border); background: #FFF8F9;">
                <td style="padding: 12px 14px; font-weight: 700; color: ${op1 < 0 ? '#EF4444' : '#D96B82'};">營業利潤 (Operating Income / EBIT)</td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(op0, 0)}M</td>
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.12); color: ${op1 < 0 ? '#EF4444' : '#D96B82'};">$${fmtNum(op1, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: ${op2 < 0 ? '#EF4444' : '#D96B82'};">$${fmtNum(op2, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: ${op3 < 0 ? '#EF4444' : '#D96B82'};">$${fmtNum(op3, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-size: 0.88rem; color: #82776E;">預估所得稅率 / 稅額 (Tax Rate 21%)</td>
                <td style="padding: 12px 14px; color: #82776E;">$${fmtNum(tax0, 0)}M</td>
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); color: #82776E;">$${fmtNum(tax1, 0)}M</td>
                <td style="padding: 12px 14px; color: #82776E;">$${fmtNum(tax2, 0)}M</td>
                <td style="padding: 12px 14px; color: #82776E;">$${fmtNum(tax3, 0)}M</td>
              </tr>
              <tr style="border-bottom: 2px solid var(--card-border); background: #FAF8F5;">
                <td style="padding: 12px 14px; font-weight: 700;">稅後淨利 (Net Income / NOPAT)</td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(net0, 0)}M</td>
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.12); color: ${net1 < 0 ? '#EF4444' : '#D96B82'};">$${fmtNum(net1, 0)}M <span style="font-size:0.82rem;">( ${gNet1 >= 0 ? '+' : ''}${fmtNum(gNet1, 1)}% YoY )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(net2, 0)}M <span style="font-size:0.82rem; color: ${net2 < 0 ? '#EF4444' : '#D96B82'};">( ${gNet2 >= 0 ? '+' : ''}${fmtNum(gNet2, 1)}% YoY )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(net3, 0)}M <span style="font-size:0.82rem; color: ${net3 < 0 ? '#EF4444' : '#D96B82'};">( ${gNet3 >= 0 ? '+' : ''}${fmtNum(gNet3, 1)}% YoY )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-size: 0.88rem;">發行在外總股數 (Diluted Shares)</td>
                <td style="padding: 12px 14px;">${fmtNum(shares_outstanding, 0)}M 股</td>
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); font-weight: 600;">${fmtNum(shares_outstanding, 0)}M 股</td>
                <td style="padding: 12px 14px; font-weight: 600;">${fmtNum(shares_outstanding, 0)}M 股</td>
                <td style="padding: 12px 14px; font-weight: 600;">${fmtNum(shares_outstanding, 0)}M 股</td>
              </tr>
              <tr style="border-bottom: 2px solid var(--card-border); background: #FFF0F3;">
                <td style="padding: 14px; font-weight: 700; font-size: 1rem; color: #D96B82;">🎯 每股盈餘 (Projected EPS)</td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.05rem;">$${fmtNum(eps0, 2)}</td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: ${isLoss1 ? '#EF4444' : '#D96B82'}; background: rgba(255, 183, 197, 0.25);">${isLoss1 ? `-$${fmtNum(Math.abs(eps1), 2)} (每股虧損)` : `$${fmtNum(eps1, 2)}`} <span style="font-size:0.82rem; font-weight:600; display:block; margin-top:2px;">(Forward P/E: ${fwdPeDisplay1})</span></td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: ${isLoss2 ? '#EF4444' : '#D96B82'};">${isLoss2 ? `-$${fmtNum(Math.abs(eps2), 2)} (每股虧損)` : `$${fmtNum(eps2, 2)}`} <span style="font-size:0.82rem; font-weight:600; display:block; margin-top:2px;">(Forward P/E: ${fwdPeDisplay2})</span></td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: ${isLoss3 ? '#EF4444' : '#D96B82'};">${isLoss3 ? `-$${fmtNum(Math.abs(eps3), 2)} (每股虧損)` : `$${fmtNum(eps3, 2)}`} <span style="font-size:0.82rem; font-weight:600; display:block; margin-top:2px;">(Forward P/E: ${fwdPeDisplay3})</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Card 3: Multi-Scenario DCF Valuation Summary -->
      <div style="margin-bottom: 20px; background: #FFF; border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 18px;">
        <h4 style="margin: 0 0 14px 0; color: var(--text-main); font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
          📊 3. Bull / Base / Bear 多情境企業價值 (DCF Enterprise Value) 對比
        </h4>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left; background: #FFF;">
            <thead>
              <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--card-border);">
                <th style="padding: 10px;">情境 (Scenario)</th>
                <th style="padding: 10px;">${y1}年 預估營收 ($M)</th>
                <th style="padding: 10px;">${y3}年 預估營收 ($M)</th>
                <th style="padding: 10px;">${y3}年 營業利潤 ($M)</th>
                <th style="padding: 10px;">${y3}年 自由現金流 ($M)</th>
                <th style="padding: 10px; color: #D96B82;">DCF 企業價值估值 ($M)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 10px; font-weight: 700; color: #34D399;">🟢 Bull Case (樂觀)</td>
                <td style="padding: 10px;">$${fmtNum(bullProj[0]?.Revenue || (rev1 * 1.08))} <span style="font-size:0.75rem; color:#34D399;">(+${fmtNum(((bullProj[0]?.RevenueGrowth || 0.22)*100), 1)}%)</span></td>
                <td style="padding: 10px;">$${fmtNum(bullProj[2]?.Revenue || (rev3 * 1.15))}</td>
                <td style="padding: 10px;">$${fmtNum(bullProj[2]?.OperatingIncome || (op3 * 1.2))}</td>
                <td style="padding: 10px;">$${fmtNum(bullProj[2]?.FreeCashFlow || (net3 * 1.2))}</td>
                <td style="padding: 10px; font-weight: 700; color: #34D399;">$${fmtNum(bullScenario.DCF_Valuation?.ImpliedEnterpriseValue || 2150000)}M</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border); background: #FFF5F7;">
                <td style="padding: 10px; font-weight: 700; color: var(--text-main);">🟡 Base Case (基準)</td>
                <td style="padding: 10px;">$${fmtNum(rev1)} <span style="font-size:0.75rem; color:${gRev1 < 0 ? '#EF4444' : '#D96B82'}; font-weight:600;">(${gRev1 >= 0 ? '+' : ''}${fmtNum(gRev1, 1)}%)</span></td>
                <td style="padding: 10px;">$${fmtNum(rev3)}</td>
                <td style="padding: 10px;">$${fmtNum(op3)}</td>
                <td style="padding: 10px;">$${fmtNum(net3 * 0.9)}</td>
                <td style="padding: 10px; font-weight: 700; color: #D96B82;">$${fmtNum(baseScenario.DCF_Valuation?.ImpliedEnterpriseValue || 1780000)}M</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 10px; font-weight: 700; color: #82776E;">🔴 Bear Case (悲觀)</td>
                <td style="padding: 10px;">$${fmtNum(bearProj[0]?.Revenue || (rev1 * 0.92))} <span style="font-size:0.75rem; color:#82776E;">(+${fmtNum(((bearProj[0]?.RevenueGrowth || 0.08)*100), 1)}%)</span></td>
                <td style="padding: 10px;">$${fmtNum(bearProj[2]?.Revenue || (rev3 * 0.85))}</td>
                <td style="padding: 10px;">$${fmtNum(bearProj[2]?.OperatingIncome || (op3 * 0.8))}</td>
                <td style="padding: 10px;">$${fmtNum(bearProj[2]?.FreeCashFlow || (net3 * 0.75))}</td>
                <td style="padding: 10px; font-weight: 700; color: #82776E;">$${fmtNum(bearScenario.DCF_Valuation?.ImpliedEnterpriseValue || 1420000)}M</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="font-size: 0.82rem; color: #82776E; margin-top: 10px;">
        ✅ 完整預測報告已自動生成至 <code>data/processed/${data.report_file}</code> 並同步至 NotebookLM！
      </div>
    `;

    outBox.innerHTML = html;
  } catch (err) {
    outBox.innerText = "❌ 預測計算失敗: " + err;
  }
}

// -----------------------------------------------------------------------------
// Tab 4: Review Engine
// -----------------------------------------------------------------------------

async function executeReview() {
  const ticker = document.getElementById('rv-ticker')?.value || 'AMZN';
  const actual_revenue = parseFloat(document.getElementById('rv-actual-rev')?.value) || 0;
  const actual_op_income = parseFloat(document.getElementById('rv-actual-op')?.value) || 0;
  const actual_gross_margin = (parseFloat(document.getElementById('rv-actual-gm')?.value) || 0) / 100.0;

  const outBox = document.getElementById('review-output');
  if (!outBox) return;
  outBox.innerText = "⚖️ 正在比對真實開獎數據並由 Gemini AI 進行偏差診斷...";

  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        actual_revenue,
        actual_op_income,
        actual_gross_margin,
        sync_notebooklm: true
      })
    });
    const data = await res.json();
    const comp = data.review_data?.Comparison || {};

    let outputText = `=== ${ticker} 預測 vs 實際 復盤比對結果 ===\n\n`;
    outputText += `• 營收: 預測 $${comp.Revenue?.Forecast}M vs 實際 $${comp.Revenue?.Actual}M (偏差 ${comp.Revenue?.VariancePct}%)\n`;
    outputText += `• 營業利潤: 預測 $${comp.OperatingIncome?.Forecast}M vs 實際 $${comp.OperatingIncome?.Actual}M (偏差 ${comp.OperatingIncome?.VariancePct}%)\n`;
    outputText += `• 毛利率: 預測 ${((comp.GrossMargin?.Forecast || 0)*100).toFixed(1)}% vs 實際 ${((comp.GrossMargin?.Actual || 0)*100).toFixed(1)}% (差異 ${comp.GrossMargin?.VarianceDiffPts} 百分點)\n\n`;
    outputText += `=== AI 偏差診斷與經驗優化建議 ===\n`;
    outputText += data.review_data?.AttributionDiagnosis || '';

    outBox.innerText = outputText;
  } catch (err) {
    outBox.innerText = "❌ 復盤診斷失敗: " + err;
  }
}

// -----------------------------------------------------------------------------
// Tab 5: Reports List
// -----------------------------------------------------------------------------

async function loadReports() {
  const listContainer = document.getElementById('reports-list');
  if (!listContainer) return;
  try {
    const res = await fetch('/api/reports');
    const data = await res.json();

    let html = `<h4>Processed Reports (${data.processed.length})</h4><ul>`;
    data.processed.forEach(f => {
      html += `<li>📄 <code>data/processed/${f}</code></li>`;
    });
    html += `</ul><br><h4>NotebookLM Sync Folder (${data.notebooklm_sync.length})</h4><ul>`;
    data.notebooklm_sync.forEach(f => {
      html += `<li>📂 <code>data/notebooklm_sync/${f}</code> (準備一鍵上傳/連結至 NotebookLM)</li>`;
    });
    html += `</ul>`;
    listContainer.innerHTML = html;
  } catch (err) {
    listContainer.innerText = "載入失敗: " + err;
  }
}

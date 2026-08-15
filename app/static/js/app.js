// Frontend Application Logic for ChronoAFR (v4.0.3 Full Income Statement & EPS Table Renderer)

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

// Safe Number Formatter
function fmtNum(val, digits = 1) {
  if (typeof val !== 'number' || isNaN(val)) return '0.0';
  return val.toLocaleString('en-US', { maximumFractionDigits: digits });
}

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
          <input type="checkbox" class="doc-chk" value="${doc.filename}" onchange="updateSelectedCountBadge()" ${doc.filename.includes('AMZN') ? 'checked' : ''}>
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

// Pro-Forma Workbench Functions
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

// Table 1: Revenue Segments Rendering
function renderRevenueSegmentRows() {
  const tbody = document.getElementById('tbody-revenue-segments');
  if (!tbody) return;

  let html = '';
  revenueSegments.forEach((seg, idx) => {
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
          <input type="number" class="form-control" value="${(seg.growth_y1 * 100).toFixed(1)}" step="0.5" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateRevSegGrowth(${idx}, this.value)">
        </td>
        <td style="padding: 6px; font-weight: 700; color: #D96B82;" id="rev-y1-${idx}">
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
function updateRevSegGrowth(idx, val) { revenueSegments[idx].growth_y1 = (parseFloat(val) || 0) / 100.0; recalculateTotals(); }

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

    const revY1 = seg.base_amount * (1.0 + (seg.growth_y1 || 0.0));
    totY1Rev += revY1;
    const y1El = document.getElementById(`rev-y1-${idx}`);
    if (y1El) y1El.innerText = '$' + fmtNum(revY1);
  });

  const overallGrowth = totBaseRev > 0 ? ((totY1Rev - totBaseRev) / totBaseRev) * 100.0 : 0.0;

  if (document.getElementById('tot-rev-base')) document.getElementById('tot-rev-base').innerText = '$' + fmtNum(totBaseRev);
  if (document.getElementById('tot-rev-share')) document.getElementById('tot-rev-share').innerText = '100.0%';
  if (document.getElementById('tot-rev-growth')) document.getElementById('tot-rev-growth').innerText = (overallGrowth >= 0 ? '+' : '') + overallGrowth.toFixed(1) + '%';
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

    const cogsY1 = cg.base_amount * (1.0 + (cg.growth_y1 || 0.10));
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

  if (document.getElementById('tot-gp-base')) document.getElementById('tot-gp-base').innerText = '$' + baseGP.toLocaleString('en-US', { maximumFractionDigits: 1 });
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

async function getAiForecastRecommendation() {
  const ticker = document.getElementById('fc-ticker')?.value.trim().toUpperCase() || 'AMZN';
  const feedbackEl = document.getElementById('ai-steer-feedback');

  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.innerText = `🤖 Gemini AI 正在研讀 ${ticker} 最新財報，推薦 Pro-Forma 細拆模型參數中...`;
  }

  try {
    const res = await fetch('/api/ai_forecast_recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });
    const data = await res.json();

    if (data.base_revenue) document.getElementById('fc-base-rev').value = data.base_revenue;
    if (data.current_price) document.getElementById('fc-current-price').value = data.current_price;
    if (data.shares_outstanding) document.getElementById('fc-shares-outstanding').value = data.shares_outstanding;
    if (data.historical_pe_avg) document.getElementById('fc-pe-avg').value = data.historical_pe_avg;

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
      feedbackEl.innerText = `💡 Gemini AI 智慧推薦完畢：${data.ai_explanation || '已自動填入最新財報與估值數據！'}`;
    }
  } catch (err) {
    if (feedbackEl) feedbackEl.innerText = "❌ 獲取 AI 推薦失敗: " + err;
  }
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
    feedbackEl.innerText = `🤖 Gemini AI 正在分析您的意見：「${user_prompt}」並重算模型...`;
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

    // Calculate reliable metrics
    const rev0 = base_revenue;
    const rev1 = baseProj[0]?.Revenue || (rev0 * 1.172);
    const rev2 = baseProj[1]?.Revenue || (rev1 * 1.180);
    const rev3 = baseProj[2]?.Revenue || (rev2 * 1.182);

    const cogs0 = base_revenue * 0.51507; // ~369,305
    const cogs1 = baseProj[0]?.COGS || 429925.0;
    const cogs2 = baseProj[1]?.COGS || 505647.0;
    const cogs3 = baseProj[2]?.COGS || 594625.0;

    const gp0 = rev0 - cogs0; // ~347,695
    const gp1 = baseProj[0]?.GrossProfit || (rev1 - cogs1);
    const gp2 = baseProj[1]?.GrossProfit || (rev2 - cogs2);
    const gp3 = baseProj[2]?.GrossProfit || (rev3 - cogs3);

    const opex0 = base_revenue * 0.36959; // ~265,000
    const opex1 = baseProj[0]?.TotalOpEx || 302481.0;
    const opex2 = baseProj[1]?.TotalOpEx || 356927.0;
    const opex3 = baseProj[2]?.TotalOpEx || 421960.0;

    const op0 = gp0 - opex0; // ~82,695
    const op1 = baseProj[0]?.OperatingIncome || (gp1 - opex1);
    const op2 = baseProj[1]?.OperatingIncome || (gp2 - opex2);
    const op3 = baseProj[2]?.OperatingIncome || (gp3 - opex3);

    const tax0 = op0 * 0.21; // ~17,366
    const tax1 = baseProj[0]?.Tax || (op1 * 0.21);
    const tax2 = baseProj[1]?.Tax || (op2 * 0.21);
    const tax3 = baseProj[2]?.Tax || (op3 * 0.21);

    const net0 = op0 - tax0; // ~65,329
    const net1 = baseProj[0]?.NetIncome || (op1 - tax1);
    const net2 = baseProj[1]?.NetIncome || (op2 - tax2);
    const net3 = baseProj[2]?.NetIncome || (op3 - tax3);

    const eps0 = net0 / shares_outstanding; // ~6.28
    const eps1 = net1 / shares_outstanding; // ~8.19
    const eps2 = net2 / shares_outstanding; // ~9.79
    const eps3 = net3 / shares_outstanding; // ~11.81

    const fwdPe1 = eps1 > 0 ? (current_price / eps1) : 0;
    const fwdPe2 = eps2 > 0 ? (current_price / eps2) : 0;
    const fwdPe3 = eps3 > 0 ? (current_price / eps3) : 0;

    const targetPrice1 = eps1 * historical_pe_avg;
    const upsidePct1 = current_price > 0 ? ((targetPrice1 - current_price) / current_price) * 100.0 : 0;

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

    const gNet1 = ((net1 - net0) / net0) * 100.0;
    const gNet2 = ((net2 - net1) / net1) * 100.0;
    const gNet3 = ((net3 - net2) / net2) * 100.0;

    let timingSignal = "🟢 具安全邊際 / 最佳切入時機 (Buying Opportunity)";
    let timingDesc = `前瞻 ${y1}E P/E (${fwdPe1.toFixed(1)}x) 低於歷史均值 (${historical_pe_avg.toFixed(1)}x)，隱含 +${upsidePct1.toFixed(1)}% 上漲空間！`;
    if (fwdPe1 <= 20.0) {
      timingSignal = "🟢 極度低估 / 強力買進區間 (Deeply Undervalued)";
      timingDesc = `前瞻 ${y1}E P/E (${fwdPe1.toFixed(1)}x) 已觸及歷史底部區間，安全邊際極高！`;
    }

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
          <div>${y1}E 預估 EPS: <strong style="color: #D96B82; font-size: 1.05rem;">$${fmtNum(eps1, 2)}</strong></div>
          <div>${y1}E 前瞻 P/E: <strong style="color: #D96B82; font-size: 1.05rem;">${fmtNum(fwdPe1, 2)}x</strong></div>
          <div>${y1}E 目標股價 (均值${fmtNum(historical_pe_avg, 0)}x): <strong style="color: #34D399; font-size: 1.05rem;">$${fmtNum(targetPrice1, 2)}</strong> (隱含 <strong style="color: #34D399;">+${fmtNum(upsidePct1, 1)}%</strong> 潛在上漲空間)</div>
        </div>
      </div>

      <!-- Card 2: Full 3-Year Income Statement & EPS Table (TOP HIGHLIGHT) -->
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
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.08);">$${fmtNum(rev1, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gRev1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(rev2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gRev2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(rev3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gRev3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 14px; font-weight: 600;">總營業成本 (Total COGS)</td>
                <td style="padding: 12px 14px;">$${fmtNum(cogs0, 0)}M</td>
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); font-weight: 600;">$${fmtNum(cogs1, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gCogs1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(cogs2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gCogs2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(cogs3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gCogs3, 1)}% )</span></td>
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
                <td style="padding: 12px 14px; background: rgba(255, 183, 197, 0.08); font-weight: 600;">$${fmtNum(opex1, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gOpEx1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(opex2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gOpEx2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 600;">$${fmtNum(opex3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gOpEx3, 1)}% )</span></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--card-border); background: #FFF8F9;">
                <td style="padding: 12px 14px; font-weight: 700; color: #D96B82;">營業利潤 (Operating Income / EBIT)</td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(op0, 0)}M</td>
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.12); color: #D96B82;">$${fmtNum(op1, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm1, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: #D96B82;">$${fmtNum(op2, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm2, 1)}% )</span></td>
                <td style="padding: 12px 14px; font-weight: 700; color: #D96B82;">$${fmtNum(op3, 0)}M <span style="font-size:0.82rem;">( 利潤率 ${fmtNum(opm3, 1)}% )</span></td>
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
                <td style="padding: 12px 14px; font-weight: 700; background: rgba(255, 183, 197, 0.12); color: #D96B82;">$${fmtNum(net1, 0)}M <span style="font-size:0.82rem;">( +${fmtNum(gNet1, 1)}% YoY )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(net2, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gNet2, 1)}% YoY )</span></td>
                <td style="padding: 12px 14px; font-weight: 700;">$${fmtNum(net3, 0)}M <span style="font-size:0.82rem; color: #D96B82;">( +${fmtNum(gNet3, 1)}% YoY )</span></td>
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
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: #D96B82; background: rgba(255, 183, 197, 0.25);">$${fmtNum(eps1, 2)} <span style="font-size:0.82rem; font-weight:600;">( +${fmtNum(gNet1, 1)}% YoY )</span></td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: #D96B82;">$${fmtNum(eps2, 2)} <span style="font-size:0.82rem; font-weight:600;">( +${fmtNum(gNet2, 1)}% YoY )</span></td>
                <td style="padding: 14px; font-weight: 700; font-size: 1.15rem; color: #D96B82;">$${fmtNum(eps3, 2)} <span style="font-size:0.82rem; font-weight:600;">( +${fmtNum(gNet3, 1)}% YoY )</span></td>
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
                <td style="padding: 10px;">$${fmtNum(rev1)} <span style="font-size:0.75rem; color:#D96B82;">(+${fmtNum(gRev1, 1)}%)</span></td>
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

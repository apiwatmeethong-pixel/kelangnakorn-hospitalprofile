  // วาง URL ของ GAS Web App ที่ลงท้ายด้วย /exec ตรงนี้เพียงจุดเดียว
  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwJgo1QtiDFm18MQctJD3DQW5yrLT13XVsmPNQIRT_DSh0HxRmK5n084Qv3ER-FW-I/exec';
  const API_TOKEN_KEY = 'hospitalApiToken';
  const API_USER_KEY = 'hospitalCurrentUser';

  async function apiRequest(action, payload = {}, method = 'POST') {
    if (!GAS_API_URL || GAS_API_URL.includes('PASTE_YOUR')) {
      throw new Error('กรุณาใส่ URL ของ GAS Web App ในตัวแปร GAS_API_URL');
    }

    const token = sessionStorage.getItem(API_TOKEN_KEY) || '';
    let response;
    if (method === 'GET') {
      const url = new URL(GAS_API_URL);
      url.search = new URLSearchParams({ action, token, ...payload }).toString();
      response = await fetch(url.toString(), { redirect: 'follow' });
    } else {
      response = await fetch(GAS_API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...payload })
      });
    }

    if (!response.ok) throw new Error(`เชื่อมต่อ API ไม่สำเร็จ (${response.status})`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'API ทำงานไม่สำเร็จ');
    return result;
  }

  async function loadAllDatabase() {
    const result = await apiRequest('getAllDatabase', {}, 'GET');
    const allRes = result.data || {};
    hospitalData = allRes.hospital || [];
    moneyData = allRes.money || [];
    ncdData = allRes.ncd || [];
    cdData = allRes.cd || [];
    settingsData = allRes.settings || [];
    return allRes;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function togglePassword() {
    const passInput = document.getElementById('admin-pass');
    const eyeIcon = document.getElementById('eyeIcon');
    if (!passInput || !eyeIcon) return;
    const shouldShow = passInput.type === 'password';
    passInput.type = shouldShow ? 'text' : 'password';
    eyeIcon.classList.toggle('bi-eye', shouldShow);
    eyeIcon.classList.toggle('bi-eye-slash', !shouldShow);
  }

  // 1. ประกาศตัวแปรทั้งหมด (เหมือนเดิม)
  let hospitalData = [], moneyData = [], ncdData = [], cdData = [], settingsData = [];
  let popChartObj = null, genderChartObj = null, detailGenderChartObj = null, detailRatioChartObj = null, moneyChartObj = null;
  let ncdBarChartObj = null, ncdPieChartObj = null;
  let cdLineChartObj = null, cdBarChartObj = null;
  let isAuthenticated = false; 
  let currentUser = null; 
  let manageCurrentPage = 1; 
  const managePageSize = 30;

  // 2. โหลดข้อมูลทั้งหมดเมื่อเปิดเว็บ
  document.addEventListener("DOMContentLoaded", async function() {
    try {
      switchView('dashboard');
    } catch(e) { console.warn("Initial view switch warm-up:", e); }

    try {
      const savedUser = sessionStorage.getItem(API_USER_KEY);
      if (savedUser) {
        currentUser = JSON.parse(savedUser);
        isAuthenticated = Boolean(sessionStorage.getItem(API_TOKEN_KEY));
      }
      await loadAllDatabase();
      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';
      initApp();
      if (isAuthenticated && currentUser) {
        const loginMenuBtn = document.getElementById('menu-login-btn');
        if (loginMenuBtn) loginMenuBtn.style.display = 'none';
        document.querySelectorAll('.admin-menu').forEach(el => el.style.display = 'block');
        setupRolePermissions();
      }
    } catch (err) {
      console.error("โหลดข้อมูลจาก Google Sheets ล้มเหลว:", err);
      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';
      alert(err.message || "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณารีเฟรชหน้าจออีกครั้ง");
    }
  });

  // 3. ระบบควบคุม UI และเมนู
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mainContent = document.getElementById('mainContent');

    if (window.innerWidth <= 768) {
      if (sidebar) sidebar.classList.toggle('show');
      if (overlay) overlay.classList.toggle('show');
    } else {
      if (sidebar) sidebar.classList.toggle('collapsed');
      if (mainContent) mainContent.classList.toggle('expanded');
    }
  }

  function switchView(viewId, navEl) {
    try {
      const sections = document.querySelectorAll('.view-section');
      if (sections.length > 0) {
        sections.forEach(el => el.style.display = 'none');
      } else {
        document.querySelectorAll('[id$="-view"]').forEach(el => el.style.display = 'none');
      }

      const targetView = document.getElementById(viewId) || document.getElementById(viewId + '-view') || document.getElementById('view-' + viewId);
      if (targetView) {
        targetView.style.display = 'block';
      } else {
        console.warn("ไม่พบกล่องหน้าจอ ID: " + viewId + " ในไฟล์ HTML");
      }

      document.querySelectorAll('.nav-link, .sidebar-menu a').forEach(el => {
        if(el.classList) el.classList.remove('active');
      });

      if (navEl && navEl.classList) {
        navEl.classList.add('active');
      } else {
        const autoNav = document.querySelector(`[onclick*="${viewId}"]`);
        if (autoNav && autoNav.classList) {
          autoNav.classList.add('active');
        }
      }
    } catch(err) {
      console.error("Error in switchView:", err);
    }
  }

  function initApp() {
    try { renderDashboard(hospitalData); } catch(e) { console.error("Dashboard Render Crash:", e); }
    
    try {
      const selector = document.getElementById('hos-selector');
      const ncdSelector = document.getElementById('ncd-hos-selector');
      const cdSelector = document.getElementById('cd-hos-selector');
      const formSelector = document.getElementById('input-hos'); 
      const manageHosSelector = document.getElementById('manage-hos-selector'); 
      
      if (selector) selector.innerHTML = ""; 
      if (ncdSelector) ncdSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>';
      if (cdSelector) cdSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>';
      if (manageHosSelector) manageHosSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>'; 
      if (formSelector) formSelector.innerHTML = '<option value="" selected disabled>-- เลือกหน่วยบริการ --</option>';
      
      if (hospitalData && hospitalData.length > 0) {
        hospitalData.forEach((row, index) => {
          if (selector) {
            let option = new Option(row['ศบส.'], index);
            if(row['ศบส.'] === 'ศบส.บ้านโทกหัวช้าง') option.selected = true;
            selector.appendChild(option);
          }
          
          let hosNameText = row['Hospital'] || row['ศบส.'];
          if (ncdSelector) ncdSelector.appendChild(new Option(row['ศบส.'], hosNameText));
          if (cdSelector) cdSelector.appendChild(new Option(row['ศบส.'], hosNameText));
          if (formSelector) formSelector.appendChild(new Option(row['ศบส.'], hosNameText));
          if (manageHosSelector) manageHosSelector.appendChild(new Option(row['ศบส.'], hosNameText)); 
        });
      }
    } catch(e) { console.error("Selectors Population Crash:", e); }
    
    try { renderMoneyView(); } catch(e) { console.error("Money View Crash:", e); }
    try { updateDetailView(); } catch(e) { console.error("Detail View Crash:", e); }
    try { updateNcdView(); } catch(e) { console.error("NCD View Crash:", e); }
    try { updateCdView(); } catch(e) { console.error("CD View Crash:", e); }
    try { renderManageTable(); } catch(e) { console.error("Manage Table Crash:", e); }

    try {
      switchView('dashboard', document.querySelector('.nav-link.active'));
    } catch(e) { switchView('dashboard'); }
  }

  const cleanNum = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;

  // ฟังก์ชันแสดงผลภาพรวม (Dashboard) ฯลฯ ... (ใช้โค้ดเดิมทั้งหมด)
  function renderDashboard(data) {
    if (!data || data.length === 0) return;
    let totalPop = 0, totalMale = 0, totalFemale = 0;
    let totalVillages = 0, totalHouses = 0, totalStaff = 0, totalVhv = 0, totalSupport = 0;
    data.forEach(row => {
      totalPop += cleanNum(row['ประชากร']); totalMale += cleanNum(row['ชาย']);      
      totalFemale += cleanNum(row['หญิง']); totalVillages += cleanNum(row['หมู่บ้าน/ชุมชน']);
      totalHouses += cleanNum(row['หลังคาเรือน']); totalStaff += cleanNum(row['บุคลากร']);
      totalVhv += cleanNum(row['อสม.']); totalSupport += cleanNum(row['บุคลากรสนับสนุน']);
    });
    if(document.getElementById('dash-pop')) document.getElementById('dash-pop').innerText = totalPop.toLocaleString();
    if(document.getElementById('dash-village')) document.getElementById('dash-village').innerText = totalVillages.toLocaleString();
    if(document.getElementById('dash-house')) document.getElementById('dash-house').innerText = totalHouses.toLocaleString();
    if(document.getElementById('dash-staff')) document.getElementById('dash-staff').innerText = totalStaff.toLocaleString();
    if(document.getElementById('dash-vhv')) document.getElementById('dash-vhv').innerText = totalVhv.toLocaleString();
    if(document.getElementById('dash-support')) document.getElementById('dash-support').innerText = totalSupport.toLocaleString();

    const genderCanvas = document.getElementById('genderChart');
    if (genderCanvas) {
      if(genderChartObj) genderChartObj.destroy();
      genderChartObj = new Chart(genderCanvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['ชาย', 'หญิง'], datasets: [{ data: [totalMale, totalFemale], backgroundColor: ['#64B5F6', '#F48FB1'], borderWidth: 0 }] },
        plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' }, datalabels: { color: '#ffffff', font: { weight: 'bold', size: 12 }, textAlign: 'center', formatter: (value, ctx) => { if (value === 0) return null; let sum = 0; let dataArr = ctx.chart.data.datasets[0].data; dataArr.map(data => { sum += data; }); let percentage = (value * 100 / sum).toFixed(1) + "%"; return value.toLocaleString() + '\n(' + percentage + ')'; } } } }
      });
    }

    let hosLabels = [], hosPopData = [];
    data.forEach(row => {
      let hosName = row['ศบส.'] ? row['ศบส.'].toString().trim() : '';
      if (hosName !== 'ศบส.เขลางค์นคร' && hosName !== '') { hosLabels.push(hosName); hosPopData.push(cleanNum(row['ประชากร'])); }
    });

    const popCanvas = document.getElementById('popChart');
    if (popCanvas) {
      if(popChartObj) popChartObj.destroy();
      popChartObj = new Chart(popCanvas.getContext('2d'), {
        type: 'bar',
        data: { labels: hosLabels, datasets: [{ label: 'ประชากร (คน)', data: hosPopData, backgroundColor: '#81C784', borderRadius: 4 }] },
        plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 25 } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { color: '#333333', font: { weight: 'bold', size: 11 }, anchor: 'end', align: 'top', formatter: (value) => value > 0 ? value.toLocaleString() : '' } } }
      });
    }

    const propChartCtx = document.getElementById('hosPropChart');
    if (propChartCtx) {
      if(typeof hosPropChartObj !== 'undefined' && hosPropChartObj) hosPropChartObj.destroy();
      hosPropChartObj = new Chart(propChartCtx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: hosLabels, datasets: [{ data: hosPopData, backgroundColor: ['#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#F48FB1', '#A5D6A7', '#FFE082', '#9FA8DA'], borderWidth: 1 }] },
        plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } }, datalabels: { color: '#ffffff', font: { weight: 'bold', size: 11 }, textAlign: 'center', formatter: (value, ctx) => { if (value === 0) return null; let sum = 0; let dataArr = ctx.chart.data.datasets[0].data; dataArr.map(data => { sum += data; }); return (value * 100 / sum).toFixed(1) + "%"; } } } }
      });
    }
  }

  function updateDetailView() {
    const selector = document.getElementById('hos-selector');
    if(!selector || selector.selectedIndex < 0) return;
    const selectedData = hospitalData[selector.options[selector.selectedIndex].value];
    if(!selectedData) return;

    let hosMale = cleanNum(selectedData['ชาย']), hosFemale = cleanNum(selectedData['หญิง']), hosSupport = cleanNum(selectedData['บุคลากรสนับสนุน']);
    if(document.getElementById('detail-pop')) document.getElementById('detail-pop').innerText = cleanNum(selectedData['ประชากร']).toLocaleString();
    if(document.getElementById('detail-house')) document.getElementById('detail-house').innerText = cleanNum(selectedData['หลังคาเรือน']).toLocaleString();
    if(document.getElementById('detail-village')) document.getElementById('detail-village').innerText = cleanNum(selectedData['หมู่บ้าน/ชุมชน']).toLocaleString();
    if(document.getElementById('detail-staff')) document.getElementById('detail-staff').innerText = cleanNum(selectedData['บุคลากร']).toLocaleString();
    if(document.getElementById('detail-vhv')) document.getElementById('detail-vhv').innerText = cleanNum(selectedData['อสม.']).toLocaleString();
    if(document.getElementById('detail-support')) document.getElementById('detail-support').innerText = hosSupport.toLocaleString();

    let pop = cleanNum(selectedData['ประชากร']), house = cleanNum(selectedData['หลังคาเรือน']), vhv = cleanNum(selectedData['อสม.']), staff = cleanNum(selectedData['บุคลากร']);
    let vhvRatio = vhv > 0 ? Math.round(house / vhv) : 0, staffRatio = staff > 0 ? Math.round(pop / staff) : 0; 
    if(document.getElementById('ratio-vhv')) document.getElementById('ratio-vhv').innerText = vhv > 0 ? "1 : " + vhvRatio.toLocaleString() : "N/A";
    if(document.getElementById('ratio-staff')) document.getElementById('ratio-staff').innerText = staff > 0 ? "1 : " + staffRatio.toLocaleString() : "N/A";

    const detailGenderCanvas = document.getElementById('detailGenderChart');
    if (detailGenderCanvas) {
      if(detailGenderChartObj) detailGenderChartObj.destroy();
      detailGenderChartObj = new Chart(detailGenderCanvas.getContext('2d'), {
        type: 'doughnut', data: { labels: ['ชาย', 'หญิง'], datasets: [{ data: [hosMale, hosFemale], backgroundColor: ['#64B5F6', '#F48FB1'], borderWidth: 0 }] }, plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' }, datalabels: { color: '#ffffff', font: { weight: 'bold', size: 12 }, textAlign: 'center', formatter: (value, ctx) => { if (value === 0) return null; let sum = 0; let dataArr = ctx.chart.data.datasets[0].data; dataArr.map(data => { sum += data; }); return value.toLocaleString() + '\n(' + ((value * 100 / sum).toFixed(1) + "%") + ')'; } } } }
      });
    }

    const detailRatioCanvas = document.getElementById('detailRatioChart');
    if (detailRatioCanvas) {
      if(detailRatioChartObj) detailRatioChartObj.destroy();
      detailRatioChartObj = new Chart(detailRatioCanvas.getContext('2d'), {
        type: 'bar', data: { labels: ['ภาระงาน อสม. 1 คน\n(ดูแลหลังคาเรือน)', 'ภาระงานบุคลากร 1 คน\n(ดูแลประชากร)'], datasets: [{ label: 'สัดส่วนความรับผิดชอบ', data: [vhvRatio, staffRatio], backgroundColor: ['#FFB74D', '#BA68C8'], borderRadius: 4 }] }, plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 30 } }, scales: { y: { display: false, beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { color: '#333333', font: { weight: 'bold', size: 14 }, anchor: 'end', align: 'top', formatter: (value, ctx) => { if (value === 0) return 'N/A'; let isVhv = ctx.dataIndex === 0; let unit = isVhv ? ' หลังคาเรือน' : ' คน'; return '1 : ' + value.toLocaleString() + unit; } } } }
      });
    }
  }

  function renderMoneyView() {
    if (!moneyData || moneyData.length === 0) return;
    let moneyMatrix = {}, grandTotalPlan = 0, grandTotalSpent = 0;
    moneyData.forEach(row => {
      let hosName = row['Hospital'] || row['ศบส.'], type = row['รายการ'], rawAmount = row['วงเงินทั้งปี'] || row['จำนวนเงิน'] || row['จำนวน'];
      if (!hosName || !type) return;
      hosName = hosName.toString().trim(); let typeStr = type.toString().trim();
      let amount = 0; if (rawAmount) { amount = parseFloat(rawAmount.toString().replace(/,/g, '').replace(/"/g, '')) || 0; }
      if (!moneyMatrix[hosName]) moneyMatrix[hosName] = { plan: 0, spent: 0 };
      if (typeStr === 'แผนจ่ายเงิน') { moneyMatrix[hosName].plan += amount; grandTotalPlan += amount; } else if (typeStr.includes('รวมจ่ายเดือน')) { moneyMatrix[hosName].spent += amount; grandTotalSpent += amount; }
    });

    let grandRate = grandTotalPlan > 0 ? (grandTotalSpent / grandTotalPlan) * 100 : 0;
    if(document.getElementById('money-budget')) document.getElementById('money-budget').innerText = grandTotalPlan.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if(document.getElementById('money-spent')) document.getElementById('money-spent').innerText = grandTotalSpent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if(document.getElementById('money-rate')) document.getElementById('money-rate').innerText = grandRate.toFixed(2) + "%";

    let chartLabels = [], chartData = [], chartColors = [], sortedHospitals = Object.keys(moneyMatrix).sort();
    sortedHospitals.forEach(hos => {
      chartLabels.push(hos); let plan = moneyMatrix[hos].plan, spent = moneyMatrix[hos].spent, rate = plan > 0 ? (spent / plan) * 100 : 0;
      chartData.push(parseFloat(rate.toFixed(1))); chartColors.push(rate >= 80 ? '#4CAF50' : '#FF9800'); 
    });

    const chartCtx = document.getElementById('moneyChart');
    if (chartCtx) {
      if(moneyChartObj) moneyChartObj.destroy();
      moneyChartObj = new Chart(chartCtx.getContext('2d'), {
        type: 'bar', data: { labels: chartLabels, datasets: [{ label: 'ร้อยละการเบิกจ่าย', data: chartData, backgroundColor: chartColors, borderRadius: 4 }] }, plugins: [ChartDataLabels],
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 30 } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'ร้อยละ (%)' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { color: '#333', anchor: 'end', align: 'top', font: { weight: 'bold', size: 12 }, formatter: (value) => value.toFixed(1) + '%' }, annotation: { annotations: { lineTarget: { type: 'line', yMin: 80, yMax: 80, borderColor: 'red', borderWidth: 2, borderDash: [5, 5], label: { content: 'เป้าหมาย 80%', display: true, position: 'end', backgroundColor: 'rgba(255, 0, 0, 0.8)', color: 'white' } } } } } }
      });
    }

    const tHead = document.getElementById('money-table-head'), tBody = document.getElementById('money-table-body');
    if (tHead && tBody) {
      tHead.innerHTML = `<tr><th class="text-start bg-light" style="min-width: 180px;">หน่วยบริการ</th><th class="bg-light text-end">เงินบำรุงทั้งปี (บาท)</th><th class="bg-light text-end">เบิกจ่ายสะสม (บาท)</th><th class="bg-light text-end">งบประมาณคงเหลือ (บาท)</th><th class="bg-light text-center" style="width: 150px;">ร้อยละ</th></tr>`;
      tBody.innerHTML = '';
      sortedHospitals.forEach(hos => {
        let plan = moneyMatrix[hos].plan, spent = moneyMatrix[hos].spent, remaining = plan - spent, rate = plan > 0 ? (spent / plan) * 100 : 0;
        let badgeColor = rate >= 80 ? 'bg-success' : 'bg-warning text-dark';
        tBody.innerHTML += `<tr><td class="text-start fw-medium"><i class="bi bi-hospital me-2"></i>${escapeHtml(hos)}</td><td class="text-end">${plan.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-end text-danger">${spent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-end text-success fw-medium">${remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-center"><span class="badge ${badgeColor} rounded-pill font-monospace" style="font-size: 0.85rem; padding: 0.4em 0.8em;">${rate.toFixed(2)}%</span></td></tr>`;
      });
      let grandRemaining = grandTotalPlan - grandTotalSpent;
      tBody.innerHTML += `<tr class="table-dark fw-bold"><td class="text-start">รวมทุกศูนย์บริการฯ</td><td class="text-end">${grandTotalPlan.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-end" style="color: #FF8A80;">${grandTotalSpent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-end" style="color: #6EE7B7;">${grandRemaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td class="text-center" style="color: #6EE7B7;">${grandRate.toFixed(2)}%</td></tr>`;
    }
  }

  function updateNcdView() {
    const selectorEl = document.getElementById('ncd-hos-selector'); const selectedHos = selectorEl ? selectorEl.value : 'all';
    const isRateMode = document.getElementById('ncd-mode-rate') ? document.getElementById('ncd-mode-rate').checked : false; const rateMultiplier = 100000; 

    let latestOldCases = {}, totalNewCases = {}, uniqueDiseases = new Set(), tableMatrix = {}, allHospitalsSet = new Set();
    ncdData.forEach(row => {
      let hosName = row['Hospital'], disease = row['รายการหลัก'], type = row['รายการย่อย'], count = cleanNum(row['จำนวน']);
      if (!hosName || !disease) return;
      uniqueDiseases.add(disease); allHospitalsSet.add(hosName);
      if (!tableMatrix[hosName]) tableMatrix[hosName] = { name: hosName, data: {}, total: 0 };
      if (!tableMatrix[hosName].data[disease]) tableMatrix[hosName].data[disease] = { old: 0, new: 0 };
      if (type === 'รายเก่า') { if (count > tableMatrix[hosName].data[disease].old) tableMatrix[hosName].data[disease].old = count; } else if (type === 'รายใหม่') { tableMatrix[hosName].data[disease].new += count; }
      if (selectedHos !== 'all' && hosName !== selectedHos) return;
      let key = hosName + "_" + disease;
      if (type === 'รายเก่า') { if (!latestOldCases[key] || count > latestOldCases[key]) latestOldCases[key] = count; } else if (type === 'รายใหม่') { totalNewCases[key] = (totalNewCases[key] || 0) + count; }
    });

    let selectedScopePop = 0;
    if (selectedHos === 'all') { hospitalData.forEach(h => selectedScopePop += cleanNum(h['ประชากร'])); } else { let found = hospitalData.find(h => (h['ศบส.'] === selectedHos || h['Hospital'] === selectedHos)); selectedScopePop = found ? cleanNum(found['ประชากร']) : 0; }

    let ncdSummary = {}; uniqueDiseases.forEach(d => { ncdSummary[d] = { old: 0, new: 0 }; });
    for (let key in latestOldCases) { let dKey = key.split("_")[1]; if(ncdSummary[dKey]) ncdSummary[dKey].old += latestOldCases[key]; }
    for (let key in totalNewCases) { let dKey = key.split("_")[1]; if(ncdSummary[dKey]) ncdSummary[dKey].new += totalNewCases[key]; }
    let sortedChartData = Object.keys(ncdSummary).map(d => { return { disease: d, old: ncdSummary[d].old, new: ncdSummary[d].new, total: ncdSummary[d].old + ncdSummary[d].new }; }).sort((a, b) => b.total - a.total);

    const cardsContainer = document.getElementById('ncd-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = ''; const textColors = ['#1976D2', '#C2185B', '#F57C00', '#388E3C', '#7B1FA2', '#0097A7', '#FFA000', '#D84315'];
      sortedChartData.forEach((item, index) => {
        let displayVal = isRateMode ? ((item.total / (selectedScopePop || 1)) * rateMultiplier).toFixed(2) : item.total.toLocaleString(); let unitLabel = isRateMode ? "ต่อแสนประชากร" : "ราย";
        cardsContainer.innerHTML += `<div class="col-6 col-md-3 mb-3"><div class="data-card text-center" style="background-color: #F8FAFC; border-bottom: 4px solid ${textColors[index % textColors.length]}; height: 100%;"><h6 class="text-muted small">${escapeHtml(item.disease)}</h6><h3 class="fw-bold mb-1" style="color: ${textColors[index % textColors.length]};">${displayVal}</h3><span class="badge bg-light text-secondary rounded-pill font-monospace" style="font-size:0.75rem;">${unitLabel}</span></div></div>`;
      });
    }

    let chartLabels = sortedChartData.map(i => i.disease);
    let chartOldValues = sortedChartData.map(i => isRateMode ? parseFloat(((i.old / (selectedScopePop || 1)) * rateMultiplier).toFixed(2)) : i.old);
    let chartNewValues = sortedChartData.map(i => isRateMode ? parseFloat(((i.new / (selectedScopePop || 1)) * rateMultiplier).toFixed(2)) : i.new);
    let chartTotalValues = sortedChartData.map(i => isRateMode ? parseFloat(((i.total / (selectedScopePop || 1)) * rateMultiplier).toFixed(2)) : i.total);

    const ncdBarCanvas = document.getElementById('ncdBarChart');
    if (ncdBarCanvas) {
      if(ncdBarChartObj) ncdBarChartObj.destroy();
      ncdBarChartObj = new Chart(ncdBarCanvas.getContext('2d'), { type: 'bar', data: { labels: chartLabels, datasets: [ { label: isRateMode ? 'อัตราผู้ป่วยสะสม (รายเก่า)' : 'ผู้ป่วยสะสม (รายเก่า)', data: chartOldValues, backgroundColor: '#90CAF9', borderRadius: 4 }, { label: isRateMode ? 'อัตราผู้ป่วยรายใหม่' : 'ผู้ป่วยรายใหม่', data: chartNewValues, backgroundColor: '#F48FB1', borderRadius: 4 } ] }, plugins: [ChartDataLabels], options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 25 } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { datalabels: { color: '#333333', font: { weight: 'bold', size: 10 }, anchor: 'end', align: 'top', formatter: (value) => { if (value === 0) return ''; return isRateMode ? value.toFixed(2) : value.toLocaleString(); } } } } });
    }

    const ncdPieCanvas = document.getElementById('ncdPieChart');
    if (ncdPieCanvas) {
      if(ncdPieChartObj) ncdPieChartObj.destroy();
      ncdPieChartObj = new Chart(ncdPieCanvas.getContext('2d'), { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartTotalValues, backgroundColor: ['#90CAF9', '#F48FB1', '#FFCC80', '#A5D6A7', '#CE93D8', '#80DEEA', '#FFE082', '#FFAB91'], borderWidth: 1 }] }, plugins: [ChartDataLabels], options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' }, datalabels: { color: '#333333', font: { weight: 'bold', size: 11 }, textAlign: 'center', display: function(ctx) { let value = ctx.dataset.data[ctx.dataIndex]; if (value === 0) return false; let sum = 0; ctx.dataset.data.forEach(data => { sum += data; }); return ((value * 100) / sum) >= 5; }, formatter: (value, ctx) => { if (value === 0) return null; let sum = 0; let dataArr = ctx.chart.data.datasets[0].data; dataArr.forEach(data => { sum += data; }); let percentage = (value * 100 / sum).toFixed(1) + "%"; let displayVal = isRateMode ? value.toFixed(2) : value.toLocaleString(); return displayVal + '\n(' + percentage + ')'; } } } } });
    }

    const tHead = document.getElementById('ncd-table-head'), tBody = document.getElementById('ncd-table-body');
    if (!tHead || !tBody) return;

    let finalHosList = [], diseaseTotalMap = {}; uniqueDiseases.forEach(d => diseaseTotalMap[d] = 0);
    for (let hos in tableMatrix) { let hosTotal = 0; for (let d in tableMatrix[hos].data) { let sum = tableMatrix[hos].data[d].old + tableMatrix[hos].data[d].new; hosTotal += sum; diseaseTotalMap[d] += sum; } tableMatrix[hos].total = hosTotal; finalHosList.push(tableMatrix[hos]); }
    finalHosList.sort((a, b) => b.total - a.total); let sortedDiseases = Array.from(uniqueDiseases).sort((a, b) => diseaseTotalMap[b] - diseaseTotalMap[a]);

    let theadHTML = `<tr><th class="text-start bg-light" style="min-width: 180px;">หน่วยบริการ</th>`; sortedDiseases.forEach(d => { theadHTML += `<th class="bg-light">${escapeHtml(d)}</th>`; }); theadHTML += `<th class="bg-dark text-white">${isRateMode ? 'อัตรารวม' : 'รวมทุกโรค'}</th></tr>`; tHead.innerHTML = theadHTML;
    tBody.innerHTML = '';
    finalHosList.forEach(hosObj => {
      let tr = document.createElement('tr'); tr.style.cursor = 'pointer'; if (hosObj.name === selectedHos) tr.classList.add('table-primary');
      tr.onclick = function() { if(document.getElementById('ncd-hos-selector')) document.getElementById('ncd-hos-selector').value = hosObj.name; updateNcdView(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      let foundHosInfo = hospitalData.find(h => (h['ศบส.'] === hosObj.name || h['Hospital'] === hosObj.name)); let hosPopulation = foundHosInfo ? cleanNum(foundHosInfo['ประชากร']) : 0;
      let maxInRowVal = 0; sortedDiseases.forEach(d => { let val = (hosObj.data[d] ? hosObj.data[d].old + hosObj.data[d].new : 0); if (val > maxInRowVal) maxInRowVal = val; });
      let tdHTML = `<td class="text-start fw-medium"><i class="bi bi-hospital me-2"></i>${escapeHtml(hosObj.name)}</td>`;
      sortedDiseases.forEach(d => { let val = (hosObj.data[d] ? hosObj.data[d].old + hosObj.data[d].new : 0); let cellDisplay = isRateMode ? ((val / (hosPopulation || 1)) * rateMultiplier).toFixed(2) : val.toLocaleString(); let highlightStyle = (val === maxInRowVal && val > 0) ? 'class="fw-bold text-primary" style="background-color: #E0F2FE;"' : ''; tdHTML += `<td ${highlightStyle}>${cellDisplay}</td>`; });
      let hosTotalDisplay = isRateMode ? ((hosObj.total / (hosPopulation || 1)) * rateMultiplier).toFixed(2) : hosObj.total.toLocaleString(); tdHTML += `<td class="fw-bold bg-light">${hosTotalDisplay}</td>`; tr.innerHTML = tdHTML; tBody.appendChild(tr);
    });

    let totalTerritoryPop = 0; hospitalData.forEach(h => totalTerritoryPop += cleanNum(h['ประชากร']));
    let trFoot = document.createElement('tr'); trFoot.className = 'table-dark fw-bold'; let footHTML = `<td class="text-start">ยอดรวมทุกแห่ง (ภาพรวม)</td>`; let grandTotalCases = 0;
    sortedDiseases.forEach(d => { let diseaseSumCases = diseaseTotalMap[d]; grandTotalCases += diseaseSumCases; let footCellDisplay = isRateMode ? ((diseaseSumCases / (totalTerritoryPop || 1)) * rateMultiplier).toFixed(2) : diseaseSumCases.toLocaleString(); footHTML += `<td>${footCellDisplay}</td>`; });
    let grandTotalDisplay = isRateMode ? ((grandTotalCases / (totalTerritoryPop || 1)) * rateMultiplier).toFixed(2) : grandTotalCases.toLocaleString(); footHTML += `<td style="color: #6EE7B7;">${grandTotalDisplay}</td>`; trFoot.innerHTML = footHTML;
    trFoot.onclick = function() { if(document.getElementById('ncd-hos-selector')) document.getElementById('ncd-hos-selector').value = 'all'; updateNcdView(); window.scrollTo({ top: 0, behavior: 'smooth' }); }; tBody.appendChild(trFoot);
  }

  function updateCdView() {
    const selectorEl = document.getElementById('cd-hos-selector'); const selectedHos = selectorEl ? selectorEl.value : 'all';
    const isRateMode = document.getElementById('cd-mode-rate') ? document.getElementById('cd-mode-rate').checked : false; const rateMultiplier = 100000; 
    let summary = {}, trendData = {}, monthsSet = new Set(), tableMatrix = {}, uniqueDiseases = new Set(), diseaseTotalMap = {};

    cdData.forEach(row => {
      let hosName = row['Hospital'], disease = row['โรคติดต่อ'], month = row['เดือน'], count = cleanNum(row['จำนวน']);
      if (!hosName || !disease) return;
      uniqueDiseases.add(disease);
      if (!tableMatrix[hosName]) tableMatrix[hosName] = { name: hosName, data: {}, total: 0 };
      if (!tableMatrix[hosName].data[disease]) tableMatrix[hosName].data[disease] = 0;
      tableMatrix[hosName].data[disease] += count;
      if (selectedHos !== 'all' && hosName !== selectedHos) return;
      if (!summary[disease]) summary[disease] = 0; summary[disease] += count;
      if (month) { monthsSet.add(month); if (!trendData[month]) trendData[month] = {}; if (!trendData[month][disease]) trendData[month][disease] = 0; trendData[month][disease] += count; }
    });

    let selectedScopePop = 0;
    if (selectedHos === 'all') { hospitalData.forEach(h => selectedScopePop += cleanNum(h['ประชากร'])); } else { let found = hospitalData.find(h => (h['ศบส.'] === selectedHos || h['Hospital'] === selectedHos)); selectedScopePop = found ? cleanNum(found['ประชากร']) : 0; }
    let sortedDiseasesForCards = Object.keys(summary).map(d => { return { disease: d, total: summary[d] }; }).sort((a, b) => b.total - a.total);
    
    const cardsContainer = document.getElementById('cd-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = ''; const textColors = ['#C2185B', '#F57C00', '#388E3C', '#1976D2', '#7B1FA2', '#0097A7', '#FFA000', '#D84315'];
      sortedDiseasesForCards.forEach((item, index) => {
        let displayVal = isRateMode ? ((item.total / (selectedScopePop || 1)) * rateMultiplier).toFixed(2) : item.total.toLocaleString(); let unitLabel = isRateMode ? "ต่อแสนประชากร" : "ราย";
        cardsContainer.innerHTML += `<div class="col-6 col-md-3 mb-3"><div class="data-card text-center" style="background-color: #F8FAFC; border-bottom: 4px solid ${textColors[index % textColors.length]}; height: 100%;"><h6 class="text-muted small">${escapeHtml(item.disease)}</h6><h3 class="fw-bold mb-1" style="color: ${textColors[index % textColors.length]};">${displayVal}</h3><span class="badge bg-light text-secondary rounded-pill font-monospace" style="font-size:0.75rem;">${unitLabel}</span></div></div>`;
      });
    }

    const chartLabels = sortedDiseasesForCards.map(item => item.disease); const chartDataArray = sortedDiseasesForCards.map(item => isRateMode ? parseFloat(((item.total / (selectedScopePop || 1)) * rateMultiplier).toFixed(2)) : item.total);
    const cdBarCanvas = document.getElementById('cdBarChart');
    if (cdBarCanvas) {
      if (cdBarChartObj) cdBarChartObj.destroy();
      cdBarChartObj = new Chart(cdBarCanvas.getContext('2d'), { type: 'bar', data: { labels: chartLabels, datasets: [{ label: isRateMode ? 'อัตราป่วยสะสม' : 'จำนวนผู้ป่วยสะสม', data: chartDataArray, backgroundColor: '#FFAB91', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } } });
    }

    let sortedMonths = Array.from(monthsSet).sort((a, b) => { let [mA, yA] = a.split('/'); let [mB, yB] = b.split('/'); return new Date(yA, mA - 1) - new Date(yB, mB - 1); });
    const textColors = ['#C2185B', '#F57C00', '#388E3C', '#1976D2', '#7B1FA2', '#0097A7', '#FFA000', '#D84315'];
    let lineDatasets = sortedDiseasesForCards.map((item, index) => {
      let dataPts = sortedMonths.map(m => { let rawCount = trendData[m] && trendData[m][item.disease] ? trendData[m][item.disease] : 0; return isRateMode ? parseFloat(((rawCount / (selectedScopePop || 1)) * rateMultiplier).toFixed(2)) : rawCount; }); let color = textColors[index % textColors.length]; return { label: item.disease, data: dataPts, borderColor: color, backgroundColor: color, tension: 0.3, fill: false, borderWidth: 2, pointRadius: 4 };
    });

    const cdLineCanvas = document.getElementById('cdLineChart');
    if (cdLineCanvas) {
      if (cdLineChartObj) cdLineChartObj.destroy();
      cdLineChartObj = new Chart(cdLineCanvas.getContext('2d'), { type: 'line', data: { labels: sortedMonths, datasets: lineDatasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { y: { beginAtZero: true } } } });
    }

    const tHead = document.getElementById('cd-table-head'), tBody = document.getElementById('cd-table-body');
    if (!tHead || !tBody) return;
    let finalHosList = []; uniqueDiseases.forEach(d => diseaseTotalMap[d] = 0);
    for (let hos in tableMatrix) { let hosTotal = 0; for (let d in tableMatrix[hos].data) { let sum = tableMatrix[hos].data[d]; hosTotal += sum; diseaseTotalMap[d] += sum; } tableMatrix[hos].total = hosTotal; finalHosList.push(tableMatrix[hos]); }
    finalHosList.sort((a, b) => b.total - a.total); let sortedCDDiseases = Array.from(uniqueDiseases).sort((a, b) => diseaseTotalMap[b] - diseaseTotalMap[a]);

    let theadHTML = `<tr><th class="text-start bg-light" style="min-width: 180px;">หน่วยบริการ</th>`; sortedCDDiseases.forEach(d => { theadHTML += `<th class="bg-light">${escapeHtml(d)}</th>`; }); theadHTML += `<th class="bg-dark text-white">${isRateMode ? 'อัตราป่วยรวม' : 'รวมทุกโรคติดต่อ'}</th></tr>`; tHead.innerHTML = theadHTML;
    tBody.innerHTML = '';
    finalHosList.forEach(hosObj => {
      let tr = document.createElement('tr'); tr.style.cursor = 'pointer'; if (hosObj.name === selectedHos) tr.classList.add('table-primary');
      tr.onclick = function() { if(document.getElementById('cd-hos-selector')) document.getElementById('cd-hos-selector').value = hosObj.name; updateCdView(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      let foundHosInfo = hospitalData.find(h => (h['ศบส.'] === hosObj.name || h['Hospital'] === hosObj.name)); let hosPopulation = foundHosInfo ? cleanNum(foundHosInfo['ประชากร']) : 0;
      let maxInRowVal = 0; sortedCDDiseases.forEach(d => { let val = hosObj.data[d] || 0; if (val > maxInRowVal) maxInRowVal = val; });
      let tdHTML = `<td class="text-start fw-medium"><i class="bi bi-hospital me-2"></i>${escapeHtml(hosObj.name)}</td>`;
      sortedCDDiseases.forEach(d => { let val = hosObj.data[d] || 0; let cellDisplay = isRateMode ? ((val / (hosPopulation || 1)) * rateMultiplier).toFixed(2) : val.toLocaleString(); let highlightStyle = (val === maxInRowVal && val > 0) ? 'class="fw-bold text-danger" style="background-color: #FFE4E6;"' : ''; tdHTML += `<td ${highlightStyle}>${cellDisplay}</td>`; });
      let hosTotalDisplay = isRateMode ? ((hosObj.total / (hosPopulation || 1)) * rateMultiplier).toFixed(2) : hosObj.total.toLocaleString(); tdHTML += `<td class="fw-bold bg-light">${hosTotalDisplay}</td>`; tr.innerHTML = tdHTML; tBody.appendChild(tr);
    });

    let totalTerritoryPop = 0; hospitalData.forEach(h => totalTerritoryPop += cleanNum(h['ประชากร']));
    let trFoot = document.createElement('tr'); trFoot.className = 'table-dark fw-bold'; if (selectedHos === 'all') trFoot.classList.add('table-warning');
    let footHTML = `<td class="text-start">ยอดรวมทุกแห่ง (ภาพรวม)</td>`; let grandTotalCases = 0;
    sortedCDDiseases.forEach(d => { let diseaseSumCases = diseaseTotalMap[d]; grandTotalCases += diseaseSumCases; let footCellDisplay = isRateMode ? ((diseaseSumCases / (totalTerritoryPop || 1)) * rateMultiplier).toFixed(2) : diseaseSumCases.toLocaleString(); footHTML += `<td>${footCellDisplay}</td>`; });
    let grandTotalDisplay = isRateMode ? ((grandTotalCases / (totalTerritoryPop || 1)) * rateMultiplier).toFixed(2) : grandTotalCases.toLocaleString(); footHTML += `<td style="color: #FF8A80;">${grandTotalDisplay}</td>`; trFoot.innerHTML = footHTML;
    trFoot.onclick = function() { if(document.getElementById('cd-hos-selector')) document.getElementById('cd-hos-selector').value = 'all'; updateCdView(); window.scrollTo({ top: 0, behavior: 'smooth' }); }; tBody.appendChild(trFoot);
  }

  function checkAuth(element) {
    if (isAuthenticated) { switchView('form', element); } else { switchView('login', element); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const userEl = document.getElementById('admin-user'), passEl = document.getElementById('admin-pass'), btn = document.getElementById('btn-login'), alertBox = document.getElementById('login-alert');
    if (!userEl || !passEl) { console.error("ข้อผิดพลาด: ไม่พบ ID"); alert("เกิดข้อผิดพลาดในการโหลดฟอร์ม"); return; }
    const username = userEl.value.trim(), pass = passEl.value.trim();
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> กำลังตรวจสอบ...'; }
    if (alertBox) alertBox.style.display = 'none';

    try {
      const res = await apiRequest('login', { username, password: pass });
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i> เข้าสู่ระบบ'; }
      if (res && res.success) {
        sessionStorage.setItem(API_TOKEN_KEY, res.token);
        currentUser = { userType: res.userType, hospitalName: res.hospitalName, hcode: res.hcode };
        sessionStorage.setItem(API_USER_KEY, JSON.stringify(currentUser));
        isAuthenticated = true; userEl.value = ''; passEl.value = ''; 
        const loginMenuBtn = document.getElementById('menu-login-btn'); if(loginMenuBtn) loginMenuBtn.style.display = 'none';
        document.querySelectorAll('.admin-menu').forEach(el => el.style.display = 'block');
        setupRolePermissions();
        const hasProfileForm = document.getElementById('profile_form') || document.getElementById('profile_form-view');
        if (hasProfileForm) {
          const profileNav = document.querySelector('[onclick*="profile_form"]') || null;
          switchView('profile_form', profileNav); loadHospitalProfileData();   
        } else {
          console.warn("ไม่พบหน้าจอ profile_form");
          const formNav = document.querySelector('.admin-menu .nav-link') || null; switchView('form', formNav);
        }
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i> เข้าสู่ระบบ'; }
      if (alertBox) { alertBox.className = 'alert alert-danger py-2'; alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${escapeHtml(err.message)}`; alertBox.style.display = 'block'; }
    }
  }

  function setupRolePermissions() {
    if (!currentUser) return;
    const formSelector = document.getElementById('input-hos'); const manageHosSelector = document.getElementById('manage-hos-selector');
    const uName = currentUser.hospitalName || currentUser['ศบส.'] || "";
    if (currentUser.userType === 'user') {
      if (formSelector) { formSelector.value = uName; formSelector.disabled = true; }
      if (manageHosSelector) { manageHosSelector.value = uName; manageHosSelector.disabled = true; }
    } else if (currentUser.userType === 'admin') {
      if (formSelector) { formSelector.disabled = false; formSelector.selectedIndex = 0; }
      if (manageHosSelector) { manageHosSelector.disabled = false; manageHosSelector.value = 'all'; }
    }
    renderManageTable();
  }

  function toggleFormFields() {
    const sheet = document.getElementById('select-sheet').value, dynamicZone = document.getElementById('dynamic-zone'), inputItem = document.getElementById('input-item'), labelItem = document.getElementById('label-item'), feedbackItem = document.getElementById('feedback-item'), groupType = document.getElementById('group-ncd-type'), inputType = document.getElementById('input-type');
    if (!sheet || !dynamicZone || !inputItem) return;
    dynamicZone.style.display = 'block'; inputItem.innerHTML = '<option value="" selected disabled>-- เลือกรายการ --</option>';
    const filteredOptions = settingsData.filter(row => row['ประเภท'] === sheet);
    filteredOptions.forEach(row => {
      if (row['รายการ']) inputItem.appendChild(new Option(String(row['รายการ']), String(row['รายการ'])));
    });
    if (sheet === 'money') { if(labelItem) labelItem.innerText = 'รายการเบิกจ่าย'; if(feedbackItem) feedbackItem.innerText = 'กรุณาเลือกรายการเบิกจ่าย'; if(groupType) groupType.style.display = 'none'; if(inputType) inputType.required = false; }
    else if (sheet === 'ncd') { if(labelItem) labelItem.innerText = 'กลุ่มโรคเรื้อรัง (NCDs)'; if(feedbackItem) feedbackItem.innerText = 'กรุณาเลือกโรค'; if(groupType) groupType.style.display = 'block'; if(inputType) inputType.required = true; }
    else if (sheet === 'cd') { if(labelItem) labelItem.innerText = 'โรคติดต่อ (CD)'; if(feedbackItem) feedbackItem.innerText = 'กรุณาเลือกโรคติดต่อ'; if(groupType) groupType.style.display = 'none'; if(inputType) inputType.required = false; }
  }

  async function handleFormSubmit(e) {
    e.preventDefault(); 
    const form = document.getElementById('dataForm');
    if(!form) return;
    
    if (!form.checkValidity()) {
      e.stopPropagation(); form.classList.add('was-validated'); return; 
    }

    const btn = document.getElementById('btn-submit');
    const alertBox = document.getElementById('alert-message');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> กำลังบันทึก...'; }
    if(alertBox) alertBox.style.display = 'none';

    const monthInput = document.getElementById('input-month').value; 
    let [year, monthNum] = monthInput.split('-');
    const monthText = `${parseInt(monthNum)}/${year}`; 

    const formData = {
      sheetName: document.getElementById('select-sheet').value,
      hospName: document.getElementById('input-hos').value,
      itemName: document.getElementById('input-item').value,
      ncdType: document.getElementById('input-type') ? document.getElementById('input-type').value : '',
      recordMonth: monthText, 
      amount: parseFloat(document.getElementById('input-amount').value) || 0
    };

    // 🎯 [เพิ่มความปลอดภัย Frontend] ตรวจสอบชื่อชีทหน้าบ้านก่อนส่ง
    const validSheets = ['money', 'ncd', 'cd'];
    if (!validSheets.includes(formData.sheetName)) {
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล'; }
      if(alertBox) {
        alertBox.className = 'alert alert-danger mt-4';
        alertBox.innerHTML = `<i class="bi bi-shield-lock-fill me-2"></i> ระบบปฏิเสธ: ไม่อนุญาตให้บันทึกลงชีทเป้าหมาย`;
        alertBox.style.display = 'block';
      }
      return;
    }

    try {
      const res = await apiRequest('saveRecord', { data: formData });
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล'; }
      
      if(alertBox) {
        alertBox.style.display = 'block';
        if (res.success) {
          alertBox.className = 'alert alert-success mt-4';
          alertBox.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${escapeHtml(res.message)}`;
          form.reset(); form.classList.remove('was-validated'); 
          const dynamicZone = document.getElementById('dynamic-zone');
          if(dynamicZone) dynamicZone.style.display = 'none'; 
          setupRolePermissions();
          setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
        } else {
          alertBox.className = 'alert alert-danger mt-4';
          alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${escapeHtml(res.message)}`;
        }
      }
      await loadAllDatabase();
      renderMoneyView(); updateNcdView(); updateCdView(); renderManageTable();
    } catch (err) {
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล'; }
      if(alertBox) { alertBox.className = 'alert alert-danger mt-4'; alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${escapeHtml(err.message)}`; alertBox.style.display = 'block'; }
    }
  }

  function resetManagePageAndRender() { manageCurrentPage = 1; renderManageTable(); }

  function renderManageTable() {
    const sheetSelector = document.getElementById('manage-sheet-selector'); const hosSelector = document.getElementById('manage-hos-selector');
    if(!sheetSelector || !hosSelector) return;
    const sheetName = sheetSelector.value; const selectedHos = hosSelector.value;
    const thead = document.getElementById('manage-table-head'), tbody = document.getElementById('manage-table-body'), infoBox = document.getElementById('manage-table-info'), paginationControls = document.getElementById('manage-pagination-controls');
    
    if(!thead || !tbody) return;
    thead.innerHTML = ''; tbody.innerHTML = ''; if(paginationControls) paginationControls.innerHTML = '';
    
    let rawData = [];
    if (sheetName === 'money') rawData = moneyData; else if (sheetName === 'ncd') rawData = ncdData; else if (sheetName === 'cd') rawData = cdData;
    if (!rawData || rawData.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบข้อมูลในระบบ</td></tr>'; if(infoBox) infoBox.innerText = 'กำลังแสดงข้อมูล 0 ถึง 0 จากทั้งหมด 0 รายการ'; return; }

    let filteredData = [];
    rawData.forEach((row, index) => { let hosName = row['Hospital'] || row['ศบส.']; if (selectedHos === 'all' || hosName === selectedHos) { filteredData.push({ content: row, actualRowIndex: Number(row._rowIndex) || index + 2 }); } });
    const totalRecords = filteredData.length;
    if (totalRecords === 0) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบข้อมูลของหน่วยบริการนี้</td></tr>'; if(infoBox) infoBox.innerText = 'กำลังแสดงข้อมูล 0 ถึง 0 จากทั้งหมด 0 รายการ'; return; }
    
    const totalPages = Math.ceil(totalRecords / managePageSize); if (manageCurrentPage > totalPages) manageCurrentPage = totalPages; if (manageCurrentPage < 1) manageCurrentPage = 1;
    const startIndex = (manageCurrentPage - 1) * managePageSize; const endIndex = Math.min(startIndex + managePageSize, totalRecords);
    if(infoBox) { infoBox.innerText = `กำลังแสดงข้อมูลลำดับที่ ${startIndex + 1} ถึง ${endIndex} จากทั้งหมด ${totalRecords} รายการ (หน้า ${manageCurrentPage}/${totalPages})`; }
    
    const headers = Object.keys(rawData[0]).filter(h => h !== '_rowIndex'); let headerRow = '<tr>'; headers.forEach(h => headerRow += `<th>${escapeHtml(h)}</th>`); headerRow += '<th style="width: 100px;">จัดการ</th></tr>'; thead.innerHTML = headerRow;
    for (let i = startIndex; i < endIndex; i++) {
      let item = filteredData[i]; let row = item.content; let actualRowIndex = item.actualRowIndex;
      let tr = document.createElement('tr'); let tdHTML = ''; headers.forEach(h => tdHTML += `<td class="text-center">${escapeHtml(row[h] || '')}</td>`);
      tdHTML += `<td class="text-center"><button class="btn btn-sm btn-outline-danger rounded-pill" onclick="deleteRecord('${sheetName}', ${actualRowIndex})"><i class="bi bi-trash3-fill"></i> ลบ</button></td>`;
      tr.innerHTML = tdHTML; tbody.appendChild(tr);
    }
    
    if (paginationControls && totalPages > 1) {
      let prevDisabled = (manageCurrentPage === 1) ? 'disabled' : '';
      paginationControls.innerHTML += `<li class="page-item ${prevDisabled}"><a class="page-link" href="#" onclick="changeManagePage(${manageCurrentPage - 1}); return false;">ก่อนหน้า</a></li>`;
      for (let p = 1; p <= totalPages; p++) {
        let activeClass = (p === manageCurrentPage) ? 'active' : '';
        paginationControls.innerHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="changeManagePage(${p}); return false;">${p}</a></li>`;
      }
      let nextDisabled = (manageCurrentPage === totalPages) ? 'disabled' : '';
      paginationControls.innerHTML += `<li class="page-item ${nextDisabled}"><a class="page-link" href="#" onclick="changeManagePage(${manageCurrentPage + 1}); return false;">ถัดไป</a></li>`;
    }
  }

  function changeManagePage(pageNumber) { manageCurrentPage = pageNumber; renderManageTable(); }

  async function deleteRecord(sheetName, rowIndex) {
    if(!confirm(`คุณแน่ใจหรือไม่ที่จะลบข้อมูลแถวนี้?\n(ข้อมูลจะถูกลบออกจาก Google Sheets ทันที)`)) return;
    document.body.style.cursor = 'wait';
    try {
      const res = await apiRequest('deleteRecord', { sheetName, rowIndex });
      document.body.style.cursor = 'default'; alert(res.message);
      await loadAllDatabase();
      renderMoneyView(); updateNcdView(); updateCdView(); renderManageTable();
    } catch (err) {
      document.body.style.cursor = 'default'; alert(err.message);
    }
  }

  async function loadHospitalProfileData() {
    if (!currentUser) { alert("กรุณาเข้าสู่ระบบก่อนดำเนินการ"); return; }
    const hcode = currentUser.hcode || currentUser.HCODE || currentUser['hcode'] || "";
    const hosName = currentUser.hospitalName || currentUser['ศบส.'] || currentUser.Hospital || "ไม่ระบุชื่อหน่วยงาน";
    const userType = currentUser.userType || currentUser.user_type || currentUser['user_type'] || "user";

    if (userType === 'admin' || hcode === '99999') {
      alert("💡 แจ้งเตือน: บัญชีผู้ดูแลระบบ (Admin) ไม่มีแถวข้อมูลส่วนตัวในชีท hos_pf\n\nแนะนำให้ลองล็อกอินด้วยบัญชีระดับเจ้าหน้าที่ ศบส. เพื่อทดสอบครับ");
      if(document.getElementById('prof-hos-name')) document.getElementById('prof-hos-name').value = "ผู้ดูแลระบบ (ภาพรวมอำเภอ)";
      if(document.getElementById('prof-hcode')) document.getElementById('prof-hcode').value = hcode;
      clearProfileForm(); return;
    }

    if (!hcode) { console.error("ไม่พบรหัส HCODE ในเซสชันผู้ใช้:", currentUser); alert("เกิดข้อผิดพลาด: ระบบไม่สามารถยืนยันรหัสหน่วยบริการ (HCODE) ได้"); return; }

    if(document.getElementById('prof-hos-name')) document.getElementById('prof-hos-name').value = hosName;
    if(document.getElementById('prof-hcode')) document.getElementById('prof-hcode').value = hcode;
    if(document.getElementById('prof-hcode-badge')) document.getElementById('prof-hcode-badge').innerText = "HCODE: " + hcode;

    try {
      const result = await apiRequest('getHospitalProfile', { hcode }, 'GET');
      const profile = result.data;
      if (profile) {
        if(document.getElementById('prof-pop')) document.getElementById('prof-pop').value = profile['ประชากร'] || profile['ประชากรรวม'] || 0;
        if(document.getElementById('prof-male')) document.getElementById('prof-male').value = profile['ชาย'] || profile['ประชากรชาย'] || 0;
        if(document.getElementById('prof-female')) document.getElementById('prof-female').value = profile['หญิง'] || profile['ประชากรหญิง'] || 0;
        if(document.getElementById('prof-house')) document.getElementById('prof-house').value = profile['หลังคาเรือน'] || 0;
        if(document.getElementById('prof-village')) document.getElementById('prof-village').value = profile['หมู่บ้าน/ชุมชน'] || profile['หมู่บ้าน'] || 0;
        if(document.getElementById('prof-staff')) document.getElementById('prof-staff').value = profile['บุคลากร'] || profile['บุคลากรหลัก'] || 0;
        if(document.getElementById('prof-support')) document.getElementById('prof-support').value = profile['บุคลากรสนับสนุน'] || 0;
        if(document.getElementById('prof-vhv')) document.getElementById('prof-vhv').value = profile['อสม.'] || 0;
      } else {
        clearProfileForm();
      }
    } catch (err) {
      console.error('โหลดข้อมูลหน่วยบริการไม่สำเร็จ:', err);
      alert(err.message);
    }
  }

  function clearProfileForm() {
    const fields = ['prof-pop', 'prof-male', 'prof-female', 'prof-house', 'prof-village', 'prof-staff', 'prof-support', 'prof-vhv'];
    fields.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = 0; });
  }

  function calculateGenderSum() {
    let male = parseInt(document.getElementById('prof-male').value) || 0, female = parseInt(document.getElementById('prof-female').value) || 0;
    if (male + female > 0) { if(document.getElementById('prof-pop')) document.getElementById('prof-pop').value = male + female; }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    if(!currentUser) return;
    
    const btn = document.getElementById('btn-save-profile');
    const alertBox = document.getElementById('profile-alert');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> กำลังบันทึกข้อมูล...'; }
    
    const formData = {
      hcode: currentUser.hcode || currentUser.HCODE || currentUser['hcode'],
      pop: parseInt(document.getElementById('prof-pop').value) || 0,
      male: parseInt(document.getElementById('prof-male').value) || 0,
      female: parseInt(document.getElementById('prof-female').value) || 0,
      house: parseInt(document.getElementById('prof-house').value) || 0,
      village: parseInt(document.getElementById('prof-village').value) || 0,
      staff: parseInt(document.getElementById('prof-staff').value) || 0,
      support: parseInt(document.getElementById('prof-support').value) || 0,
      vhv: parseInt(document.getElementById('prof-vhv').value) || 0
    };

    // 🎯 [เพิ่มความปลอดภัย Frontend] ป้องกันบัญชีแอดมินหรือคนที่ไม่สิทธิ์เผลอกดบันทึก
    if (!formData.hcode || formData.hcode === '99999') {
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> บันทึกข้อมูล'; }
      if(alertBox) {
        alertBox.className = 'alert alert-danger py-2';
        alertBox.innerHTML = '<i class="bi bi-shield-x me-2"></i> บัญชีนี้ไม่มีสิทธิ์หรือไม่มีรหัส HCODE สำหรับอัปเดตข้อมูล';
        alertBox.style.display = 'block';
      }
      return;
    }

    try {
      const res = await apiRequest('saveHospitalProfile', { data: formData });
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> บันทึกข้อมูล'; }
      
      if (alertBox) {
        if (res.success) {
          alertBox.className = 'alert alert-success py-2';
          alertBox.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i> บันทึกข้อมูลพื้นฐานเรียบร้อยแล้ว';
          alertBox.style.display = 'block';
          await loadAllDatabase();
          try { renderDashboard(hospitalData); } catch(e){}
          try { updateDetailView(); } catch(e){}
        } else {
          alertBox.className = 'alert alert-danger py-2';
          alertBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i> เกิดข้อผิดพลาด: ' + escapeHtml(res.message);
          alertBox.style.display = 'block';
        }
      }
    } catch (err) {
      if(btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> บันทึกข้อมูล'; }
      if(alertBox) { alertBox.className = 'alert alert-danger py-2'; alertBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i> ' + escapeHtml(err.message); alertBox.style.display = 'block'; }
    }
  }

  async function handleLogout() {
    if (!confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) { return; }
    try { await apiRequest('logout'); } catch (err) { console.warn('Logout API:', err); }
    sessionStorage.removeItem(API_TOKEN_KEY);
    sessionStorage.removeItem(API_USER_KEY);
    isAuthenticated = false; currentUser = null;
    document.querySelectorAll('.admin-menu').forEach(el => { el.style.display = 'none'; });
    const loginMenuBtn = document.getElementById('menu-login-btn');
    if (loginMenuBtn) { loginMenuBtn.style.display = 'block'; }
    try {
      setupRolePermissions(); 
      const formSelector = document.getElementById('input-hos');
      if (formSelector) { formSelector.disabled = false; formSelector.selectedIndex = 0; }
    } catch (e) { console.warn("Reset permissions on logout warning:", e); }
    switchView('dashboard');
    alert("ออกจากระบบเรียบร้อยแล้วครับ");
  }

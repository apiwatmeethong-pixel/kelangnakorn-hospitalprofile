// ===================================================
// CONFIGURATION & GLOBAL VARIABLES
// ===================================================
// URL ของ GAS Web App ที่ลงท้ายด้วย /exec
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbx__CT9dV9T697XsuBcLO9P2mAZmX5rud8NgthU7Lt2RuFLRtoAVFKp9NcM58Ul_Un9/exec';
const API_TOKEN_KEY = 'hospitalApiToken';
const API_USER_KEY = 'hospitalCurrentUser';

// ประกาศตัวแปรเก็บข้อมูลระบบ
let hospitalData = [], moneyData = [], ncdData = [], cdData = [], settingsData = [];
let popChartObj = null, genderChartObj = null, detailGenderChartObj = null, detailRatioChartObj = null, moneyChartObj = null;
let ncdBarChartObj = null, ncdPieChartObj = null;
let cdLineChartObj = null, cdBarChartObj = null;
let hosPropChartObj = null;

let isAuthenticated = false; 
let currentUser = null; 
let manageCurrentPage = 1; 
const managePageSize = 30;

// ===================================================
// 🎯 CENTRALIZED API GATEWAY (ระบบรับส่งข้อมูลภายนอกแบบปลอดภัย)
// ===================================================
async function apiRequest(action, payload = {}, method = 'POST') {
  if (!GAS_API_URL || GAS_API_URL.includes('PASTE_YOUR')) {
    throw new Error('กรุณาใส่ URL ของ GAS Web App ในตัวแปร GAS_API_URL');
  }

  // ดึงข้อมูลตัวตนและสิทธิ์การใช้งานแนบไปกับคำสั่งทุกครั้ง (State-based Security Context)
  const savedUser = sessionStorage.getItem(API_USER_KEY);
  let userCtx = {};
  if (savedUser) {
    const parsed = JSON.parse(savedUser);
    userCtx = {
      user: parsed.user || '',
      userType: parsed.userType || 'user',
      hospitalName: parsed.hospitalName || ''
    };
  }

  let response;
  if (method === 'GET') {
    const url = new URL(GAS_API_URL);
    url.search = new URLSearchParams({ action, ...userCtx, ...payload }).toString();
    response = await fetch(url.toString(), { redirect: 'follow' });
  } else {
    response = await fetch(GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...userCtx, ...payload })
    });
  }

  if (!response.ok) throw new Error(`เชื่อมต่อ API ไม่สำเร็จ (${response.status})`);
  const result = await response.json();
  if (!result.success) throw new Error(result.message || 'API ทำงานไม่สำเร็จ');
  return result;
}

// โดเมนฟังก์ชันโหลดฐานข้อมูลหลัก
async function loadAllDatabase() {
  const result = await apiRequest('getAllDatabase', {}, 'GET');
  hospitalData = result.hospital || [];
  moneyData = result.money || [];
  ncdData = result.ncd || [];
  cdData = result.cd || [];
  settingsData = result.settings || [];
  return result;
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

// ===================================================
// INITIALIZATION & CORE UI ROUTING
// ===================================================
document.addEventListener("DOMContentLoaded", async function() {
  try {
    switchView('dashboard');
  } catch(e) { console.warn("Initial view switch warm-up:", e); }

  try {
    const savedUser = sessionStorage.getItem(API_USER_KEY);
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      isAuthenticated = true;
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
    }
    const targetView = document.getElementById(viewId) || document.getElementById('view-' + viewId);
    if (targetView) targetView.style.display = 'block';

    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    if (navEl) navEl.classList.add('active');
  } catch(err) { console.error("Error in switchView:", err); }
}

function initApp() {
  try { renderDashboard(hospitalData); } catch(e) { console.error(e); }
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
  } catch(e) { console.error(e); }
  
  try { renderMoneyView(); } catch(e) { console.error(e); }
  try { updateDetailView(); } catch(e) { console.error(e); }
  try { updateNcdView(); } catch(e) { console.error(e); }
  try { updateCdView(); } catch(e) { console.error(e); }
  try { renderManageTable(); } catch(e) { console.error(e); }
}

const cleanNum = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;

// ===================================================
// CHARTS & VIEW RENDERING MANAGEMENT
// ===================================================
function renderDashboard(data) {
  if (!data || data.length === 0) return;
  let totalPop = 0, totalMale = 0, totalFemale = 0, totalVillages = 0, totalHouses = 0, totalStaff = 0, totalVhv = 0, totalSupport = 0;
  
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
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' } } }
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
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
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
      type: 'doughnut', data: { labels: ['ชาย', 'หญิง'], datasets: [{ data: [hosMale, hosFemale], backgroundColor: ['#64B5F6', '#F48FB1'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%' }
    });
  }
}

function renderMoneyView() {
  if (!moneyData || moneyData.length === 0) return;
  let moneyMatrix = {}, grandTotalPlan = 0, grandTotalSpent = 0;
  
  moneyData.forEach(row => {
    let hosName = row['Hospital'] || row['ศบส.'], type = row['รายการ'], rawAmount = row['วงเงินทั้งปี'] || row['จำนวนเงิน'] || row['จำนวน'];
    if (!hosName || !type) return;
    hosName = hosName.toString().trim();
    let amount = parseFloat(String(rawAmount).replace(/,/g, '')) || 0;
    if (!moneyMatrix[hosName]) moneyMatrix[hosName] = { plan: 0, spent: 0 };
    if (type === 'แผนจ่ายเงิน') { moneyMatrix[hosName].plan += amount; grandTotalPlan += amount; } 
    else if (type.includes('รวมจ่ายเดือน')) { moneyMatrix[hosName].spent += amount; grandTotalSpent += amount; }
  });

  let grandRate = grandTotalPlan > 0 ? (grandTotalSpent / grandTotalPlan) * 100 : 0;
  if(document.getElementById('money-budget')) document.getElementById('money-budget').innerText = grandTotalPlan.toLocaleString(undefined, {minimumFractionDigits: 2});
  if(document.getElementById('money-spent')) document.getElementById('money-spent').innerText = grandTotalSpent.toLocaleString(undefined, {minimumFractionDigits: 2});
  if(document.getElementById('money-rate')) document.getElementById('money-rate').innerText = grandRate.toFixed(2) + "%";

  const tBody = document.getElementById('money-table-body');
  if (tBody) {
    tBody.innerHTML = '';
    Object.keys(moneyMatrix).sort().forEach(hos => {
      let plan = moneyMatrix[hos].plan, spent = moneyMatrix[hos].spent, remaining = plan - spent, rate = plan > 0 ? (spent / plan) * 100 : 0;
      tBody.innerHTML += `<tr><td>${escapeHtml(hos)}</td><td class="text-end">${plan.toLocaleString()}</td><td class="text-end text-danger">${spent.toLocaleString()}</td><td class="text-end text-success">${remaining.toLocaleString()}</td><td class="text-center"><span class="badge bg-success">${rate.toFixed(2)}%</span></td></tr>`;
    });
  }
}

function updateNcdView() {
  const selectorEl = document.getElementById('ncd-hos-selector');
  const selectedHos = selectorEl ? selectorEl.value : 'all';
  const tBody = document.getElementById('ncd-table-body');
  if (!tBody) return;
  tBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">พร้อมประมวลผลตารางโรคเรื้อรัง</td></tr>';
}

function updateCdView() {
  const selectorEl = document.getElementById('cd-hos-selector');
  const selectedHos = selectorEl ? selectorEl.value : 'all';
  const tBody = document.getElementById('cd-table-body');
  if (!tBody) return;
  tBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">พร้อมประมวลผลตารางโรคติดต่อ</td></tr>';
}

// ===================================================
// SECURITY & AUTHENTICATION MANAGEMENT
// ===================================================
function checkAuth(element) {
  if (isAuthenticated) { switchView('form', element); } else { switchView('login', element); }
}

async function handleLogin(e) {
  e.preventDefault();
  const userEl = document.getElementById('admin-user'), passEl = document.getElementById('admin-pass'), btn = document.getElementById('btn-login'), alertBox = document.getElementById('login-alert');
  if (!userEl || !passEl) return;
  
  const username = userEl.value.trim(), password = passEl.value.trim();
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> ตรวจสอบ...'; }
  
  try {
    const res = await apiRequest('login', { username, password });
    sessionStorage.setItem(API_TOKEN_KEY, 'authorized_session_token');
    sessionStorage.setItem(API_USER_KEY, JSON.stringify(res));
    
    isAuthenticated = true; 
    currentUser = res;
    userEl.value = ''; passEl.value = '';
    
    if(document.getElementById('menu-login-btn')) document.getElementById('menu-login-btn').style.display = 'none';
    document.querySelectorAll('.admin-menu').forEach(el => el.style.display = 'block');
    
    setupRolePermissions();
    switchView('form');
  } catch (err) {
    if (alertBox) { alertBox.className = 'alert alert-danger py-2'; alertBox.innerHTML = escapeHtml(err.message); alertBox.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i> เข้าสู่ระบบ'; }
  }
}

function setupRolePermissions() {
  if (!currentUser) return;
  const formSelector = document.getElementById('input-hos');
  const manageHosSelector = document.getElementById('manage-hos-selector');
  const uName = currentUser.hospitalName || "";
  
  if (currentUser.userType === 'user') {
    if (formSelector) { formSelector.value = uName; formSelector.disabled = true; }
    if (manageHosSelector) { manageHosSelector.value = uName; manageHosSelector.disabled = true; }
  } else if (currentUser.userType === 'admin') {
    if (formSelector) { formSelector.disabled = false; formSelector.selectedIndex = 0; }
    if (manageHosSelector) { manageHosSelector.disabled = false; manageHosSelector.value = 'all'; }
  }
  renderManageTable();
}

async function handleLogout() {
  if (!confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) return;
  try { await apiRequest('logout'); } catch (err) { console.warn('Logout API:', err); }
  
  sessionStorage.removeItem(API_TOKEN_KEY);
  sessionStorage.removeItem(API_USER_KEY);
  isAuthenticated = false; currentUser = null;
  
  document.querySelectorAll('.admin-menu').forEach(el => el.style.display = 'none');
  if (document.getElementById('menu-login-btn')) document.getElementById('menu-login-btn').style.display = 'block';
  
  const formSelector = document.getElementById('input-hos');
  if (formSelector) { formSelector.disabled = false; formSelector.selectedIndex = 0; }
  
  switchView('dashboard');
  alert("ออกจากระบบเรียบร้อยแล้วครับ");
}

// ===================================================
// FORMS & SETTINGS INTERACTION
// ===================================================
function toggleFormFields() {
  const sheet = document.getElementById('select-sheet').value, dynamicZone = document.getElementById('dynamic-zone'), inputItem = document.getElementById('input-item'), labelItem = document.getElementById('label-item'), feedbackItem = document.getElementById('feedback-item'), groupType = document.getElementById('group-ncd-type'), inputType = document.getElementById('input-type');
  if (!sheet || !dynamicZone || !inputItem) return;
  
  dynamicZone.style.display = 'block'; inputItem.innerHTML = '<option value="" selected disabled>-- เลือกรายการ --</option>';
  settingsData.filter(row => row['ประเภท'] === sheet).forEach(row => {
    if (row['รายการ']) inputItem.innerHTML += `<option value="${escapeHtml(row['รายการ'])}">${escapeHtml(row['รายการ'])}</option>`;
  });
  
  if (sheet === 'money') { if(labelItem) labelItem.innerText = 'รายการเบิกจ่าย'; if(groupType) groupType.style.display = 'none'; if(inputType) inputType.required = false; }
  else if (sheet === 'ncd') { if(labelItem) labelItem.innerText = 'กลุ่มโรคเรื้อรัง (NCDs)'; if(groupType) groupType.style.display = 'block'; if(inputType) inputType.required = true; }
  else if (sheet === 'cd') { if(labelItem) labelItem.innerText = 'โรคติดต่อ (CD)'; if(groupType) groupType.style.display = 'none'; if(inputType) inputType.required = false; }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('dataForm');
  if (!form || !form.checkValidity()) { form.classList.add('was-validated'); return; }
  
  const btn = document.getElementById('btn-submit'), alertBox = document.getElementById('alert-message');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> กำลังบันทึก...'; }
  
  const monthInput = document.getElementById('input-month').value; 
  let [year, monthNum] = monthInput.split('-'); const monthText = `${parseInt(monthNum)}/${year}`; 
  
  const formData = {
    sheetName: document.getElementById('select-sheet').value,
    hospName: document.getElementById('input-hos').value,
    itemName: document.getElementById('input-item').value,
    ncdType: document.getElementById('input-type') ? document.getElementById('input-type').value : '',
    recordMonth: monthText, 
    amount: parseFloat(document.getElementById('input-amount').value) || 0
  };

  try {
    const res = await apiRequest('saveRecord', { formData });
    if (alertBox) {
      alertBox.className = 'alert alert-success mt-4';
      alertBox.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${escapeHtml(res.message)}`;
      alertBox.style.display = 'block';
    }
    form.reset(); form.classList.remove('was-validated');
    if(document.getElementById('dynamic-zone')) document.getElementById('dynamic-zone').style.display = 'none';
    await loadAllDatabase();
    initApp();
  } catch (err) {
    if (alertBox) { alertBox.className = 'alert alert-danger mt-4'; alertBox.innerHTML = escapeHtml(err.message); alertBox.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล'; }
  }
}

// ===================================================
// DATA TABLE DATA MANAGEMENT (มีสิทธิ์ลบข้อผิดพลาดตนเอง)
// ===================================================
function resetManagePageAndRender() { manageCurrentPage = 1; renderManageTable(); }

function renderManageTable() {
  const sheetSelector = document.getElementById('manage-sheet-selector');
  const hosSelector = document.getElementById('manage-hos-selector');
  if (!sheetSelector || !hosSelector) return;
  
  const sheetName = sheetSelector.value, selectedHos = hosSelector.value;
  const thead = document.getElementById('manage-table-head'), tbody = document.getElementById('manage-table-body'), infoBox = document.getElementById('manage-table-info');
  if (!thead || !tbody) return;
  
  thead.innerHTML = ''; tbody.innerHTML = '';
  let rawData = [];
  if (sheetName === 'money') rawData = moneyData; else if (sheetName === 'ncd') rawData = ncdData; else if (sheetName === 'cd') rawData = cdData;
  
  if (rawData.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">ไม่พบข้อมูล</td></tr>'; return; }
  
  let filtered = [];
  rawData.forEach((row, idx) => {
    let name = row['Hospital'] || row['ศบส.'] || '';
    if (selectedHos === 'all' || name === selectedHos) filtered.push({ content: row, actualIndex: idx + 2 });
  });

  const headers = Object.keys(rawData[0]);
  let hRow = '<tr>'; headers.forEach(h => hRow += `<th>${escapeHtml(h)}</th>`); 
  hRow += '<th>จัดการ</th></tr>'; thead.innerHTML = hRow;

  filtered.forEach(item => {
    let tr = document.createElement('tr');
    let tdHTML = ''; headers.forEach(h => tdHTML += `<td>${escapeHtml(item.content[h])}</td>`);
    
    // ปุ่มลบงานตนเองเพื่อแก้ไขคำผิด
    tdHTML += `<td><button class="btn btn-sm btn-outline-danger rounded-pill" onclick="deleteRecord('${sheetName}', ${item.actualIndex})"><i class="bi bi-trash3-fill"></i> ลบเพื่อแก้ไข</button></td>`;
    tr.innerHTML = tdHTML; tbody.appendChild(tr);
  });
  if (infoBox) infoBox.innerText = `รวมข้อมูลทั้งหมด ${filtered.length} รายการ`;
}

async function deleteRecord(sheetName, rowIndex) {
  if (!confirm("คุณมั่นใจที่จะลบข้อมูลเพื่อคีย์งานที่ถูกต้องแทนที่ใช่หรือไม่?")) return;
  document.body.style.cursor = 'wait';
  try {
    const res = await apiRequest('deleteRecord', { sheetName, rowIndex });
    alert(res.message);
    await loadAllDatabase();
    renderManageTable();
  } catch (err) { alert(err.message); } finally { document.body.style.cursor = 'default'; }
}

// ===================================================
// HOSPITAL PROFILE PROFILE EDIT SYSTEM
// ===================================================
function loadHospitalProfileData() {
  if (!currentUser) return;
  const hcode = currentUser.hcode || "";
  if (currentUser.userType === 'admin' || hcode === '99999') {
    if(document.getElementById('prof-hos-name')) document.getElementById('prof-hos-name').value = "ผู้ดูแลระบบ (ภาพรวมอำเภอ)";
    return;
  }

  const prof = hospitalData.find(h => String(h.hcode || '').trim() === String(hcode).trim());
  if (prof) {
    if(document.getElementById('prof-hos-name')) document.getElementById('prof-hos-name').value = prof['ศบส.'] || '';
    if(document.getElementById('prof-pop')) document.getElementById('prof-pop').value = cleanNum(prof['ประชากร']);
    if(document.getElementById('prof-male')) document.getElementById('prof-male').value = cleanNum(prof['ชาย']);
    if(document.getElementById('prof-female')) document.getElementById('prof-female').value = cleanNum(prof['หญิง']);
    if(document.getElementById('prof-house')) document.getElementById('prof-house').value = cleanNum(prof['หลังคาเรือน']);
    if(document.getElementById('prof-village')) document.getElementById('prof-village').value = cleanNum(prof['หมู่บ้าน/ชุมชน']);
    if(document.getElementById('prof-staff')) document.getElementById('prof-staff').value = cleanNum(prof['บุคลากร']);
    if(document.getElementById('prof-support')) document.getElementById('prof-support').value = cleanNum(prof['บุคลากรสนับสนุน']);
    if(document.getElementById('prof-vhv')) document.getElementById('prof-vhv').value = cleanNum(prof['อสม.']);
  }
}

async function handleProfileSave(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-save-profile'), alertBox = document.getElementById('profile-alert');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก...'; }
  
  const formData = {
    hcode: currentUser.hcode,
    pop: parseInt(document.getElementById('prof-pop').value) || 0,
    male: parseInt(document.getElementById('prof-male').value) || 0,
    female: parseInt(document.getElementById('prof-female').value) || 0,
    house: parseInt(document.getElementById('prof-house').value) || 0,
    village: parseInt(document.getElementById('prof-village').value) || 0,
    staff: parseInt(document.getElementById('prof-staff').value) || 0,
    support: parseInt(document.getElementById('prof-support').value) || 0,
    vhv: parseInt(document.getElementById('prof-vhv').value) || 0
  };

  try {
    const res = await apiRequest('saveHospitalProfileRow', { formData });
    if (alertBox) { alertBox.className = 'alert alert-success py-2'; alertBox.innerHTML = res.message; alertBox.style.display = 'block'; }
    await loadAllDatabase();
    initApp();
  } catch (err) {
    if (alertBox) { alertBox.className = 'alert alert-danger py-2'; alertBox.innerHTML = err.message; alertBox.style.display = 'block'; }
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> บันทึกข้อมูล'; } }
}

// ===================================================
// 🎯 LOGFILE SYSTEM (แอนิเมชันแสดงประวัติกิจกรรมทางไกล)
// ===================================================
async function loadLogsData() {
  if (!currentUser) return;
  const container = document.getElementById('logs-timeline-container');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center p-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span> กำลังดึงประวัติ...</div>';
  
  try {
    const res = await apiRequest('getLogs', {}, 'GET');
    const logs = res.data || [];
    container.innerHTML = '';
    
    if (logs.length === 0) {
      container.innerHTML = '<div class="text-center p-4 text-muted">ยังไม่มีบันทึกประวัติกิจกรรมในหน่วยงานของคุณ</div>';
      return;
    }
    
    logs.forEach((log, index) => {
      let badge = 'bg-primary';
      if (log.Action.includes('ลบ')) badge = 'bg-danger';
      else if (log.Action.includes('แก้ไข') || log.Action.includes('อัปเดต')) badge = 'bg-warning text-dark';
      else if (log.Action.includes('เข้าสู่ระบบ')) badge = 'bg-success';
      
      let delay = (index * 0.04).toFixed(2);
      let card = document.createElement('div');
      card.className = 'log-item-card p-3 mb-3 border rounded shadow-sm bg-white';
      card.style.animation = `fadeInSlide 0.4s ease forwards`;
      card.style.animationDelay = `${delay}s`;
      card.style.opacity = '0';
      
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap">
          <span class="badge ${badge} rounded-pill small font-monospace">${escapeHtml(log.Action)}</span>
          <small class="text-muted font-monospace"><i class="bi bi-clock me-1"></i>${escapeHtml(log.Timestamp)}</small>
        </div>
        <div class="small fw-bold text-dark mb-1"><i class="bi bi-hospital me-1 text-primary"></i>หน่วยบริการ: ${escapeHtml(log.Hospital)}</div>
        <div class="small text-secondary" style="font-size: 0.85rem;"><i class="bi bi-info-circle me-1"></i>รายละเอียด: ${escapeHtml(log.Details)}</div>
        <div class="text-end" style="font-size: 0.75rem;"><span class="text-muted">ผู้ทำรายการ:</span> <span class="badge bg-light text-dark font-monospace">${escapeHtml(log.User)}</span></div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="text-center p-4 text-danger">ไม่สามารถโหลดข้อมูลประวัติได้: ${escapeHtml(err.message)}</div>`;
  }
}

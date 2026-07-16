// วาง URL ของ GAS Web App ที่ลงท้ายด้วย /exec ตรงนี้เพียงจุดเดียว
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyllC_2csmz3XErpleROdYziNQwU-U-OYJujFzQW9D8gGXwFVEnLrWuekrXva8qmhc6/exec';
const API_TOKEN_KEY = 'hospitalApiToken';
const API_USER_KEY = 'hospitalCurrentUser';

// Global State
let dbData = null;
let globalSettings = null;
let isAuthenticated = false;
let currentUser = null;

// Chart Instances
let popChartInstance = null;
let genderChartInstance = null;
let detailGenderChartInstance = null;
let detailRatioChartInstance = null;
let moneyChartInstance = null;
let ncdBarChartInstance = null;
let ncdPieChartInstance = null;
let cdLineChartInstance = null;
let cdBarChartInstance = null;

// ตั้งค่าเริ่มต้นของแอปพลิเคชันเมื่อโหลดหน้าจอ
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

async function initializeApp() {
  showLoading(true);
  try {
    // ตรวจสอบเซสชันการเข้าสู่ระบบเดิมที่ค้างไว้
    const cachedToken = sessionStorage.getItem(API_TOKEN_KEY);
    const cachedUser = sessionStorage.getItem(API_USER_KEY);
    if (cachedToken && cachedUser) {
      isAuthenticated = true;
      currentUser = JSON.parse(cachedUser);
      setupRolePermissions();
    }

    // ดึงข้อมูลหลักจากฐานข้อมูลหลังบ้าน
    const databaseRes = await apiRequest('getAllDatabase', {}, 'GET');
    if (databaseRes && databaseRes.success) {
      dbData = databaseRes.data;
    } else {
      throw new Error(databaseRes.message || 'ไม่สามารถดึงคลังข้อมูลดิบได้');
    }

    // ดึงข้อมูลการตั้งค่าระบบ (Settings)
    const settingsRes = await apiRequest('getSettings', {}, 'GET');
    if (settingsRes && settingsRes.success) {
      globalSettings = settingsRes.data;
    }

    // สร้างเมนูตัวเลือกและประมวลผลการแสดงผลแดชบอร์ด
    populateSelectors();
    renderDashboard();
    
    // แสดงหน้าแดชบอร์ดเริ่มต้น
    switchView('dashboard', document.querySelector('.sidebar .nav-link'));
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการโหลดระบบ: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ฟังก์ชันกลางในการยิง API Request เชื่อมต่อส่งค่านำทางหลังบ้าน
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

  if (!response.ok) throw new Error('การเชื่อมต่อเครือข่ายล้มเหลว');
  return await response.json();
}

// ฟังก์ชันควบคุมการเปิด-ปิดหน้าต่างสลับมุมมอง (View Router)
function switchView(viewId, element) {
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const targetSection = document.getElementById('view-' + viewId);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (element) element.classList.add('active');

  // ปิด Sidebar อัตโนมัติเมื่อกดบนหน้าจอมือถือ
  if (window.innerWidth <= 768) {
    toggleSidebar(false);
  }

  // ทริกเกอร์อัปเดตข้อมูลตามหน้านั้นๆ
  if (viewId === 'detail') updateDetailView();
  if (viewId === 'money') renderMoneyView();
  if (viewId === 'ncd') updateNcdView();
  if (viewId === 'cd') updateCdView();
  if (viewId === 'manage') resetManagePageAndRender();
  if (viewId === 'logs') loadLogsData(); // 🎯 สั่งโหลดประวัติกิจกรรมทันทีเมื่อเปิดหน้า Logs
}

// 🎯 ฟังก์ชันโหลดประวัติกิจกรรมย้อนหลัง (Logs Engine) สอดคล้องตัวแปรหลังบ้าน 100%
async function loadLogsData() {
  const container = document.getElementById('logs-timeline-container');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-5 text-muted">
      <div class="spinner-border spinner-border-sm text-info me-2" role="status"></div>
      กำลังเรียกอ่านบันทึกกิจกรรม Logfile ความปลอดภัย...
    </div>
  `;

  try {
    const res = await apiRequest('getLogs', {}, 'GET');
    if (res && res.success) {
      const logs = res.data || [];
      if (logs.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox me-2"></i>ไม่พบรายการบันทึกกิจกรรมย้อนหลัง</div>';
        return;
      }

      let html = '';
      logs.forEach(log => {
        // ออกแบบ Badge จำแนกสีตาม Action ของกิจกรรมอย่างเป็นระบบยืดหยุ่น
        let badgeColor = 'bg-secondary';
        if (log.Action === 'เข้าสู่ระบบ') badgeColor = 'bg-success';
        if (log.Action === 'ออกจากระบบ') badgeColor = 'bg-warning text-dark';
        if (log.Action === 'เพิ่มข้อมูล') badgeColor = 'bg-primary';
        if (log.Action === 'ลบข้อมูล') badgeColor = 'bg-danger';
        if (log.Action === 'อัปเดตโปรไฟล์ ศบส.') badgeColor = 'bg-info text-dark';

        html += `
          <div class="card mb-3 border-0 border-start border-4 border-info shadow-sm p-3 bg-white log-item-card" style="animation: fadeInSlide 0.3s ease-out forwards;">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
              <div>
                <span class="badge ${badgeColor} me-2 px-2.5 py-1.5 rounded-pill small">${escapeHtml(log.Action)}</span>
                <span class="fw-bold text-dark">${escapeHtml(log.Hospital)}</span>
              </div>
              <small class="text-muted font-monospace small"><i class="bi bi-clock me-1"></i>${escapeHtml(log.Timestamp)}</small>
            </div>
            <div class="text-secondary small mb-2 bg-light p-2 rounded">${escapeHtml(log.Details)}</div>
            <div class="text-end text-muted small" style="font-size: 0.8rem;">
              <i class="bi bi-person-circle me-1 text-info"></i>ผู้ปฏิบัติงาน: <strong>${escapeHtml(log.User)}</strong>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `<div class="alert alert-danger py-2 small"><i class="bi bi-x-circle me-2"></i>ดึงข้อมูลล้มเหลว: ${escapeHtml(res.message)}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger py-2 small"><i class="bi bi-exclamation-triangle-fill me-2"></i>ข้อผิดพลาดเครือข่าย: ${escapeHtml(err.message)}</div>`;
  }
}

// ฟังก์ชันเข้าสู่ระบบของเจ้าหน้าที่ประจำศูนย์และแอดมิน
async function handleLogin(event) {
  if (event) event.preventDefault();
  const userInp = document.getElementById('admin-user');
  const passInp = document.getElementById('admin-pass');
  const alertBox = document.getElementById('login-alert');
  const btn = document.getElementById('btn-login');

  if (!userInp || !passInp) return;
  const username = userInp.value.trim();
  const password = passInp.value.trim();

  if (alertBox) alertBox.style.display = 'none';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังตรวจสอบสิทธิ์...'; }

  try {
    const res = await apiRequest('login', { username, password }, 'POST');
    if (res && res.success) {
      sessionStorage.setItem(API_TOKEN_KEY, res.token);
      sessionStorage.setItem(API_USER_KEY, JSON.stringify(res));
      
      isAuthenticated = true;
      currentUser = res;

      setupRolePermissions();
      userInp.value = '';
      passInp.value = '';
      
      alert('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ: ' + res.hospitalName);
      switchView('dashboard', document.querySelector('.sidebar .nav-link'));
    } else {
      if (alertBox) {
        alertBox.className = 'alert alert-danger py-2 small';
        alertBox.innerText = res.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        alertBox.style.display = 'block';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'alert alert-danger py-2 small';
      alertBox.innerText = 'เชื่อมต่อล้มเหลว: ' + err.message;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i> เข้าสู่ระบบ'; }
  }
}

// ฟังก์ชันออกจากเซสชันระบบความปลอดภัย
async function handleLogout() {
  if (!confirm("คุณต้องการออกจากระบบใช่หรือไม่?")) return;
  try { await apiRequest('logout'); } catch (err) { console.warn('Logout API Warning:', err); }
  
  sessionStorage.removeItem(API_TOKEN_KEY);
  sessionStorage.removeItem(API_USER_KEY);
  
  isAuthenticated = false; 
  currentUser = null;
  
  document.querySelectorAll('.admin-menu').forEach(el => { el.style.display = 'none'; });
  const loginMenuBtn = document.getElementById('menu-login-btn');
  if (loginMenuBtn) loginMenuBtn.style.display = 'block';
  
  setupRolePermissions();
  alert('ออกจากระบบเรียบร้อยแล้ว');
  switchView('dashboard', document.querySelector('.sidebar .nav-link'));
}

// จัดการสิทธิ์การแสดงผลเมนูและปุ่มควบคุมตามบทบาทของ Account บัญชีผู้ใช้
function setupRolePermissions() {
  const adminMenus = document.querySelectorAll('.admin-menu');
  const loginMenuBtn = document.getElementById('menu-login-btn');

  if (isAuthenticated && currentUser) {
    adminMenus.forEach(el => { el.style.display = 'block'; });
    if (loginMenuBtn) loginMenuBtn.style.display = 'none';
    
    // ตั้งค่ากล่องเลือก ศบส. ในฟอร์มบันทึกข้อมูลตามสิทธิ์
    const formSelector = document.getElementById('input-hos');
    if (formSelector) {
      if (currentUser.userType === 'admin' || currentUser.hcode === '99999') {
        formSelector.disabled = false;
      } else {
        formSelector.disabled = true;
      }
    }
  } else {
    adminMenus.forEach(el => { el.style.display = 'none'; });
    if (loginMenuBtn) loginMenuBtn.style.display = 'block';
  }
}

// ฟังก์ชันบันทึกข้อมูลคลังสะสมรายเดือนจากหน้าบ้าน
async function handleFormSubmit(event) {
  event.preventDefault();
  const formEl = document.getElementById('dataForm');
  if (!formEl) return;

  if (!formEl.checkValidity()) {
    formEl.classList.add('needs-validation');
    return;
  }

  const selectSheet = document.getElementById('select-sheet').value;
  const inputHos = document.getElementById('input-hos');
  const amount = document.getElementById('input-amount').value;
  const itemName = document.getElementById('input-item').value;
  const inputMonth = document.getElementById('input-month').value;
  const ncdType = document.getElementById('input-type').value;

  const alertBox = document.getElementById('alert-message');
  const btn = document.getElementById('btn-submit');

  let hospName = "";
  if (inputHos.disabled && currentUser) {
    hospName = currentUser.hospitalName;
  } else {
    hospName = inputHos.options[inputHos.selectedIndex].text;
  }

  const recordMonth = formatInputMonthToThai(inputMonth);
  const dataPayload = {
    sheetName: selectSheet,
    hospName: hospName,
    itemName: itemName,
    amount: amount,
    recordMonth: recordMonth,
    ncdType: selectSheet === 'ncd' ? ncdType : ''
  };

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังประมวลผลคำขอ...'; }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const res = await apiRequest('saveRecord', { data: dataPayload }, 'POST');
    if (res && res.success) {
      if (alertBox) {
        alertBox.className = 'alert alert-success py-2 mt-3';
        alertBox.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${res.message}`;
        alertBox.style.display = 'block';
      }
      formEl.reset();
      formEl.classList.remove('needs-validation');
      toggleFormFields();
      
      // อัปเดตคลังข้อมูลดิบใน Local
      await refreshDataCache();
    } else {
      throw new Error(res.message);
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'alert alert-danger py-2 mt-3';
      alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> บันทึกข้อมูลไม่สำเร็จ: ${err.message}`;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล'; }
  }
}

// 🎯 ฟังก์ชันคำสั่งขอลบข้อมูลดิบ รองรับระบบยืนยันและการเช็กสิทธิ์ใหม่จาก Code.gs
async function deleteItemRecord(sheetName, rowIndex) {
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลลำดับแถวที่ ${rowIndex} ในตาราง ${sheetName}? \n* เจ้าหน้าที่จะลบและแก้ไขข้อมูลได้เฉพาะของศูนย์ตนเองเท่านั้น`)) return;
  
  showLoading(true);
  try {
    const res = await apiRequest('deleteRecord', { sheetName, rowIndex }, 'POST');
    if (res && res.success) {
      alert(res.message || 'ลบข้อมูลเสร็จสิ้น');
      await refreshDataCache();
      resetManagePageAndRender();
    } else {
      alert('ไม่สามารถลบข้อมูลได้: ' + res.message);
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการส่งคำสั่งลบ: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ฟังก์ชันดึงและรีเฟรชข้อมูลคลังระบบใหม่หลังมีการเปลี่ยนแปลงข้อมูล
async function refreshDataCache() {
  const databaseRes = await apiRequest('getAllDatabase', {}, 'GET');
  if (databaseRes && databaseRes.success) {
    dbData = databaseRes.data;
    renderDashboard();
  }
}

// ฟังก์ชันจัดการกระจายข้อมูลใส่ Selector ตัวเลือกต่างๆ ของหน้าระบบ
function populateSelectors() {
  if (!dbData || !dbData.hospital) return;
  const hosList = dbData.hospital;

  const selectors = ['hos-selector', 'ncd-hos-selector', 'cd-hos-selector', 'manage-hos-selector', 'input-hos'];
  selectors.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    // เคลียร์ค่าตัวเดิมก่อนเติม
    el.innerHTML = '';
    
    if (id === 'ncd-hos-selector' || id === 'cd-hos-selector' || id === 'manage-hos-selector') {
      const opt = document.createElement('option');
      opt.value = 'all'; opt.text = 'ภาพรวมทุกแห่ง';
      el.appendChild(opt);
    }
    if (id === 'input-hos') {
      const opt = document.createElement('option');
      opt.value = ''; opt.text = '-- เลือกหน่วยบริการ --';
      opt.disabled = true; opt.selected = true;
      el.appendChild(opt);
    }

    hosList.forEach(hos => {
      const opt = document.createElement('option');
      opt.value = hos.hcode;
      opt.text = hos['ศบส.'] || hos.hospitalName || hos.hcode;
      el.appendChild(opt);
    });
  });

  // ฝังข้อมูลชื่อรายการตัวเลือกลงในส่วนฟอร์มบันทึกข้อมูล
  toggleFormFields();
}

// ดักควบคุมการเปิด-ปิดส่วนฟิลด์ตามฐานข้อมูลที่เลือกใน Data Entry Form
function toggleFormFields() {
  const sheet = document.getElementById('select-sheet').value;
  const zone = document.getElementById('dynamic-zone');
  const itemSelect = document.getElementById('input-item');
  const ncdGroup = document.getElementById('group-ncd-type');

  if (!sheet) { if (zone) zone.style.display = 'none'; return; }
  if (zone) zone.style.display = 'block';

  if (itemSelect) itemSelect.innerHTML = '';
  if (ncdGroup) ncdGroup.style.display = sheet === 'ncd' ? 'block' : 'none';

  if (!globalSettings) return;
  const filtered = globalSettings.filter(s => s['ประเภท'] === sheet);
  
  filtered.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s['รายการ'];
    opt.text = s['รายการ'];
    if (itemSelect) itemSelect.appendChild(opt);
  });

  // ผูกการตั้งค่าสิทธิ์ล็อกการเลือกศูนย์ ศบส. อัตโนมัติหากเป็นผู้ใช้ทั่วไป
  const formSelector = document.getElementById('input-hos');
  if (formSelector && isAuthenticated && currentUser) {
    if (currentUser.userType !== 'admin' && currentUser.hcode !== '99999') {
      formSelector.value = currentUser.hcode;
      formSelector.disabled = true;
    }
  }
}

// ฟังก์ชันแก้ไขข้อมูลประชากรและบุคลากรพื้นฐาน ศบส.
function loadHospitalProfileData() {
  if (!isAuthenticated || !currentUser || !dbData || !dbData.hospital) return;
  const alertBox = document.getElementById('profile-alert');
  if (alertBox) alertBox.style.display = 'none';

  let targetHcode = currentUser.hcode;
  if (currentUser.userType === 'admin' || targetHcode === '99999') {
    // แอดมินให้ดึงศูนย์แรกขึ้นมาแสดงเป็นตัวอย่างก่อนล่วงหน้า
    targetHcode = dbData.hospital[0].hcode;
  }

  const prof = dbData.hospital.find(h => h.hcode === targetHcode);
  if (!prof) return;

  document.getElementById('prof-hos-name').value = prof['ศบส.'] || '';
  document.getElementById('prof-hcode').value = prof.hcode || '';
  document.getElementById('prof-hcode-badge').innerText = prof.hcode || 'HCODE';

  document.getElementById('prof-pop').value = parseNumber(prof['ประชากร']);
  document.getElementById('prof-male').value = parseNumber(prof['ชาย']);
  document.getElementById('prof-female').value = parseNumber(prof['หญิง']);
  document.getElementById('prof-house').value = parseNumber(prof['หลังคาเรือน']);
  document.getElementById('prof-village').value = parseNumber(prof['หมู่บ้าน/ชุมชน']);
  document.getElementById('prof-staff').value = parseNumber(prof['บุคลากร']);
  document.getElementById('prof-support').value = parseNumber(prof['บุคลากรสนับสนุน']);
  document.getElementById('prof-vhv').value = parseNumber(prof['อสม.']);
}

// บันทึกการอัปเดตข้อมูลกำลังคนและโครงสร้างประชากรพื้นฐาน ศบส.
async function handleProfileSave(event) {
  event.preventDefault();
  if (!isAuthenticated || !currentUser) return;

  const btn = document.getElementById('btn-save-profile');
  const alertBox = document.getElementById('profile-alert');

  const payload = {
    hcode: document.getElementById('prof-hcode').value,
    pop: document.getElementById('prof-pop').value,
    male: document.getElementById('prof-male').value,
    female: document.getElementById('prof-female').value,
    house: document.getElementById('prof-house').value,
    village: document.getElementById('prof-village').value,
    staff: document.getElementById('prof-staff').value,
    support: document.getElementById('prof-support').value,
    vhv: document.getElementById('prof-vhv').value
  };

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังอัปเดต...'; }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const res = await apiRequest('saveHospitalProfile', { data: payload }, 'POST');
    if (res && res.success) {
      if (alertBox) {
        alertBox.className = 'alert alert-success py-2 small';
        alertBox.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${res.message}`;
        alertBox.style.display = 'block';
      }
      await refreshDataCache();
    } else {
      throw new Error(res.message);
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'alert alert-danger py-2 small';
      alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ผิดพลาด: ${err.message}`;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> บันทึกข้อมูล'; }
  }
}

// คำนวณยอดประชากรรวมชายหญิงให้อัตโนมัติในหน้าฟอร์มโปรไฟล์
function calculateGenderSum() {
  const male = parseInt(document.getElementById('prof-male').value) || 0;
  const female = parseInt(document.getElementById('prof-female').value) || 0;
  document.getElementById('prof-pop').value = male + female;
}

// ---------------------------------------------------
// 📊 RENDER ENGINE FOR VISUALIZATION CHARTS & TABLES
// ---------------------------------------------------

function renderDashboard() {
  if (!dbData || !dbData.hospital) return;
  const hos = dbData.hospital;

  let totalPop = 0, totalHouse = 0, totalVillage = 0, totalVhv = 0, totalStaff = 0, totalSupport = 0;
  const labels = [], popValues = [], maleValues = [], femaleValues = [];

  hos.forEach(h => {
    const p = parseNumber(h['ประชากร']);
    const m = parseNumber(h['ชาย']);
    const f = parseNumber(h['หญิง']);
    
    totalPop += p;
    totalHouse += parseNumber(h['หลังคาเรือน']);
    totalVillage += parseNumber(h['หมู่บ้าน/ชุมชน']);
    totalVhv += parseNumber(h['อสม.']);
    totalStaff += parseNumber(h['บุคลากร']);
    totalSupport += parseNumber(h['บุคลากรสนับสนุน']);

    labels.push(h['ศบส.'] || 'ไม่ระบุชื่อ');
    popValues.push(p);
    maleValues.push(m);
    femaleValues.push(f);
  });

  // ฝังตัวเลขลงการ์ดภาพรวมแดชบอร์ดหลัก
  animateCounter('dash-pop', totalPop);
  animateCounter('dash-house', totalHouse);
  animateCounter('dash-village', totalVillage);
  animateCounter('dash-vhv', totalVhv);
  animateCounter('dash-staff', totalStaff);
  animateCounter('dash-support', totalSupport);

  // สร้างหรือทำลายกราฟแท่งประชากรภาพรวม ศบส.
  const popCtx = document.getElementById('popChart');
  if (popCtx) {
    if (popChartInstance) popChartInstance.destroy();
    popChartInstance = new Chart(popCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'ประชากรรับผิดชอบ (คน)', data: popValues, backgroundColor: '#42A5F5', borderRadius: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // สร้างหรือทำลายกราฟวงกลมสัดส่วนเพศ
  const genCtx = document.getElementById('genderChart');
  if (genCtx) {
    if (genderChartInstance) genderChartInstance.destroy();
    genderChartInstance = new Chart(genCtx, {
      type: 'doughnut',
      data: {
        labels: ['ชาย', 'หญิง'],
        datasets: [{ data: [maleValues.reduce((a,b)=>a+b,0), femaleValues.reduce((a,b)=>a+b,0)], backgroundColor: ['#66BB6A', '#EC407A'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function updateDetailView() {
  if (!dbData || !dbData.hospital) return;
  const hcode = document.getElementById('hos-selector').value;
  const target = dbData.hospital.find(h => h.hcode === hcode);
  if (!target) return;

  document.getElementById('detail-pop').innerText = formatComma(target['ประชากร']);
  document.getElementById('detail-house').innerText = formatComma(target['หลังคาเรือน']);
  document.getElementById('detail-village').innerText = formatComma(target['หมู่บ้าน/ชุมชน']);
  document.getElementById('detail-vhv').innerText = formatComma(target['อสม.']);
  document.getElementById('detail-staff').innerText = formatComma(target['บุคลากร']);
  document.getElementById('detail-support').innerText = formatComma(target['บุคลากรสนับสนุน']);

  const male = parseNumber(target['ชาย']);
  const female = parseNumber(target['หญิง']);

  // กราฟสัดส่วนเพศรายหน่วยงาน
  const ctxGen = document.getElementById('detailGenderChart');
  if (ctxGen) {
    if (detailGenderChartInstance) detailGenderChartInstance.destroy();
    detailGenderChartInstance = new Chart(ctxGen, {
      type: 'pie',
      data: {
        labels: ['ชาย', 'หญิง'],
        datasets: [{ data: [male, female], backgroundColor: ['#29B6F6', '#AB47BC'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // กราฟเรโชอัตราส่วนกำลังคนต่อประชากร
  const ctxRatio = document.getElementById('detailRatioChart');
  if (ctxRatio) {
    if (detailRatioChartInstance) detailRatioChartInstance.destroy();
    const staffCount = parseNumber(target['บุคลากร']) || 1;
    const vhvCount = parseNumber(target['อสม.']) || 1;
    const popVal = parseNumber(target['ประชากร']);

    detailRatioChartInstance = new Chart(ctxRatio, {
      type: 'bar',
      data: {
        labels: ['บุคลากร 1 คนดูแลประชากร', 'อสม. 1 คนดูแลประชากร'],
        datasets: [{ data: [Math.round(popVal/staffCount), Math.round(popVal/vhvCount)], backgroundColor: ['#FFCA28', '#26A69A'] }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

function renderMoneyView() {
  if (!dbData || !dbData.money || !dbData.hospital) return;
  const money = dbData.money;
  const hos = dbData.hospital;

  let totalBudget = 0, totalSpent = 0;
  const labels = [], spentRates = [];

  // เคลียร์หัวตารางและเนื้อหาตาราง
  const thead = document.getElementById('money-table-head');
  const tbody = document.getElementById('money-table-body');
  if (thead) thead.innerHTML = `<tr><th>รหัส</th><th>ศูนย์บริการสาธารณสุข</th><th>วงเงินทั้งปี (บาท)</th><th>เบิกจ่ายสะสม (บาท)</th><th>คงเหลือ (บาท)</th><th>ร้อยละการเบิกจ่าย</th></tr>`;
  if (tbody) tbody.innerHTML = '';

  hos.forEach(h => {
    const planRow = money.find(m => m.hcode === h.hcode && m['รายการ'].includes('แผนจ่ายเงิน'));
    const budget = planRow ? parseNumber(planRow['วงเงินทั้งปี'] || planRow['จำนวน']) : 0;
    
    // รวมยอดเบิกจ่ายสะสมรายเดือนของ ศบส. นั้นๆ
    const spentRows = money.filter(m => m.hcode === h.hcode && m['รายการ'].includes('รวมจ่ายเดือน'));
    const spent = spentRows.reduce((sum, r) => sum + parseNumber(r['วงเงินทั้งปี'] || r['จำนวน']), 0);

    totalBudget += budget;
    totalSpent += spent;

    const remaining = budget - spent;
    const rate = budget > 0 ? ((spent / budget) * 100).toFixed(2) : '0.00';

    labels.push(h['ศบส.']);
    spentRates.push(parseFloat(rate));

    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-monospace">${h.hcode}</td>
        <td class="fw-bold text-start">${h['ศบส.']}</td>
        <td class="text-end">${formatComma(budget)}</td>
        <td class="text-end text-danger">${formatComma(spent)}</td>
        <td class="text-end text-success">${formatComma(remaining)}</td>
        <td><span class="badge bg-pastel-blue text-primary fw-bold px-3 py-2">${rate}%</span></td>
      `;
      tbody.appendChild(tr);
    }
  });

  animateCounter('money-budget', totalBudget);
  animateCounter('money-spent', totalSpent);
  const totalRate = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(2) : '0.00';
  document.getElementById('money-rate').innerText = totalRate + '%';

  // สรุปยอดกราฟการเงินเปรียบเทียบ
  const ctx = document.getElementById('moneyChart');
  if (ctx) {
    if (moneyChartInstance) moneyChartInstance.destroy();
    moneyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: 'ร้อยละการเบิกจ่ายงบประมาณ', data: spentRates, backgroundColor: '#FF7043', borderRadius: 5 }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: { y: { max: 100, beginAtZero: true } }
      }
    });
  }
}

function updateNcdView() {
  if (!dbData || !dbData.ncd || !dbData.hospital) return;
  const selectHos = document.getElementById('ncd-hos-selector').value;
  const displayMode = document.getElementById('ncd-mode-count').checked ? 'count' : 'rate';
  const ncd = dbData.ncd;
  
  // ประมวลผลกลุ่มโรค
  const diseaseTypes = ['DM', 'HT', 'CVA', 'CKD', 'CA', 'CBTx'];
  const dataMap = { old: {}, next: {} };
  diseaseTypes.forEach(d => { dataMap.old[d] = 0; dataMap.next[d] = 0; });

  let basePopulation = 0;
  if (selectHos === 'all') {
    dbData.hospital.forEach(h => basePopulation += parseNumber(h['ประชากร']));
  } else {
    const targetHos = dbData.hospital.find(h => h.hcode === selectHos);
    if (targetHos) basePopulation = parseNumber(targetHos['ประชากร']);
  }
  if (basePopulation <= 0) basePopulation = 1;

  ncd.forEach(row => {
    if (selectHos !== 'all' && row.hcode !== selectHos) return;
    const mainKey = row['รายการหลัก'] || row['รายการ'] || '';
    const subKey = row['รายการย่อย'] || row['ประเภทผู้ป่วย'] || '';
    const num = parseNumber(row['จำนวน']);

    if (diseaseTypes.includes(mainKey)) {
      if (subKey.includes('รายเก่า')) dataMap.old[mainKey] += num;
      if (subKey.includes('รายใหม่')) dataMap.next[mainKey] += num;
    }
  });

  // แสดงผลเป็นการ์ดสรุปข้อมูล
  const cardsContainer = document.getElementById('ncd-cards-container');
  if (cardsContainer) {
    cardsContainer.innerHTML = '';
    diseaseTypes.forEach(d => {
      const oldVal = dataMap.old[d];
      const newVal = dataMap.next[d];
      const sum = oldVal + newVal;
      
      const displayVal = displayMode === 'count' ? formatComma(sum) : ((sum / basePopulation) * 100000).toFixed(1);
      const unitText = displayMode === 'count' ? 'ราย' : 'ต่อแสน ปชกร.';

      const card = document.createElement('div');
      card.className = 'col-6 col-md-2';
      card.innerHTML = `
        <div class="data-card text-center shadow-sm p-3 h-100 rounded-3 border-top border-4 border-primary bg-white">
          <h6 class="text-primary fw-bold mb-1">${d}</h6>
          <h3 class="fw-bold my-2 text-dark">${displayVal}</h3>
          <small class="text-muted d-block small">${unitText}</small>
          <div class="mt-2 text-start bg-light p-1.5 rounded" style="font-size: 0.75rem;">
            <div class="text-secondary">เก่า: <span class="float-end fw-bold">${formatComma(oldVal)}</span></div>
            <div class="text-danger">ใหม่: <span class="float-end fw-bold">+${formatComma(newVal)}</span></div>
          </div>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  // อัปเดตผูกกราฟแท่ง NCD
  const barCtx = document.getElementById('ncdBarChart');
  if (barCtx) {
    if (ncdBarChartInstance) ncdBarChartInstance.destroy();
    ncdBarChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: diseaseTypes,
        datasets: [
          { label: 'ผู้ป่วยรายเก่า (สะสม)', data: diseaseTypes.map(d => dataMap.old[d]), backgroundColor: '#26A69A' },
          { label: 'ผู้ป่วยรายใหม่', data: diseaseTypes.map(d => dataMap.next[d]), backgroundColor: '#FF7043' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
    });
  }

  // อัปเดตตาราง NCD แยกรายศูนย์ด้านล่างให้สมบูรณ์
  renderNcdTable(diseaseTypes);
}

function renderNcdTable(diseaseTypes) {
  const thead = document.getElementById('ncd-table-head');
  const tbody = document.getElementById('ncd-table-body');
  if (!thead || !tbody || !dbData || !dbData.hospital) return;

  thead.innerHTML = `<tr><th>ศบส. หน่วยบริการ</th>${diseaseTypes.map(d => `<th>${d} (เก่า/ใหม่)</th>`).join('')}</tr>`;
  tbody.innerHTML = '';

  dbData.hospital.forEach(h => {
    const tr = document.createElement('tr');
    let cells = `<td class="text-start fw-bold text-primary" style="cursor:pointer;" onclick="document.getElementById('ncd-hos-selector').value='${h.hcode}'; updateNcdView();">${h['ศบส.']}</td>`;
    
    diseaseTypes.forEach(d => {
      let oldSum = 0, newSum = 0;
      dbData.ncd.forEach(r => {
        if (r.hcode === h.hcode && (r['รายการหลัก'] === d || r['รายการ'] === d)) {
          const sub = r['รายการย่อย'] || r['ประเภทผู้ป่วย'] || '';
          const amt = parseNumber(r['จำนวน']);
          if (sub.includes('รายเก่า')) oldSum += amt;
          if (sub.includes('รายใหม่')) newSum += amt;
        }
      });
      cells += `<td>${formatComma(oldSum)} / <span class="text-danger fw-bold">+${formatComma(newSum)}</span></td>`;
    });

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

function updateCdView() {
  if (!dbData || !dbData.cd || !dbData.hospital) return;
  const selectHos = document.getElementById('cd-hos-selector').value;
  const cdData = dbData.cd;

  // รายชื่อโรคติดต่อหลักในการสแกนประมวลผลตามระบบ settings
  const cdDiseases = ['โรคไข้เลือดออก', 'วัณโรค', 'ไข้หวัดใหญ่', 'โควิด-19', 'มือเท้าปาก', 'อาหารเป็นพิษ'];
  const countMap = {};
  cdDiseases.forEach(d => countMap[d] = 0);

  cdData.forEach(row => {
    if (selectHos !== 'all' && row.hcode !== selectHos) return;
    const name = row['โรคติดต่อ'] || row['รายการ'] || '';
    const num = parseNumber(row['จำนวน']);
    if (cdDiseases.includes(name)) countMap[name] += num;
  });

  const cardsContainer = document.getElementById('cd-cards-container');
  if (cardsContainer) {
    cardsContainer.innerHTML = '';
    cdDiseases.forEach(d => {
      const card = document.createElement('div');
      card.className = 'col-6 col-lg-2';
      card.innerHTML = `
        <div class="data-card text-center shadow-sm p-3 h-100 rounded-3 border-bottom border-4 border-danger bg-white">
          <small class="text-muted text-nowrap d-block small mb-1">${d}</small>
          <h3 class="fw-bold text-danger mb-0">${formatComma(countMap[d])}</h3>
          <small class="text-muted small">ราย</small>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  // สรุปยอดกราฟแท่งสถานการณ์โรคติดต่อ CD
  const barCtx = document.getElementById('cdBarChart');
  if (barCtx) {
    if (cdBarChartInstance) cdBarChartInstance.destroy();
    cdBarChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: cdDiseases,
        datasets: [{ label: 'จำนวนผู้ป่วยสะสม (ราย)', data: cdDiseases.map(d => countMap[d]), backgroundColor: '#EF5350', borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // เรียกจำแนกสถิติดิจิทัลลงในส่วนตาราง CD ข้อมูลเชิงลึกรายศูนย์
  renderCdTable(cdDiseases);
}

function renderCdTable(cdDiseases) {
  const thead = document.getElementById('cd-table-head');
  const tbody = document.getElementById('cd-table-body');
  if (!thead || !tbody || !dbData || !dbData.hospital) return;

  thead.innerHTML = `<tr><th>ศูนย์บริการสาธารณสุข</th>${cdDiseases.map(d => `<th>${d}</th>`).join('')}</tr>`;
  tbody.innerHTML = '';

  dbData.hospital.forEach(h => {
    const tr = document.createElement('tr');
    let cells = `<td class="text-start fw-bold text-danger" style="cursor:pointer;" onclick="document.getElementById('cd-hos-selector').value='${h.hcode}'; updateCdView();">${h['ศบส.']}</td>`;
    
    cdDiseases.forEach(d => {
      let sum = 0;
      dbData.cd.forEach(r => {
        if (r.hcode === h.hcode && (r['โรคติดต่อ'] === d || r['รายการ'] === d)) {
          sum += parseNumber(r['จำนวน']);
        }
      });
      cells += `<td class="fw-bold">${formatComma(sum)}</td>`;
    });

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------
// 🛠️ ADMIN DATA MANAGEMENT ENGINE (CRUD TAB CONTROL)
// ---------------------------------------------------
let currentManagePage = 1;
const rowsPerPage = 15;

function resetManagePageAndRender() {
  currentManagePage = 1;
  renderManageView();
}

function renderManageView() {
  if (!dbData) return;
  const sheetName = document.getElementById('manage-sheet-selector').value;
  const selectHos = document.getElementById('manage-hos-selector').value;
  const rawRows = dbData[sheetName] || [];

  // กรองตามเขตโรงพยาบาล ศบส. ที่เลือก
  let filteredRows = rawRows;
  if (selectHos !== 'all') {
    filteredRows = rawRows.filter(r => r.hcode === selectHos);
  }

  const thead = document.getElementById('manage-table-head');
  const tbody = document.getElementById('manage-table-body');
  if (!thead || !tbody) return;

  // จัดการเรนเดอร์ส่วนหัวตามฟิลด์ตารางชีต
  if (sheetName === 'money') {
    thead.innerHTML = `<tr><th>แถว</th><th>HCODE</th><th>หน่วยบริการ</th><th>รายการ</th><th>ยอดเงิน (บาท)</th><th>การจัดการ</th></tr>`;
  } else if (sheetName === 'ncd') {
    thead.innerHTML = `<tr><th>แถว</th><th>HCODE</th><th>หน่วยบริการ</th><th>โรคหลัก</th><th>ประเภท</th><th>วันที่คีย์</th><th>รอบเดือน</th><th>จำนวน</th><th>การจัดการ</th></tr>`;
  } else {
    thead.innerHTML = `<tr><th>แถว</th><th>HCODE</th><th>หน่วยบริการ</th><th>ชื่อโรคติดต่อ</th><th>วันที่คีย์</th><th>รอบเดือน</th><th>จำนวน</th><th>การจัดการ</th></tr>`;
  }

  tbody.innerHTML = '';
  
  // จัดทำระบบแบ่งหน้า Pagination Control
  const totalItems = filteredRows.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
  
  if (currentManagePage > totalPages) currentManagePage = totalPages;
  const startIdx = (currentManagePage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, totalItems);

  const pageItems = filteredRows.slice(startIdx, endIdx);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบรายการข้อมูลในระบบ</td></tr>`;
    document.getElementById('manage-table-info').innerText = `กำลังแสดงข้อมูล 0 ถึง 0 จากทั้งหมด 0 รายการ`;
    document.getElementById('manage-pagination-controls').innerHTML = '';
    return;
  }

  pageItems.forEach(item => {
    const tr = document.createElement('tr');
    
    // กำหนดโครงสร้างคอลัมน์แถวข้อมูลดิบในการจัดแสดง
    let cellContent = `<td class="font-monospace text-center bg-light">${item._rowIndex}</td>
                       <td class="font-monospace text-center">${item.hcode}</td>
                       <td class="text-start">${item.Hospital || item.hospitalName || ''}</td>`;
    
    if (sheetName === 'money') {
      cellContent += `<td class="text-start">${item['รายการ']}</td>
                      <td class="text-end fw-bold">${formatComma(item['วงเงินทั้งปี'] || item['จำนวน'])}</td>`;
    } else if (sheetName === 'ncd') {
      cellContent += `<td class="fw-bold text-primary">${item['รายการหลัก'] || item['รายการ'] || ''}</td>
                      <td><span class="badge bg-light text-dark">${item['รายการย่อย'] || item['ประเภทผู้ป่วย'] || ''}</span></td>
                      <td class="small">${item['วันที่'] || ''}</td>
                      <td class="font-monospace text-center">${item['เดือน'] || ''}</td>
                      <td class="fw-bold text-end">${formatComma(item['จำนวน'])}</td>`;
    } else {
      cellContent += `<td class="fw-bold text-danger">${item['โรคติดต่อ'] || item['รายการ'] || ''}</td>
                      <td class="small">${item['วันที่'] || ''}</td>
                      <td class="font-monospace text-center">${item['เดือน'] || ''}</td>
                      <td class="fw-bold text-end">${formatComma(item['จำนวน'])}</td>`;
    }

    // 🎯 เพิ่มปุ่มลบรายการข้อมูล โดยเรียกฟังก์ชันตรวจสอบสิทธิ์ที่สอดคล้องหลังบ้าน
    cellContent += `
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger px-2 py-1" onclick="deleteItemRecord('${sheetName}', ${item._rowIndex})">
          <i class="bi bi-trash3-fill"></i> ลบ
        </button>
      </td>
    `;
    tr.innerHTML = cellContent;
    tbody.appendChild(tr);
  });

  // แสดงตัวเลขกำกับชุดหน้าข้อมูลปัจจุบัน
  document.getElementById('manage-table-info').innerText = `กำลังแสดงข้อมูล ${startIdx + 1} ถึง ${endIdx} จากทั้งหมด ${totalItems} รายการ`;
  
  // เรนเดอร์ปุ่มสลับหน้า Pagination Element
  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  const container = document.getElementById('manage-pagination-controls');
  if (!container) return;
  container.innerHTML = '';

  // ปุ่มย้อนกลับ (Previous)
  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${currentManagePage === 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<a class="page-link" href="#" onclick="currentManagePage--; renderManageView(); return false;">&laquo;</a>`;
  container.appendChild(prevLi);

  // เม็ดปุ่มเลขหน้า
  for (let i = 1; i <= totalPages; i++) {
    const li = document.createElement('li');
    li.className = `page-item ${currentManagePage === i ? 'active' : ''}`;
    li.innerHTML = `<a class="page-link" href="#" onclick="currentManagePage = ${i}; renderManageView(); return false;">${i}</a>`;
    container.appendChild(li);
  }

  // ปุ่มหน้าถัดไป (Next)
  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${currentManagePage === totalPages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<a class="page-link" href="#" onclick="currentManagePage++; renderManageView(); return false;">&raquo;</a>`;
  container.appendChild(nextLi);
}

// ---------------------------------------------------
// 🧮 UTILITY HELPERS FOR VALUE TEXT & ANIMATION CONTROLS
// ---------------------------------------------------

function parseNumber(val) {
  if (!val) return 0;
  const str = String(val).replace(/,/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function formatComma(num) {
  const n = parseNumber(num);
  return n.toLocaleString('th-TH');
}

function formatInputMonthToThai(inputMonthStr) {
  if (!inputMonthStr) return '';
  const parts = inputMonthStr.split('-'); // ex: "2026-03"
  if (parts.length < 2) return inputMonthStr;
  
  const yearEng = parseInt(parts[0]);
  const monthIdx = parseInt(parts[1]) - 1;
  const yearThai = yearEng + 543;

  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return thaiMonths[monthIdx] + ' ' + yearThai;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showLoading(visible) {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = visible ? 'block' : 'none';
}

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;

  if (show === undefined) {
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
  } else if (show) {
    sidebar.classList.add('show');
    overlay.classList.add('show');
  } else {
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
  }
}

function togglePassword() {
  const passInp = document.getElementById('admin-pass');
  const icon = document.getElementById('eyeIcon');
  if (!passInp || !icon) return;

  if (passInp.type === 'password') {
    passInp.type = 'text';
    icon.className = 'bi bi-eye text-primary';
  } else {
    passInp.type = 'password';
    icon.className = 'bi bi-eye-slash text-muted';
  }
}

function animateCounter(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const duration = 1000;
  const startFrameTime = performance.now();
  const startValue = 0;

  function updateCount(currentTime) {
    const elapsed = currentTime - startFrameTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out quad effect
    const easeProgress = progress * (2 - progress);
    const currentVal = Math.floor(startValue + (targetValue - startValue) * easeProgress);
    
    el.innerText = formatComma(currentVal);

    if (progress < 1) {
      requestAnimationFrame(updateCount);
    } else {
      el.innerText = formatComma(targetValue);
    }
  }
  requestAnimationFrame(updateCount);
}

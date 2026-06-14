// ==========================================
// 0. ตั้งค่าการเชื่อมต่อ API
// ==========================================
const API_URL = 'https://script.google.com/macros/s/AKfycbww-NQAqS9uzBPS5EKgQwXKtI94Kmc4cCA882xV4Nru-JBatXZLg44Jz8JQxhugaP0E/exec';

// 1. ประกาศตัวแปรทั้งหมด (เหมือนเดิม)
let hospitalData = [], moneyData = [], ncdData = [], cdData = [], settingsData = [];
let popChartObj = null, genderChartObj = null, detailGenderChartObj = null, detailRatioChartObj = null, moneyChartObj = null;
let ncdBarChartObj = null, ncdPieChartObj = null;
let cdLineChartObj = null, cdBarChartObj = null;
let isAuthenticated = false; 
let manageCurrentPage = 1; 
const managePageSize = 30;

// 2. โหลดข้อมูลทั้งหมดเมื่อเปิดเว็บ (เปลี่ยนมาใช้ fetch API)
document.addEventListener("DOMContentLoaded", async function() {
  try {
    // ส่งคำสั่ง GET ไปยัง API เพื่อขอข้อมูล getAll
    const response = await fetch(`${API_URL}?action=getAll`);
    const allRes = await response.json();

    // แกะแพ็กเกจข้อมูลที่มัดรวมมา กระจายลงตัวแปร
    hospitalData = allRes.hospital;
    moneyData = allRes.money;
    ncdData = allRes.ncd;
    cdData = allRes.cd;
    settingsData = allRes.settings;
    
    // ปิดหน้าจอโหลด และเริ่มวาดกราฟ
    document.getElementById('loading').style.display = 'none';
    initApp();

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการโหลดข้อมูล:", error);
    document.getElementById('loading').innerHTML = '<p class="text-danger mt-3"><i class="bi bi-x-circle-fill"></i> ไม่สามารถดึงข้อมูลจากระบบได้ กรุณารีเฟรชหน้าเว็บ</p>';
  }
});

// 3. ระบบควบคุม UI และเมนู
function toggleSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  } else {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('mainContent').classList.toggle('expanded');
  }
}

function switchView(viewId, element) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  element.classList.add('active');
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('sidebarOverlay').classList.remove('show');
  }
}

function initApp() {
  renderDashboard(hospitalData);
  
  const selector = document.getElementById('hos-selector');
  const ncdSelector = document.getElementById('ncd-hos-selector');
  const cdSelector = document.getElementById('cd-hos-selector');
  const formSelector = document.getElementById('input-hos'); 
  const manageHosSelector = document.getElementById('manage-hos-selector'); 
  
  selector.innerHTML = ""; 
  ncdSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>';
  cdSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>';
  if(manageHosSelector) manageHosSelector.innerHTML = '<option value="all">ภาพรวมทุกแห่ง</option>'; 
  if(formSelector) formSelector.innerHTML = '<option value="" selected disabled>-- เลือกหน่วยบริการ --</option>';
  
  hospitalData.forEach((row, index) => {
    let option = new Option(row['ศบส.'], index);
    if(row['ศบส.'] === 'ศบส.บ้านโทกหัวช้าง') option.selected = true;
    selector.appendChild(option);
    
    let hosNameText = row['Hospital'] || row['ศบส.'];
    ncdSelector.appendChild(new Option(row['ศบส.'], hosNameText));
    cdSelector.appendChild(new Option(row['ศบส.'], hosNameText));
    if(formSelector) formSelector.appendChild(new Option(row['ศบส.'], hosNameText));
    if(manageHosSelector) manageHosSelector.appendChild(new Option(row['ศบส.'], hosNameText)); 
  });
  
  renderMoneyView();
  updateDetailView();
  updateNcdView(); 
  updateCdView(); 
  renderManageTable();

  switchView('dashboard', document.querySelector('.nav-link.active'));
}

const cleanNum = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;

// 5. ระบบวาดกราฟและตาราง (Dashboard, Detail, Money, NCD, CD)
function renderDashboard(data) {
  let sumPop = 0, sumHouse = 0, sumVhv = 0, sumStaff = 0, sumMale = 0, sumFemale = 0;
  let labels = [], popData = [];
  data.forEach(row => {
    let pop = cleanNum(row['ประชากร']); sumPop += pop; sumHouse += cleanNum(row['หลังคาเรือน']);
    sumVhv += cleanNum(row['อสม.']); sumStaff += cleanNum(row['บุคลากร']);
    sumMale += cleanNum(row['ชาย']); sumFemale += cleanNum(row['หญิง']);
    labels.push(row['ศบส.']); popData.push(pop);
  });
  document.getElementById('sum-pop').innerText = sumPop.toLocaleString();
  document.getElementById('sum-house').innerText = sumHouse.toLocaleString();
  document.getElementById('sum-vhv').innerText = sumVhv.toLocaleString();
  document.getElementById('sum-staff').innerText = sumStaff.toLocaleString();

  if(popChartObj) popChartObj.destroy();
  popChartObj = new Chart(document.getElementById('popChart').getContext('2d'), {
    type: 'bar', data: { labels: labels, datasets: [{ label: 'จำนวนประชากร', data: popData, backgroundColor: '#90CAF9', borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  if(genderChartObj) genderChartObj.destroy();
  genderChartObj = new Chart(document.getElementById('genderChart').getContext('2d'), {
    type: 'doughnut', data: { labels: ['ชาย', 'หญิง'], datasets: [{ data: [sumMale, sumFemale], backgroundColor: ['#90CAF9', '#F48FB1'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
  });
}

function updateDetailView() {
  const data = hospitalData[document.getElementById('hos-selector').value];
  const pop = cleanNum(data['ประชากร']), male = cleanNum(data['ชาย']), female = cleanNum(data['หญิง']);
  const house = cleanNum(data['หลังคาเรือน']), village = cleanNum(data['หมู่บ้าน/ชุมชน']);
  const vhv = cleanNum(data['อสม.']), staff = cleanNum(data['บุคลากร']);

  document.getElementById('detail-pop').innerText = pop.toLocaleString();
  document.getElementById('detail-house').innerText = house.toLocaleString();
  document.getElementById('detail-village').innerText = village.toLocaleString();
  document.getElementById('detail-vhv').innerText = vhv.toLocaleString();
  document.getElementById('detail-staff').innerText = staff.toLocaleString();

  if (detailGenderChartObj) detailGenderChartObj.destroy();
  detailGenderChartObj = new Chart(document.getElementById('detailGenderChart').getContext('2d'), {
    type: 'doughnut', data: { labels: ['ชาย', 'หญิง'], datasets: [{ data: [male, female], backgroundColor: ['#90CAF9', '#F48FB1'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
  });

  const popPerVhv = (pop / (vhv || 1)).toFixed(0), popPerStaff = (pop / (staff || 1)).toFixed(0);
  if (detailRatioChartObj) detailRatioChartObj.destroy();
  detailRatioChartObj = new Chart(document.getElementById('detailRatioChart').getContext('2d'), {
    type: 'bar', data: { labels: ['ประชากร/อสม.', 'ประชากร/บุคลากร'], datasets: [{ data: [popPerVhv, popPerStaff], backgroundColor: ['#A5D6A7', '#CE93D8'], borderRadius: 6, barPercentage: 0.5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderMoneyView() {
  let finSummary = {}, totalAllBudget = 0, totalAllSpent = 0;
  moneyData.forEach(row => {
    let name = row['Hospital'], itemType = row['รายการ'], amount = cleanNum(row['วงเงินทั้งปี']);
    if(!name) return;
    if(!finSummary[name]) finSummary[name] = { budget: 0, spent: 0 };
    if(itemType === 'แผนจ่ายเงิน') finSummary[name].budget += amount;
    else if (itemType && itemType.includes('รวมจ่ายเดือน')) finSummary[name].spent += amount;
  });

  let labels = [], budgetData = [], spentData = [], tableBody = document.getElementById('money-table-body');
  tableBody.innerHTML = "";

  for(let hosName in finSummary) {
    let b = finSummary[hosName].budget, s = finSummary[hosName].spent, r = b - s;
    let percent = b > 0 ? ((s / b) * 100).toFixed(1) : 0;
    totalAllBudget += b; totalAllSpent += s;
    labels.push(hosName); budgetData.push(b); spentData.push(s);

    let tr = document.createElement('tr');
    tr.innerHTML = `<td class="fw-medium">${hosName}</td>
      <td class="text-end text-primary">${b.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td class="text-end text-warning">${s.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td class="text-end ${r >= 0 ? 'text-success':'text-danger'}">${r.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td class="text-center"><span class="badge ${percent > 80 ? 'bg-success' : 'bg-info'} text-white rounded-pill px-3 py-2">${percent}%</span></td>`;
    tableBody.appendChild(tr);
  }
  document.getElementById('fin-total-budget').innerText = totalAllBudget.toLocaleString(undefined, {maximumFractionDigits: 2});
  document.getElementById('fin-total-spent').innerText = totalAllSpent.toLocaleString(undefined, {maximumFractionDigits: 2});
  document.getElementById('fin-total-remain').innerText = (totalAllBudget - totalAllSpent).toLocaleString(undefined, {maximumFractionDigits: 2});

  if(moneyChartObj) moneyChartObj.destroy();
  moneyChartObj = new Chart(document.getElementById('moneyChart').getContext('2d'), {
    type: 'bar', data: { labels: labels, datasets: [{ label: 'งบประมาณทั้งปี', data: budgetData, backgroundColor: '#90CAF9', borderRadius: 4 }, { label: 'เบิกจ่ายสะสม', data: spentData, backgroundColor: '#FFCC80', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return value.toLocaleString(); } } } }, plugins: { legend: { position: 'top' } } }
  });
}

function updateNcdView() {
  const selectedHos = document.getElementById('ncd-hos-selector').value;
  let latestOldCases = {}, totalNewCases = {}, uniqueDiseases = new Set();
  let tableMatrix = {}; 
  let allHospitalsSet = new Set();
  let diseaseTotals = {}; 

  ncdData.forEach(row => {
    let hosName = row['Hospital'];
    let disease = row['รายการหลัก'];
    let type = row['รายการย่อย'];
    let count = cleanNum(row['จำนวน']);
    if (!hosName || !disease) return;

    uniqueDiseases.add(disease);
    allHospitalsSet.add(hosName);

    if (!tableMatrix[hosName]) tableMatrix[hosName] = { name: hosName, data: {}, total: 0 };
    if (!tableMatrix[hosName].data[disease]) tableMatrix[hosName].data[disease] = { old: 0, new: 0 };

    if (type === 'รายเก่า') {
      if (count > tableMatrix[hosName].data[disease].old) tableMatrix[hosName].data[disease].old = count;
    } else if (type === 'รายใหม่') {
      tableMatrix[hosName].data[disease].new += count;
    }
    
    if (selectedHos !== 'all' && hosName !== selectedHos) return;
    let key = hosName + "_" + disease;
    if (type === 'รายเก่า') {
      if (!latestOldCases[key] || count > latestOldCases[key]) latestOldCases[key] = count;
    } else if (type === 'รายใหม่') {
      totalNewCases[key] = (totalNewCases[key] || 0) + count;
    }
  });

  let ncdSummary = {};
  uniqueDiseases.forEach(d => { ncdSummary[d] = { old: 0, new: 0 }; });
  for (let key in latestOldCases) ncdSummary[key.split("_")[1]].old += latestOldCases[key];
  for (let key in totalNewCases) ncdSummary[key.split("_")[1]].new += totalNewCases[key];
  let sortedChartData = Object.keys(ncdSummary).map(d => {
    return { disease: d, old: ncdSummary[d].old, new: ncdSummary[d].new, total: ncdSummary[d].old + ncdSummary[d].new };
  }).sort((a, b) => b.total - a.total);

  const cardsContainer = document.getElementById('ncd-cards-container');
  cardsContainer.innerHTML = '';
  const textColors = ['#1976D2', '#C2185B', '#F57C00', '#388E3C', '#7B1FA2', '#0097A7', '#FFA000', '#D84315'];
  sortedChartData.forEach((item, index) => {
    cardsContainer.innerHTML += `
      <div class="col-6 col-md-3 mb-3">
        <div class="data-card text-center" style="background-color: #F8FAFC; border-bottom: 4px solid ${textColors[index % textColors.length]}; height: 100%;">
          <h6 class="text-muted small">${item.disease}</h6>
          <h3 class="fw-bold mb-0" style="color: ${textColors[index % textColors.length]};">${item.total.toLocaleString()}</h3>
        </div>
      </div>`;
  });

  if(ncdBarChartObj) ncdBarChartObj.destroy();
  ncdBarChartObj = new Chart(document.getElementById('ncdBarChart').getContext('2d'), {
    type: 'bar',
    data: { labels: sortedChartData.map(i=>i.disease), datasets: [ { label: 'รายเก่าสะสม', data: sortedChartData.map(i=>i.old), backgroundColor: '#90CAF9' }, { label: 'รายใหม่', data: sortedChartData.map(i=>i.new), backgroundColor: '#F48FB1' } ] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });

  if(ncdPieChartObj) ncdPieChartObj.destroy();
  ncdPieChartObj = new Chart(document.getElementById('ncdPieChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: sortedChartData.map(i=>i.disease), datasets: [{ data: sortedChartData.map(i=>i.total), backgroundColor: ['#90CAF9', '#F48FB1', '#FFCC80', '#A5D6A7', '#CE93D8', '#80DEEA', '#FFE082', '#FFAB91'] }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
  });

  const tHead = document.getElementById('ncd-table-head');
  const tBody = document.getElementById('ncd-table-body');
  
  let finalHosList = [];
  let diseaseTotalMap = {};
  uniqueDiseases.forEach(d => diseaseTotalMap[d] = 0);

  for (let hos in tableMatrix) {
    let hosTotal = 0;
    for (let d in tableMatrix[hos].data) {
      let sum = tableMatrix[hos].data[d].old + tableMatrix[hos].data[d].new;
      hosTotal += sum;
      diseaseTotalMap[d] += sum;
    }
    tableMatrix[hos].total = hosTotal;
    finalHosList.push(tableMatrix[hos]);
  }

  finalHosList.sort((a, b) => b.total - a.total);
  let sortedDiseases = Array.from(uniqueDiseases).sort((a, b) => diseaseTotalMap[b] - diseaseTotalMap[a]);

  let theadHTML = `<tr><th class="text-start bg-light" style="min-width: 180px;">หน่วยบริการ (เรียงจากมากไปน้อย)</th>`;
  sortedDiseases.forEach(d => {
    theadHTML += `<th class="bg-light">${d}</th>`;
  });
  theadHTML += `<th class="bg-dark text-white">รวมทุกโรค</th></tr>`;
  tHead.innerHTML = theadHTML;

  tBody.innerHTML = '';
  finalHosList.forEach(hosObj => {
    let tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (hosObj.name === selectedHos) tr.classList.add('table-primary');

    tr.onclick = function() {
      document.getElementById('ncd-hos-selector').value = hosObj.name;
      updateNcdView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    let maxInRow = 0;
    sortedDiseases.forEach(d => {
      let val = (hosObj.data[d] ? hosObj.data[d].old + hosObj.data[d].new : 0);
      if (val > maxInRow) maxInRow = val;
    });

    let tdHTML = `<td class="text-start fw-medium"><i class="bi bi-hospital me-2"></i>${hosObj.name}</td>`;
    sortedDiseases.forEach(d => {
      let val = (hosObj.data[d] ? hosObj.data[d].old + hosObj.data[d].new : 0);
      let style = (val === maxInRow && val > 0) ? 'class="fw-bold text-primary" style="background-color: #E0F2FE;"' : '';
      tdHTML += `<td ${style}>${val.toLocaleString()}</td>`;
    });

    tdHTML += `<td class="fw-bold bg-light">${hosObj.total.toLocaleString()}</td>`;
    tr.innerHTML = tdHTML;
    tBody.appendChild(tr);
  });

  let trFoot = document.createElement('tr');
  trFoot.className = 'table-dark fw-bold';
  let footHTML = `<td class="text-start">ยอดรวมทุกแห่ง</td>`;
  let grandTotal = 0;
  sortedDiseases.forEach(d => {
    footHTML += `<td>${diseaseTotalMap[d].toLocaleString()}</td>`;
    grandTotal += diseaseTotalMap[d];
  });
  footHTML += `<td style="color: #6EE7B7;">${grandTotal.toLocaleString()}</td>`;
  trFoot.innerHTML = footHTML;
  trFoot.onclick = function() {
      document.getElementById('ncd-hos-selector').value = 'all';
      updateNcdView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  tBody.appendChild(trFoot);
}

function updateCdView() {
  const selectedHos = document.getElementById('cd-hos-selector').value;
  
  let summary = {}, trendData = {}, monthsSet = new Set();
  let tableMatrix = {};
  let uniqueDiseases = new Set();
  let diseaseTotalMap = {};

  cdData.forEach(row => {
    let hosName = row['Hospital'];
    let disease = row['โรคติดต่อ'];
    let month = row['เดือน'];
    let count = cleanNum(row['จำนวน']);
    if (!hosName || !disease) return;

    uniqueDiseases.add(disease);

    if (!tableMatrix[hosName]) tableMatrix[hosName] = { name: hosName, data: {}, total: 0 };
    if (!tableMatrix[hosName].data[disease]) tableMatrix[hosName].data[disease] = 0;
    tableMatrix[hosName].data[disease] += count;

    if (selectedHos !== 'all' && hosName !== selectedHos) return;

    if (!summary[disease]) summary[disease] = 0;
    summary[disease] += count;

    if (month) {
      monthsSet.add(month);
      if (!trendData[month]) trendData[month] = {};
      if (!trendData[month][disease]) trendData[month][disease] = 0;
      trendData[month][disease] += count;
    }
  });

  let sortedDiseasesForCards = Object.keys(summary).map(d => { 
    return { disease: d, total: summary[d] }; 
  }).sort((a, b) => b.total - a.total);
  
  const cardsContainer = document.getElementById('cd-cards-container');
  cardsContainer.innerHTML = '';
  const textColors = ['#C2185B', '#F57C00', '#388E3C', '#1976D2', '#7B1FA2', '#0097A7', '#FFA000', '#D84315'];
  
  sortedDiseasesForCards.forEach((item, index) => {
    cardsContainer.innerHTML += `
      <div class="col-6 col-md-3 mb-3">
        <div class="data-card text-center" style="background-color: #F8FAFC; border-bottom: 4px solid ${textColors[index % textColors.length]}; height: 100%;">
          <h6 class="text-muted small">${item.disease}</h6>
          <h3 class="fw-bold mb-0" style="color: ${textColors[index % textColors.length]};">${item.total.toLocaleString()}</h3>
        </div>
      </div>`;
  });

  const chartLabels = sortedDiseasesForCards.map(item => item.disease);
  const chartData = sortedDiseasesForCards.map(item => item.total);

  if (cdBarChartObj) cdBarChartObj.destroy();
  cdBarChartObj = new Chart(document.getElementById('cdBarChart').getContext('2d'), {
    type: 'bar',
    data: { labels: chartLabels, datasets: [{ label: 'จำนวนผู้ป่วยสะสม', data: chartData, backgroundColor: '#FFAB91', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
  });

  let sortedMonths = Array.from(monthsSet).sort((a, b) => {
    let [mA, yA] = a.split('/'); let [mB, yB] = b.split('/');
    return new Date(yA, mA - 1) - new Date(yB, mB - 1);
  });

  let lineDatasets = sortedDiseasesForCards.map((item, index) => {
    let dataPts = sortedMonths.map(m => trendData[m] && trendData[m][item.disease] ? trendData[m][item.disease] : 0);
    let color = textColors[index % textColors.length];
    return { label: item.disease, data: dataPts, borderColor: color, backgroundColor: color, tension: 0.3, fill: false, borderWidth: 2, pointRadius: 4 };
  });

  if (cdLineChartObj) cdLineChartObj.destroy();
  cdLineChartObj = new Chart(document.getElementById('cdLineChart').getContext('2d'), {
    type: 'line', data: { labels: sortedMonths, datasets: lineDatasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { y: { beginAtZero: true } } }
  });

  const tHead = document.getElementById('cd-table-head');
  const tBody = document.getElementById('cd-table-body');
  if (!tHead || !tBody) return;

  let finalHosList = [];
  uniqueDiseases.forEach(d => diseaseTotalMap[d] = 0);

  for (let hos in tableMatrix) {
    let hosTotal = 0;
    for (let d in tableMatrix[hos].data) {
      let sum = tableMatrix[hos].data[d];
      hosTotal += sum;
      diseaseTotalMap[d] += sum;
    }
    tableMatrix[hos].total = hosTotal;
    finalHosList.push(tableMatrix[hos]);
  }

  finalHosList.sort((a, b) => b.total - a.total);
  let sortedCDDiseases = Array.from(uniqueDiseases).sort((a, b) => diseaseTotalMap[b] - diseaseTotalMap[a]);

  let theadHTML = `<tr><th class="text-start bg-light" style="min-width: 180px;">หน่วยบริการ (เรียงตามจำนวนผู้ป่วย)</th>`;
  sortedCDDiseases.forEach(d => {
    theadHTML += `<th class="bg-light">${d}</th>`;
  });
  theadHTML += `<th class="bg-dark text-white">รวมทุกโรคติดต่อ</th></tr>`;
  tHead.innerHTML = theadHTML;

  tBody.innerHTML = '';
  finalHosList.forEach(hosObj => {
    let tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (hosObj.name === selectedHos) tr.classList.add('table-primary');

    tr.onclick = function() {
      document.getElementById('cd-hos-selector').value = hosObj.name;
      updateCdView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    let maxInRow = 0;
    sortedCDDiseases.forEach(d => {
      let val = hosObj.data[d] || 0;
      if (val > maxInRow) maxInRow = val;
    });

    let tdHTML = `<td class="text-start fw-medium"><i class="bi bi-hospital me-2"></i>${hosObj.name}</td>`;
    sortedCDDiseases.forEach(d => {
      let val = hosObj.data[d] || 0;
      let style = (val === maxInRow && val > 0) ? 'class="fw-bold text-danger" style="background-color: #FFE4E6;"' : '';
      tdHTML += `<td ${style}>${val.toLocaleString()}</td>`;
    });

    tdHTML += `<td class="fw-bold bg-light">${hosObj.total.toLocaleString()}</td>`;
    tr.innerHTML = tdHTML;
    tBody.appendChild(tr);
  });

  let trFoot = document.createElement('tr');
  trFoot.className = 'table-dark fw-bold';
  if (selectedHos === 'all') trFoot.classList.add('table-warning');

  let footHTML = `<td class="text-start">ยอดรวมทุกแห่ง</td>`;
  let grandTotal = 0;
  sortedCDDiseases.forEach(d => {
    footHTML += `<td>${diseaseTotalMap[d].toLocaleString()}</td>`;
    grandTotal += diseaseTotalMap[d];
  });
  footHTML += `<td style="color: #FF8A80;">${grandTotal.toLocaleString()}</td>`;
  trFoot.innerHTML = footHTML;
  
  trFoot.onclick = function() {
    document.getElementById('cd-hos-selector').value = 'all';
    updateCdView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  tBody.appendChild(trFoot);
}

// 6. ระบบตรวจสอบสิทธิ์ (Login) - เปลี่ยนมาใช้ fetch API
function checkAuth(element) {
  if (isAuthenticated) {
    switchView('form', element);
  } else {
    switchView('login', element);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('admin-pin').value;
  const btn = document.getElementById('btn-login');
  const alertBox = document.getElementById('login-alert');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> ตรวจสอบข้อมูล...';
  alertBox.style.display = 'none';

  try {
    const payload = {
      action: 'verifyAdmin',
      pin: pin
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const res = await response.json();

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-unlock-fill me-2"></i> ปลดล็อคระบบ';
    
    if (res.success) {
      isAuthenticated = true;
      document.getElementById('admin-pin').value = ''; 
      
      document.getElementById('menu-login-btn').style.display = 'none';
      document.querySelectorAll('.admin-menu').forEach(el => el.style.display = 'block');
      
      const formNav = document.querySelector('.admin-menu .nav-link');
      switchView('form', formNav);
    } else {
      alertBox.className = 'alert alert-danger py-2';
      alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${res.message}`;
      alertBox.style.display = 'block';
    }
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-unlock-fill me-2"></i> ปลดล็อคระบบ';
    alertBox.className = 'alert alert-danger py-2';
    alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ขัดข้อง ไม่สามารถเชื่อมต่อระบบได้`;
    alertBox.style.display = 'block';
  }
}

// 7. ระบบฟอร์มและ Validation
function toggleFormFields() {
  const sheet = document.getElementById('select-sheet').value;
  const dynamicZone = document.getElementById('dynamic-zone');
  const inputItem = document.getElementById('input-item');
  const labelItem = document.getElementById('label-item');
  const feedbackItem = document.getElementById('feedback-item');
  const groupType = document.getElementById('group-ncd-type');
  const inputType = document.getElementById('input-type');

  if (!sheet) {
    dynamicZone.style.display = 'none';
    return;
  }
  
  dynamicZone.style.display = 'block';
  inputItem.innerHTML = '<option value="" selected disabled>-- เลือกรายการ --</option>';

  const filteredOptions = settingsData.filter(row => row['ประเภท'] === sheet);
  filteredOptions.forEach(row => {
    if (row['รายการ']) {
      inputItem.innerHTML += `<option value="${row['รายการ']}">${row['รายการ']}</option>`;
    }
  });

  if (sheet === 'money') {
    labelItem.innerText = 'รายการเบิกจ่าย';
    feedbackItem.innerText = 'กรุณาเลือกรายการเบิกจ่าย';
    groupType.style.display = 'none';
    inputType.required = false;
  } else if (sheet === 'ncd') {
    labelItem.innerText = 'กลุ่มโรคเรื้อรัง (NCDs)';
    feedbackItem.innerText = 'กรุณาเลือกโรค';
    groupType.style.display = 'block'; 
    inputType.required = true;
  } else if (sheet === 'cd') {
    labelItem.innerText = 'โรคติดต่อ (CD)';
    feedbackItem.innerText = 'กรุณาเลือกโรคติดต่อ';
    groupType.style.display = 'none';
    inputType.required = false;
  }
}

// บันทึกฟอร์ม (เปลี่ยนมาใช้ fetch API)
async function handleFormSubmit(e) {
  e.preventDefault(); 
  const form = document.getElementById('dataForm');
  
  if (!form.checkValidity()) {
    e.stopPropagation();
    form.classList.add('was-validated'); 
    return; 
  }

  const btn = document.getElementById('btn-submit');
  const alertBox = document.getElementById('alert-message');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> กำลังบันทึก...';
  alertBox.style.display = 'none';

  const monthInput = document.getElementById('input-month').value; 
  let [year, monthNum] = monthInput.split('-');
  const monthText = `${parseInt(monthNum)}/${year}`; 

  const formData = {
    sheetName: document.getElementById('select-sheet').value,
    hospName: document.getElementById('input-hos').value,
    itemName: document.getElementById('input-item').value,
    ncdType: document.getElementById('input-type').value,
    recordMonth: monthText, 
    amount: parseFloat(document.getElementById('input-amount').value)
  };

  try {
    const payload = {
      action: 'save',
      formData: formData
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const res = await response.json();

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล';
    
    alertBox.style.display = 'block';
    if (res.success) {
      alertBox.className = 'alert alert-success mt-4';
      alertBox.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> ${res.message}`;
      form.reset();
      form.classList.remove('was-validated'); 
      document.getElementById('dynamic-zone').style.display = 'none'; 
      setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
      
      // หมายเหตุ: หากต้องการให้ข้อมูลใหม่แสดงบนกราฟทันที 
      // สามารถเรียกใช้งานคำสั่ง location.reload(); ตรงนี้ได้เลยครับ
    } else {
      alertBox.className = 'alert alert-danger mt-4';
      alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${res.message}`;
    }
  } catch (error) {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save2 me-2"></i> บันทึกข้อมูล';
    alertBox.className = 'alert alert-danger mt-4';
    alertBox.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ขัดข้อง ไม่สามารถเชื่อมต่อระบบฐานข้อมูลได้`;
    alertBox.style.display = 'block';
  }
}

// ==========================================
// 8. ระบบจัดการฐานข้อมูล
// ==========================================
function resetManagePageAndRender() {
  manageCurrentPage = 1;
  renderManageTable();
}

function renderManageTable() {
  const sheetName = document.getElementById('manage-sheet-selector').value;
  const selectedHos = document.getElementById('manage-hos-selector').value;
  const thead = document.getElementById('manage-table-head');
  const tbody = document.getElementById('manage-table-body');
  const infoBox = document.getElementById('manage-table-info');
  const paginationControls = document.getElementById('manage-pagination-controls');
  
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if(paginationControls) paginationControls.innerHTML = '';
  
  let rawData = [];
  if (sheetName === 'money') rawData = moneyData;
  else if (sheetName === 'ncd') rawData = ncdData;
  else if (sheetName === 'cd') rawData = cdData;
  
  if (rawData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบข้อมูลในระบบ</td></tr>';
    if(infoBox) infoBox.innerText = 'กำลังแสดงข้อมูล 0 ถึง 0 จากทั้งหมด 0 รายการ';
    return;
  }

  let filteredData = [];
  rawData.forEach((row, index) => {
    let hosName = row['Hospital'] || row['ศบส.'];
    if (selectedHos === 'all' || hosName === selectedHos) {
      filteredData.push({
        content: row,
        actualRowIndex: index + 2 
      });
    }
  });
  
  const totalRecords = filteredData.length;
  
  if (totalRecords === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">ไม่พบข้อมูลของหน่วยบริการนี้</td></tr>';
    if(infoBox) infoBox.innerText = 'กำลังแสดงข้อมูล 0 ถึง 0 จากทั้งหมด 0 รายการ';
    return;
  }
  
  const totalPages = Math.ceil(totalRecords / managePageSize);
  if (manageCurrentPage > totalPages) manageCurrentPage = totalPages;
  if (manageCurrentPage < 1) manageCurrentPage = 1;
  
  const startIndex = (manageCurrentPage - 1) * managePageSize;
  const endIndex = Math.min(startIndex + managePageSize, totalRecords);
  
  if(infoBox) {
    infoBox.innerText = `กำลังแสดงข้อมูลลำดับที่ ${startIndex + 1} ถึง ${endIndex} จากทั้งหมด ${totalRecords} รายการ (หน้า ${manageCurrentPage}/${totalPages})`;
  }
  
  const headers = Object.keys(rawData[0]);
  let headerRow = '<tr>';
  headers.forEach(h => headerRow += `<th>${h}</th>`);
  headerRow += '<th style="width: 100px;">จัดการ</th></tr>';
  thead.innerHTML = headerRow;
  
  for (let i = startIndex; i < endIndex; i++) {
    let item = filteredData[i];
    let row = item.content;
    let actualRowIndex = item.actualRowIndex;
    
    let tr = document.createElement('tr');
    let tdHTML = '';
    headers.forEach(h => tdHTML += `<td class="text-center">${row[h] || ''}</td>`);
    
    tdHTML += `
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="deleteRecord('${sheetName}', ${actualRowIndex})">
          <i class="bi bi-trash3-fill"></i> ลบ
        </button>
      </td>
    `;
    tr.innerHTML = tdHTML;
    tbody.appendChild(tr);
  }
  
  if (paginationControls && totalPages > 1) {
    let prevDisabled = (manageCurrentPage === 1) ? 'disabled' : '';
    paginationControls.innerHTML += `
      <li class="page-item ${prevDisabled}">
        <a class="page-link" href="#" onclick="changeManagePage(${manageCurrentPage - 1}); return false;"><i class="bi bg-chevron-left"></i> ก่อนหน้า</a>
      </li>
    `;
    
    for (let p = 1; p <= totalPages; p++) {
      let activeClass = (p === manageCurrentPage) ? 'active' : '';
      paginationControls.innerHTML += `
        <li class="page-item ${activeClass}">
          <a class="page-link" href="#" onclick="changeManagePage(${p}); return false;">${p}</a>
        </li>
      `;
    }
    
    let nextDisabled = (manageCurrentPage === totalPages) ? 'disabled' : '';
    paginationControls.innerHTML += `
      <li class="page-item ${nextDisabled}">
        <a class="page-link" href="#" onclick="changeManagePage(${manageCurrentPage + 1}); return false;">ถัดไป <i class="bi bg-chevron-right"></i></a>
      </li>
    `;
  }
}

function changeManagePage(pageNumber) {
  manageCurrentPage = pageNumber;
  renderManageTable();
}

// ลบข้อมูล (เปลี่ยนมาใช้ fetch API)
async function deleteRecord(sheetName, rowIndex) {
  if(!confirm(`คุณแน่ใจหรือไม่ที่จะลบข้อมูลแถวนี้?\n(ข้อมูลจะถูกลบออกจาก Google Sheets ทันที)`)) {
    return;
  }
  
  document.body.style.cursor = 'wait';
  
  try {
    const payload = {
      action: 'delete',
      sheetName: sheetName,
      rowIndex: rowIndex
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const res = await response.json();
    
    document.body.style.cursor = 'default';
    alert(res.message);
    
    if(res.success) {
      let arrayIndex = rowIndex - 2; 
      
      if (sheetName === 'money') {
        moneyData.splice(arrayIndex, 1); 
        renderMoneyView();               
      } else if (sheetName === 'ncd') {
        ncdData.splice(arrayIndex, 1);  
        updateNcdView();                 
      } else if (sheetName === 'cd') {
        cdData.splice(arrayIndex, 1);   
        updateCdView();                  
      }
      
      renderManageTable();
    }
  } catch (error) {
    document.body.style.cursor = 'default';
    alert("ขัดข้อง ไม่สามารถลบข้อมูลได้เนื่องจากขาดการเชื่อมต่อ");
  }
}
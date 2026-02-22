
// ─── App Global State ─────────────────────────────────
const APP_STATE = {
    currentPage: 'dashboard'
};

// ─── Superbase Initialization ──────────────────────────────
const SUPABASE_URL = 'https://jkrcjfjfncyvymdwcedi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprcmNqZmpmbmN5dnltZHdjZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTMwMDksImV4cCI6MjA4NzMyOTAwOX0.awHuGfZ7Wr_OlMvGTBgS4vvbyB1BBR-06rEYMxsNGLk';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentLat = null, currentLng = null;
let clockIntervalId = null;

// TODO: Connect to real User Data
const MOCK_USER = {
    id: 'EMP7857',
    name: 'พนักงานทดสอบ'
};

// ─── Initialization ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Prevent redirect loop and script errors on standalone pages
    const path = window.location.pathname.toLowerCase();
    if (path.includes('login.html') || path.includes('line.html')) return;

    // 1. ตรวจสอบสถานะการเข้าสู่ระบบ
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        // ถ้ายังไม่ได้ล็อกอิน ให้เด้งกลับไปหน้า login.html
        window.location.href = 'login.html';
        return;
    }

    // 2. ถ้าล็อกอินแล้ว ดึงข้อมูล Profile มาเก็บใน MOCK_USER ชั่วคราว (หรือตัวแปร USER_PROFILE)
    await loadCurrentUserProfile(session.user.id);

    // Update Header Date
    updateHeaderDate();
    setInterval(updateHeaderDate, 60000); // Check every minute

    // Set default page
    navigateTo('dashboard', document.querySelector('.nav-item[data-page="dashboard"]'));
});

// ฟังก์ชันดึงข้อมูลพนักงานปัจจุบันที่ล็อกอินอยู่
async function loadCurrentUserProfile(uid) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .single();

        if (error) throw error;

        if (data) {
            MOCK_USER.id = data.employee_id;
            MOCK_USER.uuid = data.id;
            MOCK_USER.name = data.full_name;
            MOCK_USER.role = data.role;

            // อัปเดตแสดงผลที่ Header ของเบราว์เซอร์
            const nameEl = document.getElementById('user-display-name');
            const roleEl = document.getElementById('user-display-role');
            if (nameEl) nameEl.textContent = data.full_name;
            if (roleEl) roleEl.textContent = data.role;
        }
    } catch (e) {
        console.error("Error loading user profile:", e);
    }
}


function updateHeaderDate() {
    const n = new Date();
    const dOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
    document.getElementById('header-date').textContent = n.toLocaleDateString('th-TH', dOpts);
}

// ─── Navigation Logic ─────────────────────────────────
function navigateTo(pageId, element, isChild = false) {
    APP_STATE.currentPage = pageId;

    // 1. Hide all pages
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));

    // 2. Remove 'active' from all nav items and children
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.nav-child').forEach(n => n.classList.remove('active'));

    // 3. Show target page
    const pageEl = document.getElementById('page-' + pageId);
    if (pageEl) {
        pageEl.classList.add('active');
    }

    // 4. Highlight Nav Menu
    if (element) {
        if (isChild) {
            element.classList.add('active');
            // Highlight parent group
            const parentGroup = element.closest('.nav-group').querySelector('.nav-item');
            if (parentGroup) parentGroup.classList.add('active');
        } else {
            element.classList.add('active');
        }
    }

    // 5. Update Header Title
    const titleMap = {
        'dashboard': 'Dashboard',
        'checkin': 'เช็คอิน/เช็คเอาท์',
        'records': 'บันทึกการเข้างาน',
        'map': 'แผนที่',
        'shifts': 'ตารางกะงาน',
        'my-requests': 'รายการคำขอ',
        'approve-requests': 'อนุมัติคำขอ',
        'approve-leave': 'อนุมัติการลา',
        'report-general': 'รายงานทั่วไป',
        'report-leave': 'รายงานการลา',
        'audit-log': 'Audit Log',
        'users': 'จัดการผู้ใช้',
        'workplaces': 'จัดการหน้างาน',
        'auto-escalation': 'Auto-Escalation',
        'settings': 'ตั้งค่าระบบ',
        'profile': 'โปรไฟล์'
    };
    document.getElementById('page-title').textContent = titleMap[pageId] || pageId;

    // 6. Close sidebar on Mobile
    if (window.innerWidth <= 900) {
        document.getElementById('sidebar').classList.remove('open');
    }

    // 7. Page Specific Handlers
    if (pageId === 'checkin') {
        setupCheckinPage();
    } else if (pageId === 'users') {
        loadUsers();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'workplaces') {
        loadWorkplaces();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'dashboard') {
        loadDashboard();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'records') {
        loadRecords();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'shifts') {
        loadShifts();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'my-requests') {
        loadMyRequests('pending');
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'approve-requests') {
        loadApproveOT();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'approve-leave') {
        loadApproveLeave();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'report-general') {
        loadGeneralReport();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'report-leave') {
        loadLeaveReport();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'audit-log') {
        loadAuditLog();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else {
        if (clockIntervalId) clearInterval(clockIntervalId);
    }
}

// ─── Dropdown Toggle ─────────────────────────────────
function toggleNavGroup(element) {
    const group = element.parentElement;

    // Optional: Close other groups like an accordion (uncomment if desired)
    /*
    document.querySelectorAll('.nav-group').forEach(g => {
      if (g !== group) g.classList.remove('expanded');
    });
    */

    group.classList.toggle('expanded');
}

// ─── Mobile Sidebar Toggle ────────────────────────────
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ─── Placeholders ─────────────────────────────────────
function refreshPageData() {
    console.log('Refreshing data for:', APP_STATE.currentPage);
    if (APP_STATE.currentPage === 'users') loadUsers();
    if (APP_STATE.currentPage === 'dashboard') loadDashboard();
    if (APP_STATE.currentPage === 'workplaces') loadWorkplaces();
    if (APP_STATE.currentPage === 'records') loadRecords();
    if (APP_STATE.currentPage === 'shifts') loadShifts();
    if (APP_STATE.currentPage === 'my-requests') loadMyRequests('pending');
    if (APP_STATE.currentPage === 'approve-requests') loadApproveOT();
    if (APP_STATE.currentPage === 'approve-leave') loadApproveLeave();
    if (APP_STATE.currentPage === 'report-general') loadGeneralReport();
    if (APP_STATE.currentPage === 'report-leave') loadLeaveReport();
    if (APP_STATE.currentPage === 'audit-log') loadAuditLog();
}

async function logout() {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        console.log('Logging out...');
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    }
}

// ─── CHECK-IN / CHECK-OUT MODULE ─────────────────────
function setupCheckinPage() {
    // Setup clock for checkin page
    if (clockIntervalId) clearInterval(clockIntervalId);
    updateCheckinClock();
    clockIntervalId = setInterval(updateCheckinClock, 1000);

    // Set user info
    document.getElementById('ci-emp-name').textContent = MOCK_USER.name;
    document.getElementById('ci-emp-id').textContent = `(${MOCK_USER.id})`;

    // Init GPS
    initGeo();

    // Load Workplaces
    loadWorkplacesForCheckin();
}

function updateCheckinClock() {
    const n = new Date();
    const elClock = document.getElementById('ci-clock');
    const elDate = document.getElementById('ci-date');
    if (elClock) {
        elClock.textContent = n.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
    if (elDate) {
        const dOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
        elDate.textContent = n.toLocaleDateString('th-TH', dOpts);
    }
}

function initGeo() {
    const box = document.getElementById('ci-gps-box');
    if (!box) return;

    // Reset UI
    box.className = 'gps-status-box';
    box.querySelector('.gps-icon').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    box.querySelector('h4').textContent = 'กำลังค้นหาตำแหน่ง...';
    box.querySelector('#ci-coords').textContent = 'โปรดรอสักครู่';
    currentLat = null;
    currentLng = null;

    if (!navigator.geolocation) {
        setGpsError('อุปกรณ์ของคุณไม่รองรับ GPS');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            currentLat = position.coords.latitude;
            currentLng = position.coords.longitude;
            const acc = Math.round(position.coords.accuracy);

            box.className = 'gps-status-box success';
            box.querySelector('.gps-icon').innerHTML = '<i class="fa-solid fa-location-dot"></i>';
            box.querySelector('h4').textContent = 'ระบุตำแหน่งเรียบร้อย';
            box.querySelector('#ci-coords').textContent = `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)} (±${acc}m)`;
        },
        error => {
            let msg = 'ไม่สามารถดึงตำแหน่งได้';
            if (error.code === 1) msg = 'ปฏิเสธการเข้าถึงตำแหน่ง';
            if (error.code === 2) msg = 'ตำแหน่งไม่พร้อมใช้งาน';
            if (error.code === 3) msg = 'หมดเวลาค้นหาตำแหน่ง';
            setGpsError(msg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function setGpsError(msg) {
    const box = document.getElementById('ci-gps-box');
    if (!box) return;
    box.className = 'gps-status-box error';
    box.querySelector('.gps-icon').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    box.querySelector('h4').textContent = 'ค้นหาตำแหน่งล้มเหลว';
    box.querySelector('#ci-coords').textContent = msg;
}

async function loadWorkplacesForCheckin() {
    const select = document.getElementById('ci-workplace');
    select.innerHTML = '<option value="">-- รอข้อมูลหน้างาน --</option>';

    try {
        const { data: list, error } = await supabase
            .from('workplaces')
            .select('id, name')
            .eq('status', 'ใช้งาน');

        if (error) throw error;

        if (!list || list.length === 0) {
            select.innerHTML = '<option value="">-- ไม่มีหน้างานที่เปิดใช้งาน --</option>';
            return;
        }

        select.innerHTML = '<option value="">-- เลือกหน้างาน --</option>' +
            list.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    } catch (error) {
        console.error('Error fetching workplaces for checkin:', error.message);
        select.innerHTML = '<option value="">-- ข้อผิดพลาดในการโหลดข้อมูล --</option>';
    }
}

async function submitCheckin(type) {
    const wpId = document.getElementById('ci-workplace').value;
    const wpSelect = document.getElementById('ci-workplace');
    const wpName = wpSelect.options[wpSelect.selectedIndex]?.text || '';
    const note = document.getElementById('ci-note').value;

    if (!currentLat || !currentLng) {
        alert('ไม่สามารถเช็คอินได้: ยังไม่ได้รับตำแหน่ง GPS');
        return;
    }

    if (!wpId) {
        alert('กรุณาเลือกหน้างาน / สาขา');
        return;
    }

    const btnId = type === 'Check-in' ? 'btn-ci' : 'btn-co';
    const btn = document.getElementById(btnId);
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
        // Fetch workplace details to check distance
        const { data: wpData, error: wpError } = await supabase
            .from('workplaces')
            .select('lat, lng, radius')
            .eq('id', wpId)
            .single();

        if (wpError) throw wpError;

        // Calculate distance
        const R = 6371e3; // metres
        const φ1 = currentLat * Math.PI / 180; // φ, λ in radians
        const φ2 = wpData.lat * Math.PI / 180;
        const Δφ = (wpData.lat - currentLat) * Math.PI / 180;
        const Δλ = (wpData.lng - currentLng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // in metres

        const status = distance <= wpData.radius ? 'ปกติ' : 'นอกพื้นที่';

        // IMPORTANT: For a real app, you need actual user.id (UUID)
        // Here we use a mock UUID for demonstration since we haven't implemented full Auth yet
        const realUserId = MOCK_USER.uuid; // This pulls the UUID of the currently logged in user

        const payload = {
            user_id: realUserId,
            workplace_id: wpId,
            type: type,
            lat: currentLat,
            lng: currentLng,
            distance_meters: Math.round(distance),
            status: status,
            note: note,
            date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
            time: new Date().toLocaleTimeString('en-GB') // HH:mm:ss
        };

        const { error: insertError } = await supabase.from('attendance_logs').insert([payload]);
        if (insertError) throw insertError;

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            alert(`บันทึก ${type} สำเร็จ!\nสถานะ: ${status}\nระยะห่าง: ${(distance / 1000).toFixed(2)} กม.`);
            updateCheckinStatusCard(type);
        }, 800);

    } catch (error) {
        console.error('Error submitting checkin:', error.message);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        alert('เชื่อมต่อล้มเหลว: ' + error.message);
    }
}

function updateCheckinStatusCard(type) {
    const stBox = document.querySelector('.checkin-status');
    stBox.classList.remove('empty');
    stBox.innerHTML = `
            <div class="status-icon" style="background:#ecfdf5;color:#10b981;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px;">
                <i class="fa-solid fa-check"></i>
            </div>
            <h3 style="color:#10b981">บันทึกเวลาสำเร็จ</h3>
            <p>${type} เวลา ${new Date().toLocaleTimeString('th-TH')} น.</p>
        `;
}

// ─── MODALS & UTILS ──────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ─── DASHBOARD (B4) ──────────────────────────────────
function loadDashboard() {
    fetchDashboardStats();
}

async function fetchDashboardStats() {
    try {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

        // 1. Get total active users
        const { count: totalEmployees, error: errProfile } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'ใช้งาน');
        if (errProfile) throw errProfile;

        // 2. Get today's attendance logs
        const { data: logs, error: errLogs } = await supabase
            .from('attendance_logs')
            .select('user_id, status, type, time')
            .eq('date', today)
            .eq('type', 'Check-in'); // count only check-ins for present status
        if (errLogs) throw errLogs;

        // 3. Process data
        const uniqueCheckins = new Set(logs.map(log => log.user_id));
        const totalCheckins = uniqueCheckins.size;

        // Advanced categorization (simplified based on your status rules)
        let onTime = 0;
        let late = 0;
        let outOfRange = 0;

        logs.forEach(log => {
            // We only count each user once (their first check-in of the day)
            // But for simplicity in this loop we'll just parse all Check-ins. 
            // In production, we should filter by the EARLIEST check-in per user.
            if (log.status === 'ปกติ') onTime++;
            else if (log.status === 'สาย') late++;
            else if (log.status === 'นอกพื้นที่') outOfRange++;
        });

        // Correcting counts to match unique users (rough estimation for UI demo)
        const totalProcessed = onTime + late + outOfRange;
        const normalizedOnTime = totalProcessed > 0 ? Math.round((onTime / totalProcessed) * totalCheckins) : 0;
        const normalizedLate = totalProcessed > 0 ? Math.round((late / totalProcessed) * totalCheckins) : 0;
        const normalizedOutOfRange = totalProcessed > 0 ? Math.round((outOfRange / totalProcessed) * totalCheckins) : 0;

        updateDashboardUI({
            totalEmployees: totalEmployees || 0,
            totalCheckins: totalCheckins,
            onTime: normalizedOnTime,
            late: normalizedLate,
            outOfRange: normalizedOutOfRange
        });

    } catch (error) {
        console.error("Failed to load dashboard stats from Supabase:", error.message);
        // Fallback to mock if entirely fresh DB to prevent empty dashboard
        updateDashboardUI({
            totalEmployees: 0,
            totalCheckins: 0,
            onTime: 0,
            late: 0,
            outOfRange: 0
        });
    }
}

function updateDashboardUI(data) {
    const total = data.totalEmployees || 0;
    const present = data.totalCheckins || 0;
    const late = data.late || 0;
    const absent = total - present > 0 ? total - present : 0;

    document.getElementById('dash-total').textContent = total;
    document.getElementById('dash-present').textContent = present;
    document.getElementById('dash-late').textContent = late;
    document.getElementById('dash-absent').textContent = absent;

    // Update Donut Chart Value
    const pctText = document.querySelector('.donut-inner span');
    if (pctText) {
        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
        pctText.textContent = pct + '%';
    }

    // Update Legends
    const legends = document.querySelectorAll('.legend-item');
    if (legends && legends.length >= 4) {
        legends[0].innerHTML = `<span class="dot success"></span> ตรงเวลา (${data.onTime || 0})`;
        legends[1].innerHTML = `<span class="dot warning"></span> สาย (${late})`;
        legends[2].innerHTML = `<span class="dot danger"></span> ขาด (${absent})`;
        legends[3].innerHTML = `<span class="dot info"></span> นอกพื้นที่ (${data.outOfRange || 0})`; // Replacing ลา with นอกพื้นที่ for visibility
    }
}

// ─── USER MANAGEMENT (B1) ────────────────────────────
let usersData = [];

async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        usersData = data.map(u => ({
            id: u.id,
            empId: u.employee_id,
            name: u.full_name,
            email: u.email,
            username: u.username,
            role: u.role,
            shift: u.primary_shift, // Using primary_shift for display
            status: u.status
        }));

        renderUsersTable();
    } catch (error) {
        console.error('Error loading users:', error.message);
        alert('เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน: ' + error.message);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (usersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">ไม่พบข้อมูลพนักงาน</td></tr>';
        return;
    }

    tbody.innerHTML = usersData.map(u => {
        const encodedUser = btoa(encodeURIComponent(JSON.stringify(u)));
        let roleBadge = 'badge-primary';
        if (u.role === 'หัวหน้างาน') roleBadge = 'badge-warning';
        if (u.role === 'HR Admin') roleBadge = 'badge-danger';

        let statusBadge = u.status === 'ใช้งาน' ? 'badge-success' : 'badge-danger';

        return `
                <tr>
                  <td>
                    <div class="user-cell">
                      <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&color=fff&background=3b82f6" alt="avatar" />
                      <div>
                        <strong>${u.name}</strong>
                        <small>${u.email || '-'}</small>
                      </div>
                    </div>
                  </td>
                  <td>${u.empId}</td>
                  <td><span class="badge ${roleBadge}">${u.role}</span></td>
                  <td>${u.shift || '-'}</td>
                  <td><span class="badge ${statusBadge}">${u.status}</span></td>
                  <td>
                    <button class="btn-icon text-primary" onclick="editUser('${encodedUser}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteUser('${u.empId}')"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
            `;
    }).join('');
}

function openUserModal() {
    document.getElementById('user-modal-title').textContent = 'เพิ่มพนักงาน';
    document.getElementById('u-original-id').value = '';
    document.getElementById('user-form').reset();
    openModal('user-modal');
}

function editUser(encodedUser) {
    const u = JSON.parse(decodeURIComponent(atob(encodedUser)));
    document.getElementById('user-modal-title').textContent = 'แก้ไขข้อมูลพนักงาน';
    document.getElementById('u-original-id').value = u.empId;
    document.getElementById('u-empid').value = u.empId;
    document.getElementById('u-name').value = u.name;
    document.getElementById('u-email').value = u.email;
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-role').value = u.role;
    document.getElementById('u-shift').value = u.shift;
    document.getElementById('u-status').value = u.status;
    openModal('user-modal');
}

async function saveUser() {
    const payload = {
        employee_id: document.getElementById('u-empid').value.trim(),
        full_name: document.getElementById('u-name').value.trim(),
        email: document.getElementById('u-email').value.trim(),
        username: document.getElementById('u-username').value.trim(),
        role: document.getElementById('u-role').value,
        primary_shift: document.getElementById('u-shift').value.trim(),
        status: document.getElementById('u-status').value
    };
    const orgId = document.getElementById('u-original-id').value; // In a full app, we need the UUID here instead of empId for proper updates. We'll use employee_id for matching if uuid not kept.

    if (!payload.employee_id || !payload.full_name) {
        alert('กรุณากรอก รหัสพนักงาน และ ชื่อ-นามสกุล ให้ครบถ้วน');
        return;
    }

    const isEdit = orgId !== '';

    closeModal('user-modal');
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...</td></tr>';

    try {
        if (isEdit) {
            // Update based on employee_id (fallback matching as we didn't store UUID in HTML input clearly)
            const { error } = await supabase
                .from('profiles')
                .update(payload)
                .eq('employee_id', orgId);
            if (error) throw error;
        } else {
            // Note: Real insertion requires creating Auth user first via Supabase Edge Function or Backend.
            // Doing raw insert here assumes triggers or manual id providing if testing.
            console.log("Mocking creation of user as it requires Auth integration: ", payload);
            setTimeout(() => { alert('บันทึกสำเร็จ (Mock)'); loadUsers(); }, 500);
            return;
        }
        loadUsers();
    } catch (error) {
        console.error('Error saving user:', error.message);
        alert('Error: ' + error.message);
        loadUsers();
    }
}

async function deleteUser(empId) {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบพนักงานรหัส: ' + empId + ' ?')) return;

    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังลบข้อมูล...</td></tr>';

    try {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('employee_id', empId);

        if (error) throw error;
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error.message);
        alert('Error: ' + error.message);
        loadUsers();
    }
}

// ─── WORKPLACE MANAGEMENT (B2) ────────────────────────────
let workplacesData = [];

async function loadWorkplaces() {
    const tbody = document.getElementById('workplaces-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('workplaces')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        workplacesData = data;
        renderWorkplacesTable();
    } catch (error) {
        console.error('Error loading workplaces:', error.message);
        alert('เกิดข้อผิดพลาด: ' + error.message);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
    }
}

function renderWorkplacesTable() {
    const tbody = document.getElementById('workplaces-table-body');
    if (!tbody) return;

    if (workplacesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">ไม่พบข้อมูลหน้างาน</td></tr>';
        return;
    }

    tbody.innerHTML = workplacesData.map(w => {
        const encodedWp = btoa(encodeURIComponent(JSON.stringify(w)));
        let statusBadge = w.status === 'ใช้งาน' ? 'badge-success' : 'badge-danger';

        // Format coordinates to short decimals for cleaner table
        const latStr = w.lat ? Number(w.lat).toFixed(4) : '-';
        const lngStr = w.lng ? Number(w.lng).toFixed(4) : '-';

        return `
                <tr>
                  <td><strong>${w.id}</strong></td>
                  <td><i class="fa-solid fa-building text-primary" style="margin-right: 8px;"></i> ${w.name}</td>
                  <td><span class="text-muted">${latStr}, ${lngStr}</span></td>
                  <td>${w.radius}m</td>
                  <td>
                    <button class="btn-icon text-muted" title="ดู QR (${w.qrCode || 'ไม่มี'})" onclick="alert('แสดง QR Code สำหรับ: ${w.qrCode}')"><i class="fa-solid fa-qrcode"></i></button>
                  </td>
                  <td><span class="badge ${statusBadge}">${w.status}</span></td>
                  <td>
                    <button class="btn-icon text-primary" onclick="editWorkplace('${encodedWp}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteWorkplace('${w.id}')"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
            `;
    }).join('');
}

function openWorkplaceModal() {
    document.getElementById('workplace-modal-title').textContent = 'เพิ่มหน้างาน / สาขา';
    document.getElementById('wp-original-id').value = '';
    document.getElementById('workplace-form').reset();
    openModal('workplace-modal');
}

function editWorkplace(encodedWp) {
    const w = JSON.parse(decodeURIComponent(atob(encodedWp)));
    document.getElementById('workplace-modal-title').textContent = 'แก้ไขข้อมูลหน้างาน';
    document.getElementById('wp-original-id').value = w.id;
    document.getElementById('wp-id').value = w.id;
    document.getElementById('wp-name').value = w.name;
    document.getElementById('wp-lat').value = w.lat;
    document.getElementById('wp-lng').value = w.lng;
    document.getElementById('wp-radius').value = w.radius;
    document.getElementById('wp-status').value = w.status;
    openModal('workplace-modal');
}

function getWpCurrentLocation() {
    if (!navigator.geolocation) {
        alert('เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่ง');
        return;
    }

    const btn = event.currentTarget;
    const orgHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึง...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        position => {
            document.getElementById('wp-lat').value = position.coords.latitude;
            document.getElementById('wp-lng').value = position.coords.longitude;
            btn.innerHTML = orgHtml;
            btn.disabled = false;
        },
        error => {
            alert('ไม่สามารถดึงตำแหน่งได้: ' + error.message);
            btn.innerHTML = orgHtml;
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function saveWorkplace() {
    const payload = {
        id: document.getElementById('wp-id').value.trim(),
        name: document.getElementById('wp-name').value.trim(),
        lat: parseFloat(document.getElementById('wp-lat').value.trim()),
        lng: parseFloat(document.getElementById('wp-lng').value.trim()),
        radius: parseInt(document.getElementById('wp-radius').value.trim()),
        status: document.getElementById('wp-status').value
    };
    const orgId = document.getElementById('wp-original-id').value;

    if (!payload.id || !payload.name || isNaN(payload.lat) || isNaN(payload.lng) || isNaN(payload.radius)) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง โดยเฉพาะรหัส, ชื่อ และพิกัด');
        return;
    }

    const isEdit = orgId !== '';

    closeModal('workplace-modal');
    const tbody = document.getElementById('workplaces-table-body');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...</td></tr>';

    try {
        if (isEdit) {
            const { error } = await supabase
                .from('workplaces')
                .update(payload)
                .eq('id', orgId);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('workplaces')
                .insert([payload]);
            if (error) throw error;
        }
        loadWorkplaces();
    } catch (error) {
        console.error('Error saving workplace:', error.message);
        alert('Error: ' + error.message);
        loadWorkplaces();
    }
}

async function deleteWorkplace(wpId) {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสาขารหัส: ' + wpId + ' ?\n\nการลบอาจส่งผลกระทบต่อรายการเช็คอินของพนักงานในอดีตได้')) return;

    const tbody = document.getElementById('workplaces-table-body');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังลบข้อมูล...</td></tr>';

    try {
        const { error } = await supabase
            .from('workplaces')
            .delete()
            .eq('id', wpId);

        if (error) throw error;
        loadWorkplaces();
    } catch (error) {
        console.error('Error deleting workplace:', error.message);
        alert('Error: ' + error.message);
        loadWorkplaces();
    }
}

// ─── ATTENDANCE RECORDS (B3) ─────────────────────────
let attendanceRecordsData = [];

async function loadRecords() {
    const tbody = document.getElementById('records-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    const rawDate = document.getElementById('records-date-filter').value;
    const filterDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : ''; // Simple YYYY-MM-DD format handling

    try {
        let query = supabase
            .from('attendance_logs')
            .select(`
                    *,
                    profiles:user_id(employee_id, full_name),
                    workplaces:workplace_id(name)
                `)
            .order('timestamp', { ascending: false });

        if (filterDate) {
            query = query.eq('date', filterDate);
        }

        const { data, error } = await query;

        if (error) throw error;

        attendanceRecordsData = data.map(r => ({
            timestamp: r.timestamp,
            date: r.date,
            time: r.time,
            empId: r.profiles?.employee_id || '-',
            empName: r.profiles?.full_name || 'ผู้ใช้ไม่ทราบชื่อ',
            type: r.type,
            status: r.status,
            lat: r.lat,
            lng: r.lng,
            locationStatus: r.status === 'นอกพื้นที่' ? 'Out of Range' : 'In Range', // Map back to existing UI logic or change UI logic
            distance: r.distance_meters ? (r.distance_meters / 1000).toFixed(2) : 0,
            workplaceName: r.workplaces?.name || '-',
            imageUrl: r.image_url,
            note: r.note || '-'
        }));

        filterRecordsTable();
    } catch (error) {
        console.error('Error fetching records:', error.message);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message + '</td></tr>';
    }
}

function filterRecordsTable() {
    const query = document.getElementById('records-search').value.toLowerCase();

    let filtered = attendanceRecordsData;
    if (query) {
        filtered = filtered.filter(r =>
            (r.empId && r.empId.toLowerCase().includes(query)) ||
            (r.empName && r.empName.toLowerCase().includes(query))
        );
    }

    renderRecordsTable(filtered);
}

function renderRecordsTable(data) {
    const tbody = document.getElementById('records-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">ไม่พบประวัติการลงเวลาขของช่วงวันที่นี้</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        // Badges
        let typeBadge = r.type === 'Check-in' ? '<span class="badge badge-primary">เข้างาน</span>' : '<span class="badge badge-warning">ออกงาน</span>';
        let statusBadge = '';
        if (r.status === 'Normal' || r.status === 'ปกติ') statusBadge = '<span class="badge badge-success">ปกติ</span>';
        else if (r.status === 'Late' || r.status === 'สาย') statusBadge = '<span class="badge badge-danger">สาย</span>';
        else if (r.status === 'Early Leave' || r.status === 'ออกก่อน') statusBadge = '<span class="badge badge-warning">ออกก่อน</span>';
        else statusBadge = `<span class="badge badge-info">${r.status || '-'}</span>`;

        let locBadge = '';
        if (r.locationStatus === 'In Range') locBadge = '<span class="badge badge-success" style="font-size:0.7em"><i class="fa-solid fa-check"></i> ในพื้นที่</span>';
        else if (r.locationStatus === 'Out of Range') locBadge = '<span class="badge badge-danger" style="font-size:0.7em"><i class="fa-solid fa-xmark"></i> นอกพื้นที่</span>';

        // Image Button
        let imgBtn = r.imageUrl ? `<button class="btn-icon text-primary" onclick="viewProofImage('${r.imageUrl}')" title="ดูรูปถ่าย"><i class="fa-solid fa-image"></i></button>` : '<span class="text-muted">-</span>';
        let mapLink = `https://www.google.com/maps?q=${r.lat},${r.lng}`;

        let dateDisplay = '';
        if (r.date && r.time) {
            // simple thai format
            let dt = new Date(r.date);
            dateDisplay = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + r.time;
        } else {
            dateDisplay = r.timestamp || '-';
        }

        return `
                <tr>
                   <td><strong>${dateDisplay}</strong></td>
                   <td>
                      <div class="user-cell">
                         <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.empName)}&color=fff&background=3b82f6" alt="avatar" />
                         <div>
                            <strong>${r.empName || '-'}</strong>
                            <small>${r.empId || '-'}</small>
                         </div>
                      </div>
                   </td>
                   <td>${typeBadge}</td>
                   <td>${statusBadge}</td>
                   <td>
                      <div style="font-size: 0.9em"><i class="fa-solid fa-location-dot text-muted"></i> ${r.workplaceName || '-'}</div>
                      <div style="margin-top:4px;">${locBadge}</div>
                   </td>
                   <td>
                      <a href="${mapLink}" target="_blank" class="text-primary" style="text-decoration:none;">${r.distance ? r.distance + ' km' : '-'}</a>
                   </td>
                   <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        ${imgBtn}
                        <span style="font-size:0.85em; color:var(--text-muted); max-width: 150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.note || ''}">${r.note || '-'}</span>
                      </div>
                   </td>
                </tr>
            `;
    }).join('');
}

function viewProofImage(url) {
    if (!url) return;
    document.getElementById('image-modal-img').src = url;
    openModal('image-modal');
}

// ─── SHIFTS & SWAP MODULE (B5) ──────────────────────────
let currentShiftsDate = new Date(); // Track currently viewed month
let myShiftsMap = {}; // store date => shift data
let swapRequestsList = []; // mock DB for swap requests

function loadShifts() {
    renderCalendar();
    loadSwapRequests(); // load pending swaps badge

    // Generate some mock shift data for the current user
    const y = currentShiftsDate.getFullYear();
    const m = currentShiftsDate.getMonth();
    myShiftsMap = {};

    // Mock: Add random shifts
    for (let i = 1; i <= 28; i++) {
        if (i % 7 === 0) myShiftsMap[`${y}-${(m + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`] = { type: 'off', label: 'วันหยุด' };
        else if (i % 3 === 0) myShiftsMap[`${y}-${(m + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`] = { type: 'morning', label: '08:00 - 17:00' };
        else if (i % 5 === 0) myShiftsMap[`${y}-${(m + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`] = { type: 'afternoon', label: '14:00 - 23:00' };
        else myShiftsMap[`${y}-${(m + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`] = { type: 'morning', label: '08:00 - 17:00' };
    }

    // Refresh UI
    renderCalendar();
}

function changeMonth(dir) {
    currentShiftsDate.setMonth(currentShiftsDate.getMonth() + dir);
    loadShifts(); // real app would fetch new data here
}

function renderCalendar() {
    const year = currentShiftsDate.getFullYear();
    const month = currentShiftsDate.getMonth();

    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('current-month-year').textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const calendarGrid = document.getElementById('calendar-days');
    calendarGrid.innerHTML = '';
    document.getElementById('shift-details-card').style.display = 'none';

    // padding days
    for (let i = 0; i < firstDay; i++) {
        calendarGrid.innerHTML += `<div class="calendar-cell empty"></div>`;
    }

    // days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const shift = myShiftsMap[dateStr];
        let badgeHtml = '';

        if (shift) {
            let badgeClass = 'shift-off';
            if (shift.type === 'morning') badgeClass = 'shift-morning';
            else if (shift.type === 'afternoon') badgeClass = 'shift-afternoon';
            else if (shift.type === 'night') badgeClass = 'shift-night';
            badgeHtml = `<div class="shift-badge ${badgeClass}">${shift.label}</div>`;
        }

        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.innerHTML = `<div class="date-num">${d}</div>${badgeHtml}`;
        cell.onclick = () => selectDate(dateStr, cell);
        calendarGrid.appendChild(cell);
    }
}

function selectDate(dateStr, cellElement) {
    document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('active'));
    cellElement.classList.add('active');

    const card = document.getElementById('shift-details-card');
    const dt = new Date(dateStr);
    const thaiDate = dt.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('selected-date-title').textContent = thaiDate;
    document.getElementById('swap-my-date').value = thaiDate; // Set for modal
    document.getElementById('swap-my-date-raw').value = dateStr;

    const shift = myShiftsMap[dateStr];
    let infoHtml = '';
    if (shift && shift.type !== 'off') {
        infoHtml = `
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                   <span class="text-muted"><i class="fa-solid fa-clock"></i> เวลา</span>
                   <strong>${shift.label}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                   <span class="text-muted"><i class="fa-solid fa-location-dot"></i> สถานที่</span>
                   <strong>สำนักงานใหญ่</strong>
                </div>
             `;
        card.querySelector('button').style.display = 'block'; // Can swap
    } else {
        infoHtml = `<div style="text-align:center; color:var(--text-muted); padding: 10px 0;">(วันหยุด)</div>`;
        card.querySelector('button').style.display = 'none'; // Cannot swap day off easily in this basic flow
    }

    document.getElementById('selected-shift-info').innerHTML = infoHtml;
    card.style.display = 'block';
}

// ─── SWAP MODAL LOGIC ───
function openRequestSwapModal() {
    const rawDate = document.getElementById('swap-my-date-raw').value;
    if (!rawDate) return alert('กรุณาเลือกวันที่ก่อน');

    document.getElementById('swap-reason').value = '';
    document.getElementById('swap-target-date').innerHTML = '<option value="">-- กรุณาเลือกพนักงานก่อน --</option>';

    // Mock load Users into select
    const sel = document.getElementById('swap-target-user');
    sel.innerHTML = '<option value="">-- เลือกพนักงาน --</option>' +
        ['EMP002 - สุดา รักดี', 'EMP003 - วินัย มั่นคง'].map(u => `<option value="${u.split(' ')[0]}">${u}</option>`).join('');

    openModal('swap-modal');
}

function loadTargetUserShifts() {
    const sel = document.getElementById('swap-target-user').value;
    const seltarget = document.getElementById('swap-target-date');
    if (!sel) {
        seltarget.innerHTML = '<option value="">-- กรุณาเลือกพนักงานก่อน --</option>';
        return;
    }

    // Mock load shifts of the target user
    const mockShifts = [
        { date: '2026-02-15', label: '14:00 - 23:00' },
        { date: '2026-02-18', label: '08:00 - 17:00' }
    ];

    seltarget.innerHTML = '<option value="">-- เลือกกะที่ต้องการสลับ --</option>' +
        mockShifts.map(s => `<option value="${s.date}">${s.date} (กะ ${s.label})</option>`).join('');
}

function submitSwapRequest() {
    const myDate = document.getElementById('swap-my-date-raw').value;
    const tUser = document.getElementById('swap-target-user').value;
    const tDate = document.getElementById('swap-target-date').value;

    if (!tUser || !tDate) return alert('กรุณาเลือกพนักงานและวันที่ต้องการแลก');

    // Mock saving
    closeModal('swap-modal');
    alert(`ส่งคำขอแลกกะกับ ${tUser} สำเร็จ ระบบจะรอให้พนักงานดังกล่าวกดยอมรับ`);

    // Push to mock local array (to show as outgoing if we wanted to)
}

function loadSwapRequests() {
    // Mock DB: someone requested to swap with YOU
    if (swapRequestsList.length === 0) {
        swapRequestsList = [
            { id: 'SWQ01', fromUser: 'สุดา รักดี (EMP002)', fromDate: '2026-02-23 (14:00 - 23:00)', toDate: '2026-02-22 (08:00 - 17:00)', reason: 'ติดธุระด่วน', status: 'pending' }
        ];
    }

    const pending = swapRequestsList.filter(r => r.status === 'pending');
    const badge1 = document.getElementById('swap-req-badge');
    const badge2 = document.getElementById('req-modal-badge');

    if (pending.length > 0) {
        badge1.style.display = 'inline-block';
        badge1.textContent = pending.length;
        badge2.textContent = pending.length;
    } else {
        badge1.style.display = 'none';
        badge2.textContent = '0';
    }

    const listContainer = document.getElementById('swap-requests-list');
    if (!listContainer) return;

    if (pending.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">ไม่มีคำขอที่รอดำเนินการ</div>';
        return;
    }

    listContainer.innerHTML = pending.map(r => `
            <div class="swap-card" id="sq-${r.id}">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                   <strong><i class="fa-solid fa-user text-primary"></i> ${r.fromUser}</strong>
                   <span class="badge badge-warning">รอดำเนินการ</span>
                </div>
                <div style="font-size:13px; margin-bottom: 8px;">
                   <div class="text-muted">ขอสลับกับกะของคุณ:</div>
                   <div><i class="fa-solid fa-calendar-day"></i> <strong>${r.toDate}</strong></div>
                </div>
                <div style="font-size:13px; margin-bottom: 12px;">
                   <div class="text-muted">โดยคุณต้องไปทำกะนี้แทน:</div>
                   <div><i class="fa-solid fa-arrow-right-arrow-left"></i> <strong>${r.fromDate}</strong></div>
                </div>
                <div style="font-size:13px; background:#f1f5f9; padding:8px; border-radius:4px; margin-bottom:12px;">
                   <span class="text-muted">เหตุผล:</span> ${r.reason}
                </div>
                <div style="display:flex; gap:8px;">
                   <button class="btn btn-primary" style="flex:1;" onclick="respondToSwap('${r.id}', 'อนุมัติ')"><i class="fa-solid fa-check"></i> ยอมรับ</button>
                   <button class="btn btn-outline" style="flex:1;" onclick="respondToSwap('${r.id}', 'ปฏิเสธ')"><i class="fa-solid fa-xmark"></i> ปฏิเสธ</button>
                </div>
            </div>
        `).join('');
}

function openSwapRequestsModal() {
    loadSwapRequests();
    openModal('swap-requests-modal');
}

function respondToSwap(id, action) {
    if (!confirm(`คุณต้องการ ${action} คำขอนี้ใช่หรือไม่?`)) return;

    // update mock state
    const req = swapRequestsList.find(r => r.id === id);
    if (req) req.status = action === 'อนุมัติ' ? 'approved' : 'rejected';

    alert(`${action}สำเร็จ ระบบได้สลับกะงานของทั้งสองฝ่ายเรียบร้อยแล้ว (Mock)`);
    loadSwapRequests(); // refresh lists
    loadShifts(); // refresh calendar
}

// ─── MY REQUESTS (LEAVE/OT) (B6) ──────────────────────────
let myRequestsData = [];

function switchReqTab(tabName, element) {
    document.querySelectorAll('.req-tab').forEach(t => {
        t.classList.remove('active');
        t.style.borderBottom = 'none';
        t.style.fontWeight = 'normal';
        t.style.color = 'var(--text-muted)';
    });
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.fontWeight = 'bold';
    element.style.color = 'var(--primary)';

    loadMyRequests(tabName);
}

function loadMyRequests(filter) {
    const container = document.getElementById('my-requests-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</div>';

    // Mock data
    if (myRequestsData.length === 0) {
        myRequestsData = [
            { id: 'REQ001', type: 'leave', leaveType: 'ลาพักร้อน', startDate: '2026-03-01', endDate: '2026-03-03', reason: 'พักผ่อนประจำปี', status: 'pending', created: '2026-02-20 10:30' },
            { id: 'REQ002', type: 'ot', otStart: '18:00', otEnd: '21:00', startDate: '2026-02-18', reason: 'เคลียร์งานโปรเจค A', status: 'approved', created: '2026-02-15 09:15' },
            { id: 'REQ003', type: 'leave', leaveType: 'ลาป่วย', startDate: '2026-01-10', endDate: '2026-01-11', reason: 'ไข้หวัด', status: 'rejected', created: '2026-01-10 08:30' }
        ];
    }

    setTimeout(() => {
        let filtered = [];
        if (filter === 'pending') {
            filtered = myRequestsData.filter(r => r.status === 'pending');
        } else {
            filtered = myRequestsData.filter(r => r.status !== 'pending');
        }

        renderMyRequests(filtered);
    }, 300);
}

function renderMyRequests(data) {
    const container = document.getElementById('my-requests-list');
    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่มีรายการคำขอ</div>';
        return;
    }

    container.innerHTML = data.map(r => {
        let icon = r.type === 'leave' ? '<i class="fa-solid fa-suitcase-medical text-primary"></i>' : '<i class="fa-solid fa-clock text-warning"></i>';
        let title = r.type === 'leave' ? `ขอลางาน (${r.leaveType})` : 'ขอทำล่วงเวลา (OT)';

        let timeStr = '';
        if (r.type === 'leave') {
            timeStr = r.startDate === r.endDate ? r.startDate : `${r.startDate} ถึง ${r.endDate}`;
        } else {
            timeStr = `${r.startDate} | ${r.otStart} - ${r.otEnd}`;
        }

        let badge = '';
        if (r.status === 'pending') badge = '<span class="badge badge-warning">รอดำเนินการ</span>';
        else if (r.status === 'approved') badge = '<span class="badge badge-success">อนุมัติแล้ว</span>';
        else badge = '<span class="badge badge-danger">ไม่อนุมัติ</span>';

        return `
                <div class="swap-card" style="margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <strong style="font-size: 15px;">${icon} ${title}</strong>
                        ${badge}
                    </div>
                    <div style="margin-bottom:8px; font-size: 13px;">
                        <div><span class="text-muted">วันที่:</span> <strong>${timeStr}</strong></div>
                    </div>
                    <div style="font-size: 13px; background: #f8fafc; padding: 10px; border-radius: 6px;">
                        <span class="text-muted">เหตุผล:</span> ${r.reason}
                    </div>
                </div>
            `;
    }).join('');
}

function openCreateRequestModal() {
    document.getElementById('create-request-form').reset();
    toggleReqTypeFields();
    openModal('create-request-modal');
}

function toggleReqTypeFields() {
    const type = document.getElementById('req-type').value;
    if (type === 'leave') {
        document.getElementById('leave-fields').style.display = 'block';
        document.getElementById('ot-fields').style.display = 'none';
    } else {
        document.getElementById('leave-fields').style.display = 'none';
        document.getElementById('ot-fields').style.display = 'block';
    }
}

function submitMyRequest() {
    const type = document.getElementById('req-type').value;
    const startDate = document.getElementById('req-start-date').value;
    const reason = document.getElementById('req-reason').value;

    if (!startDate || !reason) {
        alert('กรุณากรอกข้อมูลวันที่และเหตุผลให้ครบถ้วน');
        return;
    }

    const newReq = {
        id: 'REQ' + Date.now().toString().slice(-4),
        type: type,
        startDate: startDate,
        reason: reason,
        status: 'pending',
        created: new Date().toLocaleString('th-TH')
    };

    if (type === 'leave') {
        newReq.leaveType = document.getElementById('req-leave-type').value;
        newReq.endDate = document.getElementById('req-end-date').value || startDate;
    } else {
        newReq.otStart = document.getElementById('req-ot-start').value;
        newReq.otEnd = document.getElementById('req-ot-end').value;
        if (!newReq.otStart || !newReq.otEnd) {
            alert('กรุณากรอกเวลาเริ่มต้นและสิ้นสุดของ OT');
            return;
        }
    }

    myRequestsData.unshift(newReq); // Add to top

    alert('ส่งคำขอสำเร็จ');
    closeModal('create-request-modal');
    switchReqTab('pending', document.querySelector('.req-tab')); // Switch to pending and reload
}

// ─── APPROVE REQUESTS (OT) (B7) ──────────────────────────
let approveOTData = [];

function loadApproveOT() {
    const tbody = document.getElementById('approve-ot-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    // Mock Data
    if (approveOTData.length === 0) {
        approveOTData = [
            { id: 'OT001', empId: 'EMP005', empName: 'วิชัย รักดี', date: '2026-02-23', startTime: '18:00', endTime: '21:00', reason: 'เร่งปิดออเดอร์ลูกค้า', status: 'pending' },
            { id: 'OT002', empId: 'EMP010', empName: 'มารศรี งานไว', date: '2026-02-21', startTime: '17:30', endTime: '20:30', reason: 'งานระบบเซิร์ฟเวอร์', status: 'approved' },
            { id: 'OT003', empId: 'EMP008', empName: 'สิริกัญญา งามตา', date: '2026-02-20', startTime: '18:00', endTime: '19:00', reason: 'เคลียร์เอกสาร', status: 'rejected' }
        ];
    }

    setTimeout(() => filterApproveOT(), 400);
}

function filterApproveOT() {
    const search = (document.getElementById('approve-ot-search').value || '').toLowerCase();
    const status = document.getElementById('approve-ot-status').value;

    let filtered = approveOTData;

    if (status !== 'all') {
        filtered = filtered.filter(item => item.status === status);
    }
    if (search) {
        filtered = filtered.filter(item => item.empName.toLowerCase().includes(search) || item.empId.toLowerCase().includes(search));
    }

    renderApproveOTTable(filtered);
}

function renderApproveOTTable(data) {
    const tbody = document.getElementById('approve-ot-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">ไม่พบข้อมูลคำขอ</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        let statusBadge = '';
        if (r.status === 'pending') statusBadge = '<span class="badge badge-warning">รอดำเนินการ</span>';
        else if (r.status === 'approved') statusBadge = '<span class="badge badge-success">อนุมัติแล้ว</span>';
        else statusBadge = '<span class="badge badge-danger">ไม่อนุมัติ</span>';

        let actionButtons = '';
        if (r.status === 'pending') {
            actionButtons = `
                    <button class="btn-icon text-primary" onclick="handleOTRequest('${r.id}', 'approved')" title="อนุมัติ"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-icon text-danger" onclick="handleOTRequest('${r.id}', 'rejected')" title="ปฏิเสธ"><i class="fa-solid fa-xmark"></i></button>
                `;
        } else {
            actionButtons = '<span class="text-muted" style="font-size:12px;">ดำเนินการแล้ว</span>';
        }

        return `
                <tr>
                   <td>
                      <div class="user-cell">
                         <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.empName)}&color=fff&background=3b82f6" alt="avatar" />
                         <div>
                            <strong>${r.empName}</strong>
                            <small>${r.empId}</small>
                         </div>
                      </div>
                   </td>
                   <td>
                      <div><strong>${r.date}</strong></div>
                      <div class="text-muted" style="font-size:12px;">${r.startTime} - ${r.endTime}</div>
                   </td>
                   <td><span style="font-size:13px;">${r.reason}</span></td>
                   <td>${statusBadge}</td>
                   <td>${actionButtons}</td>
                </tr>
            `;
    }).join('');
}

function handleOTRequest(id, action) {
    let msg = action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
    if (!confirm(`ยืนยันการ${msg} คำขอ OT นี้?`)) return;

    const req = approveOTData.find(r => r.id === id);
    if (req) {
        req.status = action;
        filterApproveOT(); // re-render
    }
}

// ─── APPROVE LEAVE (B8) ──────────────────────────
let approveLeaveData = [];

function loadApproveLeave() {
    const tbody = document.getElementById('approve-leave-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    // Mock Data
    if (approveLeaveData.length === 0) {
        approveLeaveData = [
            { id: 'LV001', empId: 'EMP012', empName: 'อารยา ทัศนัย', type: 'ลาป่วย', startDate: '2026-02-24', endDate: '2026-02-25', reason: 'ติดเชื้อทางเดินหายใจ', docUrl: 'https://via.placeholder.com/150', status: 'pending' },
            { id: 'LV002', empId: 'EMP005', empName: 'วิชัย รักดี', type: 'ลาพักร้อน', startDate: '2026-03-10', endDate: '2026-03-12', reason: 'ทริปครอบครัว', docUrl: '', status: 'approved' },
            { id: 'LV003', empId: 'EMP009', empName: 'สมชาติ แซ่ลี้', type: 'ลากิจ', startDate: '2026-02-20', endDate: '2026-02-20', reason: 'ติดต่อราชการ', docUrl: '', status: 'pending' }
        ];
    }

    setTimeout(() => filterApproveLeave(), 400);
}

function filterApproveLeave() {
    const search = (document.getElementById('approve-leave-search').value || '').toLowerCase();
    const status = document.getElementById('approve-leave-status').value;

    let filtered = approveLeaveData;

    if (status !== 'all') {
        filtered = filtered.filter(item => item.status === status);
    }
    if (search) {
        filtered = filtered.filter(item => item.empName.toLowerCase().includes(search) || item.empId.toLowerCase().includes(search));
    }

    renderApproveLeaveTable(filtered);
}

function renderApproveLeaveTable(data) {
    const tbody = document.getElementById('approve-leave-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">ไม่พบข้อมูลคำขอ</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        let statusBadge = '';
        if (r.status === 'pending') statusBadge = '<span class="badge badge-warning">รอดำเนินการ</span>';
        else if (r.status === 'approved') statusBadge = '<span class="badge badge-success">อนุมัติแล้ว</span>';
        else statusBadge = '<span class="badge badge-danger">ไม่อนุมัติ</span>';

        let actionButtons = '';
        if (r.status === 'pending') {
            actionButtons = `
                    <button class="btn-icon text-primary" onclick="handleLeaveRequest('${r.id}', 'approved')" title="อนุมัติ"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-icon text-danger" onclick="handleLeaveRequest('${r.id}', 'rejected')" title="ปฏิเสธ"><i class="fa-solid fa-xmark"></i></button>
                `;
        } else {
            actionButtons = '<span class="text-muted" style="font-size:12px;">ดำเนินการแล้ว</span>';
        }

        let dateStr = r.startDate === r.endDate ? r.startDate : `${r.startDate} <br/><span class="text-muted" style="font-size:10px;">ถึง</span> ${r.endDate}`;
        let docBtn = r.docUrl ? `<button class="btn-icon" style="font-size:12px; color:var(--primary);" onclick="viewProofImage('${r.docUrl}')" title="ดูเอกสารแนบ"><i class="fa-solid fa-paperclip"></i></button>` : '';

        return `
                <tr>
                   <td>
                      <div class="user-cell">
                         <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.empName)}&color=fff&background=3b82f6" alt="avatar" />
                         <div>
                            <strong>${r.empName}</strong>
                            <small>${r.empId}</small>
                         </div>
                      </div>
                   </td>
                   <td>
                      <div><strong>${r.type}</strong></div>
                      <div style="font-size:12px;">${dateStr}</div>
                   </td>
                   <td>
                      <div style="font-size:13px; max-width: 180px; overflow:hidden; text-overflow:ellipsis;">${r.reason}</div>
                      ${docBtn}
                   </td>
                   <td>${statusBadge}</td>
                   <td>${actionButtons}</td>
                </tr>
            `;
    }).join('');
}

function handleLeaveRequest(id, action) {
    let msg = action === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
    if (!confirm(`ยืนยันการ${msg} การลา นี้?`)) return;

    const req = approveLeaveData.find(r => r.id === id);
    if (req) {
        req.status = action;
        filterApproveLeave(); // re-render
    }
}

// ─── REPORTS & AUDIT LOG (B9 & B10) ─────────────────────────

// 1. General Attendance Report
let generalReportData = [];

function loadGeneralReport() {
    // Set default dates to current month
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    if (!document.getElementById('report-gen-start').value) {
        document.getElementById('report-gen-start').value = startOfMonth;
        document.getElementById('report-gen-end').value = endOfMonth;
    }

    const tbody = document.getElementById('report-general-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    // Mock Data
    if (generalReportData.length === 0) {
        generalReportData = [
            { date: '2026-02-23', empId: 'EMP001', empName: 'สมชาย ใจดี', wp: 'สำนักงานใหญ่', timeIn: '08:45', timeOut: '17:30', status: 'ปกติ' },
            { date: '2026-02-23', empId: 'EMP002', empName: 'สุดา รักดี', wp: 'สาขาเชียงใหม่', timeIn: '09:15', timeOut: '18:00', status: 'สาย' },
            { date: '2026-02-22', empId: 'EMP001', empName: 'สมชาย ใจดี', wp: 'สำนักงานใหญ่', timeIn: '08:50', timeOut: '18:10', status: 'ปกติ' },
            { date: '2026-02-22', empId: 'EMP005', empName: 'วิชัย รักดี', wp: 'สำนักงานใหญ่', timeIn: '-', timeOut: '-', status: 'ขาดงาน' }
        ];
    }

    setTimeout(() => filterGeneralReport(), 400);
}

function filterGeneralReport() {
    const search = (document.getElementById('report-gen-search').value || '').toLowerCase();
    const wp = document.getElementById('report-gen-wp').value;
    const start = document.getElementById('report-gen-start').value;
    const end = document.getElementById('report-gen-end').value;

    let filtered = generalReportData;

    if (wp !== 'all') filtered = filtered.filter(item => item.wp === wp);
    if (search) filtered = filtered.filter(item => item.empName.toLowerCase().includes(search) || item.empId.toLowerCase().includes(search));

    if (start && end) {
        filtered = filtered.filter(item => item.date >= start && item.date <= end);
    }

    renderGeneralReport(filtered);
}

function renderGeneralReport(data) {
    const tbody = document.getElementById('report-general-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 20px;">ไม่พบข้อมูล</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        let statusBadge = '';
        if (r.status === 'ปกติ') statusBadge = '<span class="badge badge-success">ปกติ</span>';
        else if (r.status === 'สาย') statusBadge = '<span class="badge badge-danger">สาย</span>';
        else if (r.status === 'ขาดงาน') statusBadge = '<span class="badge badge-warning">ขาดงาน</span>';
        else statusBadge = `<span class="badge badge-info">${r.status}</span>`;

        return `
                <tr>
                   <td><strong>${r.date}</strong></td>
                   <td>
                      <div><strong>${r.empName}</strong></div>
                      <div class="text-muted" style="font-size:12px;">${r.empId}</div>
                   </td>
                   <td>${r.wp}</td>
                   <td>${r.timeIn}</td>
                   <td>${r.timeOut}</td>
                   <td>${statusBadge}</td>
                </tr>
            `;
    }).join('');
}

// 2. Leave & OT Report
let leaveReportData = [];

function loadLeaveReport() {
    if (!document.getElementById('report-leave-month').value) {
        const today = new Date();
        const yearStr = today.getFullYear();
        const monthStr = (today.getMonth() + 1).toString().padStart(2, '0');
        document.getElementById('report-leave-month').value = `${yearStr}-${monthStr}`;
    }

    const tbody = document.getElementById('report-leave-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    // Mock Data
    if (leaveReportData.length === 0) {
        leaveReportData = [
            { id: 'LV001', empId: 'EMP012', empName: 'อารยา ทัศนัย', type: 'leave', typeLabel: 'ลางาน', detail: 'ลาป่วย (ติดเชื้อทางเดินหายใจ)', dateStr: '2026-02-24 ถึง 2026-02-25', status: 'approved' },
            { id: 'OT002', empId: 'EMP010', empName: 'มารศรี งานไว', type: 'ot', typeLabel: 'OT', detail: 'งานระบบเซิร์ฟเวอร์', dateStr: '2026-02-21 (17:30 - 20:30)', status: 'approved' },
            { id: 'LV003', empId: 'EMP009', empName: 'สมชาติ แซ่ลี้', type: 'leave', typeLabel: 'ลางาน', detail: 'ลากิจ (ติดต่อราชการ)', dateStr: '2026-02-20', status: 'rejected' }
        ];
    }

    setTimeout(() => filterLeaveReport(), 400);
}

function filterLeaveReport() {
    const search = (document.getElementById('report-leave-search').value || '').toLowerCase();
    const typeF = document.getElementById('report-leave-type').value;

    let filtered = leaveReportData;

    if (typeF !== 'all') filtered = filtered.filter(item => item.type === typeF);
    if (search) filtered = filtered.filter(item => item.empName.toLowerCase().includes(search) || item.empId.toLowerCase().includes(search));

    renderLeaveReport(filtered);
}

function renderLeaveReport(data) {
    const tbody = document.getElementById('report-leave-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 20px;">ไม่พบข้อมูล</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        let statusBadge = r.status === 'approved' ? '<span class="badge badge-success">อนุมัติแล้ว</span>' : '<span class="badge badge-danger">ไม่อนุมัติ</span>';
        let icon = r.type === 'leave' ? '<i class="fa-solid fa-suitcase-medical text-primary"></i>' : '<i class="fa-solid fa-clock text-warning"></i>';

        return `
                <tr>
                   <td>
                      <div><strong>${r.empName}</strong></div>
                      <div class="text-muted" style="font-size:12px;">${r.empId}</div>
                   </td>
                   <td>${icon} ${r.typeLabel}</td>
                   <td><span style="font-size:13px;">${r.detail}</span></td>
                   <td><strong>${r.dateStr}</strong></td>
                   <td>${statusBadge}</td>
                </tr>
            `;
    }).join('');
}

function exportReport(type) {
    alert(`กำลังดาวน์โหลดไฟล์รายงาน CSV สำหรับ ${type === 'general' ? 'ลงเวลาเข้า-ออก' : 'การลา/OT'}... (Mock)`);
}

// 3. Audit Log
let auditLogData = [];

function loadAuditLog() {
    const tbody = document.getElementById('audit-log-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...</td></tr>';

    if (auditLogData.length === 0) {
        auditLogData = [
            { timestamp: '2026-02-22 15:30:12', user: 'admin.hr', action: 'อนุมัติการลา', detail: 'อนุมัติการลาป่วยให้ EMP012', ip: '110.164.21.XX' },
            { timestamp: '2026-02-22 14:15:00', user: 'system', action: 'Auto-Checkout', detail: 'ระบบลงเวลาออกให้อัตโนมัติ (6 รายการ)', ip: 'localhost' },
            { timestamp: '2026-02-22 10:05:41', user: 'admin.hr', action: 'แก้ไขสิทธิ์พนักงาน', detail: 'เปลี่ยนสถานะ EMP005 เป็นหัวหน้างาน', ip: '110.164.21.XX' },
            { timestamp: '2026-02-22 08:30:00', user: 'somchai.j', action: 'ลงเวลาเข้างาน', detail: 'เช็คอินที่ สำนักงานใหญ่ (พิกัด: 13.75, 100.5)', ip: '223.24.11.XX' }
        ];
    }

    setTimeout(() => {
        tbody.innerHTML = auditLogData.map(r => `
                <tr>
                   <td><strong style="font-size:13px;">${r.timestamp}</strong></td>
                   <td><i class="fa-solid fa-user text-muted"></i> ${r.user}</td>
                   <td><span class="badge badge-info">${r.action}</span></td>
                   <td style="font-size:13px;">${r.detail}</td>
                   <td style="font-size:12px;" class="text-muted">${r.ip}</td>
                </tr>
            `).join('');
    }, 500);
}

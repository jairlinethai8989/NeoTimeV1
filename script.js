console.log("---- SCRIPT.JS STARTING ----");
// ─── App Global State ─────────────────────────────────
const APP_STATE = {
    currentPage: 'dashboard'
};

// ─── Superbase Initialization ──────────────────────────────
const SUPABASE_URL = 'https://jkrcjfjfncyvymdwcedi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprcmNqZmpmbmN5dnltZHdjZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTMwMDksImV4cCI6MjA4NzMyOTAwOX0.awHuGfZ7Wr_OlMvGTBgS4vvbyB1BBR-06rEYMxsNGLk';
var supabase;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: window.location.protocol !== 'file:'
            }
        });
    } else {
        console.warn("window.supabase is not defined. Using mock supabase client.");
    }
} catch (error) {
    console.warn("ไม่สามารถเรียกใช้ Supabase ได้:", error);
}

// ─── Dummy mock if it totally fails (Offline / Missing CDN) ───
if (!supabase) {
    supabase = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            signOut: async () => { }
        },
        from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: null }), order: async () => ({ data: [] }) }), single: async () => ({ data: null }), order: async () => ({ data: [] }) }),
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) }),
            delete: () => ({ eq: async () => ({ error: null }) })
        })
    };
}

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
    if (path.includes('login') || path.includes('line')) return;

    // 1. ตรวจสอบสถานะการเข้าสู่ระบบ
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        // ถ้ายังไม่ได้ล็อกอิน ให้เด้งกลับไปหน้า login.html
        window.location.href = 'login.html';
        return;
    }

    // Load System Settings (Theme & Logo)
    loadSystemSettings();

    // 2. ถ้าล็อกอินแล้ว ดึงข้อมูล Profile มาเก็บใน MOCK_USER
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
            MOCK_USER.permissions = data.accessible_menus || ['dashboard', 'checkin', 'records', 'map', 'shifts', 'my-requests', 'profile'];

            applyUserPermissions();

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

function applyUserPermissions() {
    const perms = MOCK_USER.permissions || [];
    
    // Check and hide/show page items
    document.querySelectorAll('.sidebar-nav .nav-item[data-page], .sidebar-nav .nav-child[data-page]').forEach(item => {
        const page = item.getAttribute('data-page');
        if (perms.includes(page) || page === 'profile') {
            item.style.display = ''; // restore default
        } else {
            item.style.display = 'none'; // hide if no permission
        }
    });

    // Hide parent groups if all children are hidden
    document.querySelectorAll('.sidebar-nav .nav-group').forEach(group => {
        const children = Array.from(group.querySelectorAll('.nav-child[data-page]'));
        const hasVisibleChild = children.some(c => c.style.display !== 'none');
        if (hasVisibleChild) {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
    });

    // Check if the current initialized page is allowed
    const startPage = document.querySelector('.nav-item.active[data-page]')?.getAttribute('data-page') || 'dashboard';
    if (!perms.includes(startPage) && startPage !== 'profile') {
        const fallbackPage = perms[0] || 'profile';
        const targetEl = document.querySelector(`[data-page="${fallbackPage}"]`);
        if (targetEl) {
            navigateTo(fallbackPage, targetEl, targetEl.classList.contains('nav-child'));
        }
    }
}


function updateHeaderDate() {
    const n = new Date();
    const dOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
    document.getElementById('header-date').textContent = n.toLocaleDateString('th-TH', dOpts);
}

// ─── Navigation Logic ─────────────────────────────────
window.navigateTo = function (pageId, element, isChild = false) {
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
        'profile': 'โปรไฟล์',
        'manage-shifts': 'จัดตารางกะงาน'
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
    } else if (pageId === 'map') {
        loadMap();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'profile') {
        loadProfileData();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'shifts') {
        loadShifts();
        if (clockIntervalId) clearInterval(clockIntervalId);
    } else if (pageId === 'manage-shifts') {
        loadManageShifts();
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
};

// ─── Dropdown Toggle ─────────────────────────────────
window.toggleNavGroup = function (element) {
    const group = element.parentElement;
    group.classList.toggle('expanded');
};

// ─── Mobile Sidebar Toggle ────────────────────────────
window.toggleSidebar = function () {
    document.getElementById('sidebar').classList.toggle('open');
};

// ─── Placeholders ─────────────────────────────────────
window.refreshPageData = function () {
    console.log('Refreshing data for:', APP_STATE.currentPage);
    if (APP_STATE.currentPage === 'users') loadUsers();
    if (APP_STATE.currentPage === 'dashboard') loadDashboard();
    if (APP_STATE.currentPage === 'workplaces') loadWorkplaces();
    if (APP_STATE.currentPage === 'records') loadRecords();
    if (APP_STATE.currentPage === 'map') loadMap();
    if (APP_STATE.currentPage === 'profile') loadProfileData();
    if (APP_STATE.currentPage === 'shifts') loadShifts();
    if (APP_STATE.currentPage === 'manage-shifts') loadManageShifts();
    if (APP_STATE.currentPage === 'my-requests') loadMyRequests('pending');
    if (APP_STATE.currentPage === 'approve-requests') loadApproveOT();
    if (APP_STATE.currentPage === 'approve-leave') loadApproveLeave();
    if (APP_STATE.currentPage === 'report-general') loadGeneralReport();
    if (APP_STATE.currentPage === 'report-leave') loadLeaveReport();
    if (APP_STATE.currentPage === 'audit-log') loadAuditLog();
};

window.logout = async function () {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        console.log('Logging out...');
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    }
};

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
}

function updateCheckinColors(type) {
    const btnCi = document.getElementById('btn-ci');
    const btnCo = document.getElementById('btn-co');
    if (!btnCi || !btnCo) return;

    // Reset classes
    btnCi.className = 'btn btn-checkin';
    btnCo.className = 'btn btn-checkout';
    btnCi.style.boxShadow = '';
    
    if (type === 'normal') {
        btnCi.classList.add('btn-primary');
        btnCo.classList.add('btn-outline');
        btnCi.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
    } else if (type === 'ot') {
        btnCi.classList.add('btn-warning');
        btnCo.classList.add('btn-outline');
        btnCi.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
    } else if (type === 'shift') {
        btnCi.classList.add('btn-info');
        btnCo.classList.add('btn-outline');
        btnCi.style.boxShadow = '0 4px 12px rgba(10, 187, 135, 0.3)';
    }
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
    // Removed
}

async function submitCheckin(type) {
    const noteEl = document.getElementById('ci-note');
    const note = noteEl ? noteEl.value : '';
    const typeRadio = document.querySelector('input[name="ci-type"]:checked');
    const checkinCategory = typeRadio ? typeRadio.value : 'เวลาปกติ';

    if (!currentLat || !currentLng) {
        alert('ไม่สามารถเช็คอินได้: ยังไม่ได้รับตำแหน่ง GPS');
        return;
    }

    const btnId = type === 'Check-in' ? 'btn-ci' : 'btn-co';
    const btn = document.getElementById(btnId);
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
        const R = 6371e3; // metres
        // No workplace distance check needed
        const distance = 0;
        const status = 'ปกติ';

        const realUserId = MOCK_USER.uuid; 
        
        let finalNote = note;
        if (checkinCategory !== 'เวลาปกติ') {
            finalNote = `[${checkinCategory}] ${note}`.trim();
        }

        const payload = {
            user_id: realUserId,
            workplace_id: null,
            type: type,
            lat: currentLat,
            lng: currentLng,
            distance_meters: Math.round(distance),
            status: status,
            note: finalNote,
            date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
            time: new Date().toLocaleTimeString('en-GB') // HH:mm:ss
        };

        const { error: insertError } = await supabase.from('attendance_logs').insert([payload]);
        if (insertError) throw insertError;

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            alert(`ทำรายการ ${type} (${checkinCategory}) สำเร็จ!`);
            updateCheckinStatusCard(type, checkinCategory);
        }, 800);

    } catch (error) {
        console.error('Error submitting checkin:', error.message);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        alert('เชื่อมต่อล้มเหลว: ' + error.message);
    }
}

function updateCheckinStatusCard(type, category) {
    const stBox = document.querySelector('.checkin-status');
    stBox.classList.remove('empty');
    stBox.innerHTML = `
            <div class="status-icon" style="background:#ecfdf5;color:#10b981;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px;">
                <i class="fa-solid fa-check"></i>
            </div>
            <h3 style="color:#10b981">บันทึกเวลาสำเร็จ</h3>
            <p>${type} (${category})<br>เวลา ${new Date().toLocaleTimeString('th-TH')} น.</p>
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
            .eq('type', 'Check-in');
        if (errLogs) throw errLogs;

        // 3. Process data map per user (We want the *earliest* check-in status per user)
        const userFirstCheckinMap = {};
        logs.forEach(log => {
            if (!userFirstCheckinMap[log.user_id]) {
                userFirstCheckinMap[log.user_id] = log;
            } else {
                // Keep the earliest time
                if (log.time < userFirstCheckinMap[log.user_id].time) {
                    userFirstCheckinMap[log.user_id] = log;
                }
            }
        });

        const uniqueCheckins = Object.keys(userFirstCheckinMap).length;
        const totalCheckins = uniqueCheckins;

        // Count base on unique users
        let onTime = 0;
        let late = 0;
        let outOfRange = 0;

        Object.values(userFirstCheckinMap).forEach(firstLog => {
            if (firstLog.status === 'ปกติ') onTime++;
            else if (firstLog.status === 'สาย') late++;
            else if (firstLog.status === 'นอกพื้นที่') outOfRange++;
        });

        updateDashboardUI({
            totalEmployees: totalEmployees || 0,
            totalCheckins: totalCheckins,
            onTime: onTime,
            late: late,
            outOfRange: outOfRange
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
            status: u.status,
            accessible_menus: u.accessible_menus
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
    
    // Default permissions for new users
    const defaultPerms = ['dashboard', 'checkin', 'records', 'map', 'shifts', 'my-requests', 'profile'];
    document.querySelectorAll('input[name="u-perms"]').forEach(cb => {
        cb.checked = defaultPerms.includes(cb.value);
    });

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
    
    const perms = u.accessible_menus || ['dashboard', 'checkin', 'records', 'map', 'shifts', 'my-requests', 'profile'];
    document.querySelectorAll('input[name="u-perms"]').forEach(cb => {
        cb.checked = perms.includes(cb.value);
    });

    openModal('user-modal');
}

async function saveUser() {
    const selectedPerms = Array.from(document.querySelectorAll('input[name="u-perms"]:checked')).map(cb => cb.value);
    
    const payload = {
        employee_id: document.getElementById('u-empid').value.trim(),
        full_name: document.getElementById('u-name').value.trim(),
        email: document.getElementById('u-email').value.trim(),
        username: document.getElementById('u-username').value.trim(),
        role: document.getElementById('u-role').value,
        primary_shift: document.getElementById('u-shift').value.trim(),
        status: document.getElementById('u-status').value,
        accessible_menus: selectedPerms
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
            .order('date', { ascending: false })
            .order('time', { ascending: false });

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
let currentManageMonth = new Date();
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

// ─── MANAGE SHIFTS (AI GENERATION) ───
function loadManageShifts() {
    // Just refresh the header text for the month
    const year = currentManageMonth.getFullYear();
    const month = currentManageMonth.getMonth();
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('manage-month-year').textContent = `${monthNames[month]} ${year}`;
    
    // Reset table
    document.getElementById('manage-shifts-table-container').innerHTML = `
        <div style="text-align:center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-calendar-days" style="font-size: 48px; margin-bottom: 16px; color: #cbd5e1;"></i>
            <p>กดปุ่ม "จัดตารางด้วย AI" เพื่อสร้างตารางกะงานของเดือนนี้</p>
        </div>
    `;
}

function changeManageMonth(dir) {
    currentManageMonth.setMonth(currentManageMonth.getMonth() + dir);
    loadManageShifts();
}

function addShiftCondition() {
    const list = document.getElementById('shift-conditions-list');
    const newDiv = document.createElement('div');
    newDiv.className = 'condition-item';
    newDiv.style.cssText = 'display: flex; gap: 12px; align-items: center; background: white; padding: 12px; border: 1px solid var(--border); border-radius: 6px;';
    newDiv.innerHTML = `
        <label class="switch">
            <input type="checkbox" checked>
            <span class="slider round"></span>
        </label>
        <select class="form-control" style="width: auto; flex: 1;">
            <option value="dept">แผนก (Department)</option>
            <option value="emp">ชื่อพนักงาน</option>
            <option value="shift_req">กะที่ต้องเข้า</option>
            <option value="max_consecutive">จำนวนกะติดต่อกันสูงสุด</option>
            <option value="custom" selected>เงื่อนไขกำหนดเอง</option>
        </select>
        <input type="text" class="form-control" style="flex: 2;" placeholder="ระบุเงื่อนไขเพิ่มเติม...">
        <button class="btn-icon text-danger" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    list.appendChild(newDiv);
}

function generateAIShifts() {
    // Collect specific active rules
    const rules = [];
    document.querySelectorAll('#shift-conditions-list .condition-item').forEach(item => {
        const isActive = item.querySelector('input[type="checkbox"]').checked;
        if(isActive) {
            rules.push({
                type: item.querySelector('select').options[item.querySelector('select').selectedIndex].text,
                val: item.querySelector('input[type="text"]').value || '(ไม่ระบุ)'
            });
        }
    });

    if (rules.length === 0) {
        if (!confirm("ไม่ได้เปิดใช้งานเงื่อนไขใดๆ ยืนยันให้ AI สุ่มจัดตารางอิสระหรือไม่?")) return;
    }

    const container = document.getElementById('manage-shifts-table-container');
    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px; color: var(--primary);">
                <i class="fa-solid fa-wand-magic-sparkles fa-bounce"></i>
            </div>
            <h3 style="color: var(--primary);">AI กำลังคำนวณและจัดตาราง...</h3>
            <p class="text-muted" style="margin-top: 8px;">อิงตามเงื่อนไขที่เลือกไว้ โปรดรอสักครู่</p>
        </div>
    `;

    setTimeout(() => {
        // Mock generating a table
        const daysInMon = new Date(currentManageMonth.getFullYear(), currentManageMonth.getMonth() + 1, 0).getDate();
        
        let headerHtml = '<th>พนักงาน</th>';
        for(let d=1; d<=daysInMon; d++) {
            headerHtml += `<th style="text-align:center; min-width: 40px;">${d}</th>`;
        }

        const emps = ['สมชาย ใจดี', 'สุดา รักดี', 'วินัย มั่นคง'];
        let bodyHtml = '';

        emps.forEach(emp => {
            bodyHtml += `<tr><td><strong>${emp}</strong></td>`;
            for(let d=1; d<=daysInMon; d++) {
                // Mock random shift
                const r = Math.random();
                let txt = 'O'; let color = 'text-muted';
                if(r > 0.8) { txt = 'N'; color = 'text-primary'; }
                else if(r > 0.6) { txt = 'M'; color = 'text-success'; }
                else if(r > 0.2) { txt = 'A'; color = 'text-warning'; }
                
                bodyHtml += `<td style="text-align:center;" class="${color}"><strong>${txt}</strong></td>`;
            }
            bodyHtml += `</tr>`;
        });

        container.innerHTML = `
            <div style="padding: 16px; background: #ecfdf5; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div><i class="fa-solid fa-circle-check text-success"></i> <strong>สร้างตารางสำเร็จ</strong><span class="text-muted"> โดยวิเคราะห์จาก ${rules.length} เงื่อนไข</span></div>
                <div style="display:flex; gap:8px;">
                    <span style="font-size:12px;" class="text-muted">M=เช้า, A=บ่าย, N=ดึก, O=หยุด</span>
                </div>
            </div>
            <div class="table-responsive">
                <table class="data-table" style="font-size: 13px;">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>
            <div style="padding: 16px; text-align: right;">
                <button class="btn btn-outline" onclick="loadManageShifts()"><i class="fa-solid fa-rotate-left"></i> เริ่มใหม่</button>
                <button class="btn btn-primary" onclick="alert('บันทึกการจัดกะสำเร็จ ระบบจะอัปเดตไปยังปฏิทินของพนักงานแต่ละคน')"><i class="fa-solid fa-save"></i> บันทึกและประกาศกะ</button>
            </div>
        `;
    }, 2500);
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
                    <div style="font-size: 13px; background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                        <span class="text-muted">เหตุผล:</span> ${r.reason}
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="btn btn-outline" style="padding: 4px 12px; font-size: 12px;" onclick="openDocModal('${r.id}', 'my')"><i class="fa-solid fa-file-pdf"></i> ดูเอกสาร</button>
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
                   <td>
                        <div style="display:flex; gap:8px;">
                            ${actionButtons}
                            <button class="btn-icon text-muted" onclick="openDocModal('${r.id}', 'ot')" title="ดูเอกสาร"><i class="fa-solid fa-file-pdf"></i></button>
                        </div>
                   </td>
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
                   <td>
                        <div style="display:-webkit-box; display:flex; gap:8px;">
                            ${actionButtons}
                            <button class="btn-icon text-muted" onclick="openDocModal('${r.id}', 'leave')" title="ดูเอกสาร"><i class="fa-solid fa-file-invoice"></i></button>
                        </div>
                   </td>
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

// ─── MAP MODULE ──────────────────────────────────────
let mainMap = null;
let mapMarkers = [];

async function loadMap() {
    console.log("Loading Map...");
    
    if (!mainMap) {
        // Initialize Leaflet map
        mainMap = L.map('main-leaflet-map').setView([13.7563, 100.5018], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mainMap);
    }

    // Clear old markers
    mapMarkers.forEach(m => mainMap.removeLayer(m));
    mapMarkers = [];
    let bounds = [];

    try {
        mainMap.getContainer().style.opacity = '0.5';

        // 1. Fetch Workplaces
        const { data: wpData, error: wpErr } = await supabase
            .from('workplaces')
            .select('*')
            .eq('status', 'ใช้งาน');
            
        if (wpErr) throw wpErr;

        if (wpData) {
            wpData.forEach(wp => {
                if (!wp.lat || !wp.lng) return;
                
                const wpIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                const wpMarker = L.marker([wp.lat, wp.lng], { icon: wpIcon }).addTo(mainMap);
                wpMarker.bindPopup(`
                    <div style="font-family:'Inter',sans-serif; text-align:center;">
                        <h4 style="margin:0; color:var(--primary);"><i class="fa-solid fa-building"></i> ${wp.name}</h4>
                        <p style="margin:4px 0 0; font-size:12px;" class="text-muted">รัศมี: ${wp.radius} เมตร</p>
                    </div>
                `);
                
                // Add radius circle
                const circle = L.circle([wp.lat, wp.lng], {
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.15,
                    weight: 1,
                    radius: wp.radius
                }).addTo(mainMap);
                
                mapMarkers.push(wpMarker);
                mapMarkers.push(circle);
                bounds.push([wp.lat, wp.lng]);
            });
        }

        // 2. Fetch Today's Checkins
        const today = new Date().toLocaleDateString('en-CA');
        const { data: logData, error: logErr } = await supabase
            .from('attendance_logs')
            .select(`
                lat, lng, status, time, type,
                profiles (full_name)
            `)
            .eq('date', today)
            .eq('type', 'Check-in');
            
        if (logErr) throw logErr;

        if (logData) {
            logData.forEach(log => {
                if (!log.lat || !log.lng) return;
                
                let iconColor = 'green';
                let bdgClass = 'success';
                
                if (log.status === 'สาย') { 
                    iconColor = 'orange'; 
                    bdgClass = 'warning'; 
                } else if (log.status === 'นอกพื้นที่') { 
                    iconColor = 'red'; 
                    bdgClass = 'danger'; 
                }

                const userIcon = L.icon({
                    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${iconColor}.png`,
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                const logMarker = L.marker([log.lat, log.lng], { icon: userIcon }).addTo(mainMap);
                const empName = log.profiles ? log.profiles.full_name : 'ไม่ทราบชื่อ';
                
                logMarker.bindPopup(`
                    <div style="font-family:'Inter',sans-serif; text-align:center;">
                        <strong style="font-size:14px;"><i class="fa-solid fa-user"></i> ${empName}</strong><br>
                        <span class="badge badge-${bdgClass}" style="margin:6px 0; display:inline-block; font-size:11px;">${log.status}</span><br>
                        <small style="color:#64748b;">เวลาเช็คอิน: ${log.time}</small>
                    </div>
                `);

                mapMarkers.push(logMarker);
                bounds.push([log.lat, log.lng]);
            });
        }

        // 3. Fit bounds
        if (bounds.length > 0) {
            // Check if bounds are valid numbers
            if(bounds.every(b => !isNaN(b[0]) && !isNaN(b[1]))) {
                mainMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
            }
        }
        
    } catch (err) {
        console.error("Error loading map:", err.message);
    } finally {
        if(mainMap && mainMap.getContainer()) {
            mainMap.getContainer().style.opacity = '1';
        }
    }
    
    // Fix resize issue when switching tabs
    setTimeout(() => {
        if(mainMap) mainMap.invalidateSize();
    }, 400);
}

// ─── PROFILE MODULE ──────────────────────────────────
async function loadProfileData() {
    if (!MOCK_USER || !MOCK_USER.uuid) return;
    
    console.log("Loading Profile Data...");
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', MOCK_USER.uuid)
            .single();
            
        if (error) throw error;
        
        if (data) {
            // Update UI elements
            document.getElementById('profile-display-name').textContent = data.full_name || 'ไม่ทราบชื่อ';
            document.getElementById('profile-display-role').textContent = data.role || '-';
            
            const statusEl = document.getElementById('profile-display-status');
            statusEl.textContent = data.status || 'ใช้งาน';
            statusEl.className = data.status === 'ใช้งาน' ? 'badge badge-success' : 'badge badge-danger';
            
            // Generate Avatar
            const encodedName = encodeURIComponent(data.full_name || 'User');
            document.getElementById('profile-img-preview').src = `https://ui-avatars.com/api/?name=${encodedName}&background=2563eb&color=fff`;
            
            // Populate Form
            document.getElementById('prof-empid').value = data.employee_id || '';
            document.getElementById('prof-name').value = data.full_name || '';
            document.getElementById('prof-email').value = data.email || '';
            document.getElementById('prof-role').value = data.role || '';
            // For custom fields like phone & department, assume they might exist in profiles table (or need to be added). 
            // We use simple fallback to empty string if not present.
            document.getElementById('prof-phone').value = data.phone || '';
            document.getElementById('prof-department').value = data.department || '';
            
            // Signature Load
            const sigB64 = data.signature_base64 || '';
            document.getElementById('prof-signature_base64').value = sigB64;
            const preImg = document.getElementById('saved-signature-preview');
            const noSigTxt = document.getElementById('no-signature-text');
            if (sigB64) {
                preImg.src = sigB64;
                preImg.style.display = 'block';
                noSigTxt.style.display = 'none';
            } else {
                preImg.style.display = 'none';
                noSigTxt.style.display = 'block';
            }
        }
        
        initSignatureCanvas();

    } catch (err) {
        console.error("Error loading profile details:", err.message);
        alert("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้: " + err.message);
    }
}

async function saveProfileData() {
    if (!MOCK_USER || !MOCK_USER.uuid) return;
    
    const btn = document.getElementById('btn-save-profile');
    const orgHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
    btn.disabled = true;
    
    const payload = {
        full_name: document.getElementById('prof-name').value.trim(),
        email: document.getElementById('prof-email').value.trim(),
        phone: document.getElementById('prof-phone').value.trim(),
        department: document.getElementById('prof-department').value.trim(),
        signature_base64: document.getElementById('prof-signature_base64').value.trim()
    };
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', MOCK_USER.uuid);
            
        if (error) throw error;
        
        // Update local session mock user
        MOCK_USER.name = payload.full_name;
        
        // Update App Headers
        const nameEl = document.getElementById('user-display-name');
        if (nameEl) nameEl.textContent = payload.full_name;
        
        // Generate new avatar
        const encodedName = encodeURIComponent(payload.full_name || 'User');
        document.getElementById('profile-img-preview').src = `https://ui-avatars.com/api/?name=${encodedName}&background=2563eb&color=fff`;
        
        alert("อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว");
        
        // Refresh display texts
        document.getElementById('profile-display-name').textContent = payload.full_name;
        
    } catch (err) {
        console.error("Error saving profile details:", err.message);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message);
    } finally {
        btn.innerHTML = orgHtml;
        btn.disabled = false;
    }
}

async function requestPasswordReset() {
    const email = document.getElementById('prof-email').value;
    if (!email) {
        alert("กรุณากรอกและบันทึกอีเมลของคุณก่อนทำการรีเซ็ตรหัสผ่าน");
        return;
    }
    
    if (confirm(`ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่ ${email} ยืนยันหรือไม่?`)) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login.html'
            });
            
            if (error) throw error;
            
            alert("ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว (กรุณาเช็คในกล่องจดหมายหรือสแปม)");
        } catch (err) {
            console.error("Reset password error:", err.message);
            alert("เกิดข้อผิดพลาด: " + err.message);
        }
    }
}

// ─── SIGNATURE PAD & DOCUMENT VIEWER ─────────────────
let sigCanvas, sigCtx;
let isDrawing = false;
let isCanvasInitialized = false;

function initSignatureCanvas() {
    sigCanvas = document.getElementById('signature-canvas');
    if (!sigCanvas) return;
    
    if (!isCanvasInitialized) {
        sigCtx = sigCanvas.getContext('2d');
        sigCtx.lineWidth = 2;
        sigCtx.lineCap = 'round';
        sigCtx.strokeStyle = '#2563eb'; // Blue pen ink style
        
        // Ensure perfect size resolution
        sigCanvas.width = sigCanvas.offsetWidth;
        sigCanvas.height = sigCanvas.offsetHeight;

        sigCanvas.addEventListener('mousedown', startDrawing);
        sigCanvas.addEventListener('mousemove', draw);
        sigCanvas.addEventListener('mouseup', stopDrawing);
        sigCanvas.addEventListener('mouseout', stopDrawing);

        sigCanvas.addEventListener('touchstart', handleTouchStart, {passive: false});
        sigCanvas.addEventListener('touchmove', handleTouchMove, {passive: false});
        sigCanvas.addEventListener('touchend', stopDrawing);
        isCanvasInitialized = true;
    }
}

function startDrawing(e) {
    isDrawing = true;
    draw(e);
}
function draw(e) {
    if (!isDrawing) return;
    const rect = sigCanvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    
    sigCtx.lineTo(x, y);
    sigCtx.stroke();
    sigCtx.beginPath();
    sigCtx.moveTo(x, y);
    
    document.getElementById('prof-signature_base64').value = sigCanvas.toDataURL('image/png');
}
function stopDrawing() {
    isDrawing = false;
    sigCtx.beginPath();
}
function handleTouchStart(e) {
    if(e.target === sigCanvas) e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", { clientX: touch.clientX, clientY: touch.clientY });
    sigCanvas.dispatchEvent(mouseEvent);
}
function handleTouchMove(e) {
    if(e.target === sigCanvas) e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", { clientX: touch.clientX, clientY: touch.clientY });
    sigCanvas.dispatchEvent(mouseEvent);
}

function clearSignature() {
    if(!sigCtx) return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    document.getElementById('prof-signature_base64').value = '';
    
    // Also clear existing saved signature when resetting
    const preImg = document.getElementById('saved-signature-preview');
    const noSigTxt = document.getElementById('no-signature-text');
    if(preImg) {
        preImg.style.display = 'none';
        preImg.src = '';
    }
    if(noSigTxt) noSigTxt.style.display = 'block';
}

function openDocModal(reqId, context) {
    let req = null;
    let employeeName = '';
    let employeeId = '';
    let doctype = '';
    let duration = '';
    let createdDate = '';
    
    // Find the Request Data based on context
    if (context === 'my') {
        req = myRequestsData.find(r => r.id === reqId);
        employeeName = MOCK_USER.name || '-';
        employeeId = MOCK_USER.id || '-';
        if (req) {
            doctype = req.type === 'leave' ? `ขอลางาน (${req.leaveType})` : `ขอทำล่วงเวลา (OT)`;
            duration = req.type === 'leave' ? 
                (req.startDate === req.endDate ? req.startDate : `${req.startDate} ถึง ${req.endDate}`) :
                `${req.startDate} | ${req.otStart} - ${req.otEnd}`;
            createdDate = req.created ? req.created : new Date().toLocaleString('th-TH');
        }
    } else if (context === 'leave') {
        req = approveLeaveData.find(r => r.id === reqId);
        if (req) {
            employeeName = req.empName;
            employeeId = req.empId;
            doctype = `ขอลางาน (${req.type})`;
            duration = req.startDate === req.endDate ? req.startDate : `${req.startDate} ถึง ${req.endDate}`;
            createdDate = req.startDate; // mock created date
        }
    } else if (context === 'ot') {
        req = approveOTData.find(r => r.id === reqId);
        if (req) {
            employeeName = req.empName;
            employeeId = req.empId;
            doctype = `ขอทำล่วงเวลา (OT)`;
            duration = `${req.date} | ${req.startTime} - ${req.endTime}`;
            createdDate = req.date; // mock created date
        }
    }
    
    if (!req) {
        alert("ไม่พบคำขอดังกล่าว");
        return;
    }

    // Populate Modal Document
    // Change Title if OT
    const isOT = context === 'ot' || (context === 'my' && req.type === 'ot');
    document.getElementById('doc-type-title').textContent = isOT ? 'ใบคำขอทำงานล่วงเวลา (OT Request Form)' : 'ใบคำขอลางาน (Leave Request Form)';
    
    document.getElementById('doc-req-id').textContent = req.id;
    document.getElementById('doc-req-date').textContent = createdDate;
    document.getElementById('doc-emp-name').textContent = `${employeeName} (${employeeId})`;
    document.getElementById('doc-req-type').textContent = doctype;
    document.getElementById('doc-req-reason').textContent = req.reason;
    document.getElementById('doc-req-duration').textContent = duration;
    
    // Setup Signatures
    // 1. Requester Signature (Assume user attached it from profile if 'my', or mock for others)
    const reqSignImg = document.getElementById('doc-requester-sign');
    const reqSignFallback = document.getElementById('doc-requester-no-sign');
    document.getElementById('doc-requester-name').textContent = `ลงชื่อ...${employeeName}...`;
    
    // Check if the current user has a saved signature and they are the one viewing their own form
    if (context === 'my' && document.getElementById('prof-signature_base64') && document.getElementById('prof-signature_base64').value) {
        reqSignImg.src = document.getElementById('prof-signature_base64').value;
        reqSignImg.style.display = 'block';
        reqSignFallback.style.display = 'none';
        document.getElementById('doc-requester-name').textContent = employeeName;
    } else {
        reqSignImg.src = '';
        reqSignImg.style.display = 'none';
        reqSignFallback.style.display = 'block';
    }
    
    // 2. Approver Signature & Status
    const docStatus = document.getElementById('doc-approval-status');
    const appSignImg = document.getElementById('doc-approver-sign');
    const appSignFallback = document.getElementById('doc-approver-no-sign');
    
    if (req.status === 'approved') {
        docStatus.textContent = 'อนุมัติเรียบร้อย';
        docStatus.style.color = 'green';
        appSignFallback.textContent = '(เซ็นชื่อในระบบแล้ว)';
        appSignFallback.style.display = 'block';
        appSignFallback.style.color = '#10b981';
        appSignImg.style.display = 'none';
        document.getElementById('doc-approver-name').textContent = "ผู้อนุมัติ (ออนไลน์)";
        
        // If the current user IS the approver viewing this, they can append their own signature dynamically!
        if(context !== 'my' && document.getElementById('prof-signature_base64') && document.getElementById('prof-signature_base64').value) {
           appSignImg.src = document.getElementById('prof-signature_base64').value;
           appSignImg.style.display = 'block';
           appSignFallback.style.display = 'none';
           document.getElementById('doc-approver-name').textContent = MOCK_USER.name || "ผู้อนุมัติ";
        }
        
    } else if (req.status === 'rejected') {
        docStatus.textContent = 'ไม่อนุมัติ';
        docStatus.style.color = 'red';
        appSignFallback.textContent = '(ไม่อนุมัติคำขอ)';
        appSignFallback.style.color = 'red';
        appSignFallback.style.display = 'block';
        appSignImg.style.display = 'none';
        document.getElementById('doc-approver-name').textContent = "ผู้มีอำนาจตัดสินใจ";
    } else {
        docStatus.textContent = 'รอดำเนินการ';
        docStatus.style.color = 'orange';
        appSignFallback.textContent = '(รอการอนุมัติ)';
        appSignFallback.style.color = 'orange';
        appSignFallback.style.display = 'block';
        appSignImg.style.display = 'none';
        document.getElementById('doc-approver-name').textContent = "ลงชื่อ................................";
    }

    openModal('view-doc-modal');
}

function exportDocToPDF() {
    const element = document.getElementById('pdf-export-container');
    const opt = {
      margin:       0,
      filename:     `doc-${document.getElementById('doc-req-id').textContent}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

// ─── SYSTEM SETTINGS (THEME & LOGO) ───

function loadSystemSettings() {
    const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    
    // 1. Apply Theme
    const themeMode = lsSettings.themeMode || 'light';
    if(themeMode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const themeInput = document.getElementById('st-theme-mode');
    if(themeInput) themeInput.value = themeMode;

    // 2. Apply Custom Logo
    const logoBase64 = lsSettings.logoBase64;
    const sidebarLogoText = document.querySelector('.sidebar-header h2');
    if (logoBase64) {
        const logoPreview = document.getElementById('st-logo-preview');
        if (logoPreview) {
            logoPreview.src = logoBase64;
            logoPreview.style.display = 'block';
        }
        if (sidebarLogoText) {
            sidebarLogoText.innerHTML = `<img src="${logoBase64}" style="max-height: 28px; margin-right: 8px; vertical-align: middle;"> Gravity`;
        }
    } else {
        if (sidebarLogoText && sidebarLogoText.innerHTML.includes('<img')) {
            sidebarLogoText.innerHTML = `<i class="fa-solid fa-clock"></i> NeoTime`;
        }
    }

    // 3. Apply Watermark
    const watermarkBase64 = lsSettings.watermarkBase64;
    const wrapper = document.querySelector('.main-content');
    if (watermarkBase64) {
        const wmPreview = document.getElementById('st-watermark-preview');
        if (wmPreview) {
            wmPreview.src = watermarkBase64;
            wmPreview.style.display = 'block';
        }
        if(wrapper) {
           wrapper.style.backgroundImage = `url('${watermarkBase64}')`;
           wrapper.style.backgroundRepeat = 'repeat';
           wrapper.style.backgroundPosition = 'center';
           wrapper.style.backgroundSize = '200px'; 
           wrapper.style.backgroundBlendMode = 'overlay';
           // Dark mode contrast helper
           if(themeMode === 'dark') {
                wrapper.style.backgroundColor = 'rgba(30, 41, 59, 0.9)';
           } else {
                wrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'; 
           }
        }
    } else {
        if(wrapper) {
           wrapper.style.backgroundImage = 'none';
        }
    }

    // 4. Update Inputs if on settings page
    if (lsSettings.timeIn && document.getElementById('st-time-in')) document.getElementById('st-time-in').value = lsSettings.timeIn;
    if (lsSettings.timeOut && document.getElementById('st-time-out')) document.getElementById('st-time-out').value = lsSettings.timeOut;
    if (lsSettings.lateGrace && document.getElementById('st-late-grace')) document.getElementById('st-late-grace').value = lsSettings.lateGrace;
    if (lsSettings.wifi && document.getElementById('st-wifi')) document.getElementById('st-wifi').value = lsSettings.wifi;
    if (lsSettings.photo && document.getElementById('st-photo')) document.getElementById('st-photo').value = lsSettings.photo;
}

function saveSystemSettings() {
    confirmAction('ยืนยันการบันทึกการตั้งค่าระบบ?', '', () => {
        const btn = document.querySelector('#page-settings .btn-primary');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
        btn.disabled = true;

        const currentSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');

        const newSettings = {
            ...currentSettings,
            timeIn: document.getElementById('st-time-in')?.value,
            timeOut: document.getElementById('st-time-out')?.value,
            lateGrace: document.getElementById('st-late-grace')?.value,
            wifi: document.getElementById('st-wifi')?.value,
            photo: document.getElementById('st-photo')?.value,
            themeMode: document.getElementById('st-theme-mode')?.value
        };

        const logoPreview = document.getElementById('st-logo-preview');
        if (logoPreview && logoPreview.style.display !== 'none' && logoPreview.src) {
             newSettings.logoBase64 = logoPreview.src;
        } else {
             delete newSettings.logoBase64;
        }

        const wmPreview = document.getElementById('st-watermark-preview');
        if (wmPreview && wmPreview.style.display !== 'none' && wmPreview.src) {
             newSettings.watermarkBase64 = wmPreview.src;
        } else {
             delete newSettings.watermarkBase64;
        }

        try {
            localStorage.setItem('systemAdminSettings', JSON.stringify(newSettings));
            setTimeout(() => {
                loadSystemSettings();
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                alert('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
            }, 600);
        } catch(e) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            alert('ไม่สามารถบันทึกได้ รูปภาพอาจมีขนาดใหญ่เกินไป โปรดเลือกลบแล้วอัปโหลดรูปที่เล็กลง');
            console.error(e);
        }
    });
}

function previewThemeMode(mode) {
    if(mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const wrapper = document.querySelector('.main-content');
        if (wrapper && wrapper.style.backgroundImage !== 'none') {
             wrapper.style.backgroundColor = 'rgba(30, 41, 59, 0.9)';
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        const wrapper = document.querySelector('.main-content');
        if (wrapper && wrapper.style.backgroundImage !== 'none') {
             wrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        }
    }
}

function previewSettingsImage(input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_SIZE = 600; 
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Compress heavily
                
                const preview = document.getElementById(previewId);
                preview.src = dataUrl;
                preview.style.display = 'block';
            };
            img.src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function clearSettingsImage(type) {
    const input = document.getElementById(`${type}-upload`);
    const preview = document.getElementById(`${type}-preview`);
    if(input) input.value = '';
    if(preview) {
        preview.src = '';
        preview.style.display = 'none';
        
        if(type === 'st-logo') {
            const sidebarLogoText = document.querySelector('.sidebar-header h2');
            if (sidebarLogoText && sidebarLogoText.innerHTML.includes('<img')) {
                sidebarLogoText.innerHTML = `<i class="fa-solid fa-clock"></i> NeoTime`;
            }
        }
        if(type === 'st-watermark') {
            const wrapper = document.querySelector('.main-content');
            if(wrapper) {
               wrapper.style.backgroundImage = 'none';
            }
        }
    }
}

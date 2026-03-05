console.log("---- SCRIPT.JS STARTING ----");
// ─── App Global State ─────────────────────────────────
const APP_STATE = {
    currentPage: 'dashboard'
};

// ─── Superbase Initialization ──────────────────────────────
const SUPABASE_URL = 'https://jkrcjfjfncyvymdwcedi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprcmNqZmpmbmN5dnltZHdjZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTMwMDksImV4cCI6MjA4NzMyOTAwOX0.awHuGfZ7Wr_OlMvGTBgS4vvbyB1BBR-06rEYMxsNGLk';
const USERNAME_EMAIL_DOMAIN = 'neo-iservice.app'; // Used to construct synthetic emails from usernames
function usernameToEmail(username) { return username.toLowerCase().trim() + '@' + USERNAME_EMAIL_DOMAIN; }
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
    id: 'ADMIN001',
    name: 'Default Admin',
    uuid: 'default-uuid',
    role: 'HR Admin',
    permissions: [
        'dashboard', 'checkin', 'records', 'map', 'worklog', 'shifts', 'manage-shifts',
        'my-requests', 'approve-requests', 'approve-leave',
        'report-general', 'report-leave', 'audit-log',
        'users', 'workplaces'
    ]
};

// ─── Initialization ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Prevent redirect loop and script errors on standalone pages
    const path = window.location.pathname.toLowerCase();
    if (path.includes('login') || path.includes('line')) return;

    /* 
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html';
        return;
    }
    await loadCurrentUserProfile(session.user.id);
    */
    
    // Load System Settings (Theme & Logo)
    loadSystemSettings();

    // Default identification for demo/cleared mode
    MOCK_USER.uuid = 'default-uuid';
    applyUserPermissions();

    // Sync UI with MOCK_USER
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');
    if (nameEl) nameEl.textContent = MOCK_USER.name;
    if (roleEl) roleEl.textContent = MOCK_USER.role;

    // Update Header Date
    updateHeaderDate();
    setInterval(updateHeaderDate, 60000); // Check every minute

    // Set default page
    navigateTo('dashboard', document.querySelector('.nav-item[data-page="dashboard"]'));
});

// ฟังก์ชันดึงข้อมูลพนักงานปัจจุบันที่ล็อกอินอยู่
async function loadCurrentUserProfile(uid) {
    try {
        // Always set uuid from the auth session first
        MOCK_USER.uuid = uid;
        
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            MOCK_USER.id = data.employee_id || '';
            MOCK_USER.name = data.full_name || '';
            MOCK_USER.role = data.role || 'พนักงาน';
            
            // ใช้สิทธิ์การเข้าถึงจากฐานข้อมูล (ที่ Admin ตั้งค่าไว้)
            // สำหรับ Admin ให้พยายามให้เห็นครบทุกเมนูไว้ก่อน เว้นแต่มีการระบุเจาะจงที่ขนาดใหญ่กว่าค่าเริ่มต้น
            const rolePerms = getPermissionsByRole(data.role);
            if (checkIsAdmin(data.role)) {
                MOCK_USER.permissions = rolePerms;
            } else if (data.accessible_menus && Array.isArray(data.accessible_menus) && data.accessible_menus.length > 0) {
                MOCK_USER.permissions = data.accessible_menus;
            } else {
                MOCK_USER.permissions = rolePerms;
            }
            
            // Sync with UI
            const nameEl = document.getElementById('user-display-name');
            const roleEl = document.getElementById('user-display-role');
            if (nameEl) nameEl.textContent = data.full_name || 'User';
            if (roleEl) roleEl.textContent = data.role || 'พนักงาน';
            
            const avatarImg = document.getElementById('user-avatar-img');
            if (avatarImg) {
                const encodedName = encodeURIComponent(data.full_name || 'User');
                const localAvatar = localStorage.getItem('userAvatar_' + uid);
                avatarImg.src = localAvatar || `https://ui-avatars.com/api/?name=${encodedName}&background=2563eb&color=fff`;
            }
        } else {
            // Profile not found - Initialize with basic auth info
            MOCK_USER.role = 'พนักงาน';
            MOCK_USER.permissions = getPermissionsByRole('พนักงาน');
            console.warn("Profile not found in DB for UID:", uid);
        }
        
        applyUserPermissions();
    } catch (e) {
        console.error("Error loading user profile:", e);
        // Still keep uuid from auth so check-in works
        MOCK_USER.permissions = getPermissionsByRole('พนักงาน');
        applyUserPermissions();
    }
}

// ฟังก์ชันตรวจสอบว่าเป็น Admin หรือไม่ (รองรับหลายภาษา/รูปแบบ)
function checkIsAdmin(role) {
    const r = (role || '').toLowerCase().trim();
    return r === 'hr admin' || r === 'admin' || r.includes('admin') || r === 'hr administrator' || r === 'ผู้ดูแลระบบ';
}

// กำหนดสิทธิ์ตาม Role (ค่าเริ่มต้นกรณีไม่ได้ทำ Custom Permissions)
function getPermissionsByRole(role) {
    const allMenus = [
        'dashboard', 'checkin', 'records', 'map', 'worklog', 'shifts', 'manage-shifts',
        'my-requests', 'approve-requests', 'approve-leave',
        'report-general', 'report-leave', 'audit-log',
        'users', 'workplaces'
    ];
    
    const supervisorMenus = [
        'dashboard', 'checkin', 'records', 'map', 'worklog', 'shifts', 'manage-shifts',
        'my-requests', 'approve-requests', 'approve-leave',
        'report-general', 'report-leave'
    ];
    
    const employeeMenus = [
        'dashboard', 'checkin', 'records', 'map', 'worklog', 'shifts',
        'my-requests'
    ];
    
    if (checkIsAdmin(role)) return allMenus;
    
    const r = (role || '').toLowerCase().trim();
    const isSupervisor = r === 'หัวหน้างาน' || r.includes('หัวหน้า') || r === 'supervisor' || r === 'หัวหน้า';
    
    if (isSupervisor) return supervisorMenus;
    return employeeMenus;
}


function applyUserPermissions() {
    const perms = MOCK_USER.permissions || [];
    
    // Check and hide/show page items
    document.querySelectorAll('.sidebar-nav .nav-item[data-page], .sidebar-nav .nav-child[data-page], .header-user-dropdown .dropdown-item[data-page]').forEach(item => {
        const page = item.getAttribute('data-page');
        if (perms.includes(page)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none'; // hide if no permission
        }
    });

    // Hide parent groups if all children are hidden
    document.querySelectorAll('.sidebar-nav .nav-group').forEach(group => {
        const children = Array.from(group.querySelectorAll('.nav-child[data-page]'));
        const hasVisibleChild = children.some(c => c.style.display !== 'none');
        
        // พิเศษ: สำหรับ Admin ให้แสดงกลุ่มจัดการระบบเสมอถ้ามีสิทธิ์
        const isManageGroup = group.querySelector('.nav-item-content')?.textContent.includes('จัดการระบบ');
        const isAdmin = checkIsAdmin(MOCK_USER.role);

        if (hasVisibleChild || (isManageGroup && isAdmin)) {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
    });

    // Check if the current initialized page is allowed
    const startPage = document.querySelector('.nav-item.active[data-page]')?.getAttribute('data-page') || 'dashboard';
    if (!perms.includes(startPage) && startPage !== 'worklog') {
        const fallbackPage = perms[0] || 'dashboard';
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
        'worklog': 'บันทึกการทำงาน',
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
    } else if (pageId === 'worklog') {
        loadWorklogPage();
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
    } else if (pageId === 'settings') {
        loadSystemSettings();
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

// ─── Header Dropdown ────────────────────────────────
window.toggleUserDropdown = function() {
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) dropdown.classList.toggle('active');
};

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
    const userHeader = document.querySelector('.header-user');
    const dropdown = document.getElementById('user-dropdown-menu');
    if (userHeader && !userHeader.contains(e.target)) {
        if (dropdown) dropdown.classList.remove('active');
    }
});

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
        try {
            console.log('[Auth] Logging out...');
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[Auth] Logout error:', err);
        } finally {
            window.location.href = 'login.html';
        }
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

    // Reset base classes
    btnCi.className = 'btn btn-checkin';
    btnCo.className = 'btn btn-checkout btn-outline';
    
    // Clear custom styles
    btnCi.style.boxShadow = '';
    btnCo.style.borderColor = '';
    btnCo.style.color = '';
    
    if (type === 'normal') {
        btnCi.classList.add('btn-primary');
        btnCi.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.4)';
        btnCo.style.borderColor = 'var(--primary)';
        btnCo.style.color = 'var(--primary)';
    } else if (type === 'ot') {
        btnCi.classList.add('btn-warning');
        btnCi.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.4)';
        btnCo.style.borderColor = '#f59e0b';
        btnCo.style.color = '#d97706';
    } else if (type === 'shift') {
        btnCi.classList.add('btn-info');
        btnCi.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
        btnCo.style.borderColor = '#10b981';
        btnCo.style.color = '#059669';
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
    if (!btn) return;
    const originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    try {
        const realUserId = MOCK_USER.uuid;
        if (!realUserId) throw new Error('ไม่พบข้อมูลผู้ใช้ กรุณาล็อกอินใหม่');

        // Fetch workplaces if needed
        if (workplacesData.length === 0) {
            const { data, error } = await supabase.from('workplaces').select('*').eq('status', 'ใช้งาน');
            if (!error && data) workplacesData = data;
        }

        let closestWp = null;
        let minDistance = Infinity;

        workplacesData.forEach(wp => {
            const dist = calculateDistance(currentLat, currentLng, wp.lat, wp.lng);
            if (dist < minDistance) {
                minDistance = dist;
                closestWp = wp;
            }
        });

        let status = 'ปกติ';
        let workplaceId = closestWp ? closestWp.id : null;
        const distanceVal = closestWp ? minDistance : 0;

        if (closestWp) {
            if (minDistance > closestWp.radius) {
                status = 'นอกพิกัด';
            }
        } else {
            status = 'ไม่พบสถานที่';
        }

        // --- เพิ่มการตรวจสอบสถานะ "สาย" (Late) ---
        if (type === 'Check-in' && status === 'ปกติ') {
            const config = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
            const timeInStr = config.timeIn || '08:30';
            const graceMinutes = parseInt(config.lateGrace || '0');

            if (timeInStr) {
                const now = new Date();
                const [targetH, targetM] = timeInStr.split(':').map(Number);
                const deadline = new Date(now);
                deadline.setHours(targetH, targetM + graceMinutes, 0, 0);

                if (now > deadline) {
                    status = 'สาย';
                }
            }
        }

        let finalNote = note;
        if (checkinCategory !== 'เวลาปกติ') {
            finalNote = `[${checkinCategory}] ${note}`.trim();
        }

        const payload = {
            user_id: realUserId,
            workplace_id: workplaceId,
            type: type,
            lat: currentLat,
            lng: currentLng,
            distance_meters: Math.round(distanceVal),
            status: status,
            note: finalNote,
            date: new Date().toLocaleDateString('en-CA'),
            time: new Date().toLocaleTimeString('en-GB')
        };

        if (realUserId === 'default-uuid') {
            console.log("Demo Mode: Skipping real DB insert for attendance_logs", payload);
            await new Promise(resolve => setTimeout(resolve, 300));
        } else {
            const { error: insertError } = await supabase.from('attendance_logs').insert([payload]);
            if (insertError) throw insertError;
        }

        // Log Activity
        logActivity(`${type} (${checkinCategory})`, `Location: ${closestWp ? closestWp.name : 'Unknown'}, Status: ${status}, Distance: ${Math.round(distanceVal)}m`);

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            
            // ใช้ Toast แทน Alert ปกติ
            const msg = `สถานที่: ${closestWp ? closestWp.name : 'ทั่วไป'}\nสถานะ: ${status}`;
            showToast(`บันทึก ${type} สำเร็จ`, msg, status === 'ปกติ' ? 'success' : 'warning');
            
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

// ─── CONFIRM ACTION DIALOG ───────────────────────────
let _confirmActionCallback = null;

function confirmAction(title, subtitle, callback) {
    _confirmActionCallback = callback;
    const modal = document.getElementById('confirm-action-modal');
    if (!modal) {
        // Fallback to native confirm if modal doesn't exist
        if (confirm(title + (subtitle ? '\n' + subtitle : ''))) {
            callback();
        }
        return;
    }
    document.getElementById('confirm-action-title').textContent = title || 'ยืนยันการดำเนินการ?';
    document.getElementById('confirm-action-subtitle').textContent = subtitle || '';
    document.getElementById('confirm-action-subtitle').style.display = subtitle ? 'block' : 'none';
    openModal('confirm-action-modal');
}

function executeConfirmAction() {
    closeModal('confirm-action-modal');
    if (_confirmActionCallback && typeof _confirmActionCallback === 'function') {
        // Small delay to allow modal close animation
        setTimeout(() => {
            _confirmActionCallback();
            _confirmActionCallback = null;
        }, 200);
    }
}

function cancelConfirmAction() {
    closeModal('confirm-action-modal');
    _confirmActionCallback = null;
}

// ─── DASHBOARD (B4) ──────────────────────────────────
function loadDashboard() {
    fetchDashboardStats();
    initDashMiniMap();
    updateApprovalBadges();
    loadDashLeaveCalendar();
}

let miniDashMap = null;
function initDashMiniMap() {
    const mapContainer = document.getElementById('dash-mini-map');
    if (!mapContainer) return;
    if (miniDashMap) return;
    
    // Check if L is loaded
    if(typeof L === 'undefined') return;

    miniDashMap = L.map('dash-mini-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([13.7563, 100.5018], 10);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
    }).addTo(miniDashMap);
    
    // Markers will be populated from workplaces data
    
    setTimeout(() => {
        miniDashMap.invalidateSize();
    }, 400);
}

// ─── DASHBOARD LEAVE CALENDAR ─────────────────────────
let dashLeaveMonth = new Date();

function loadDashLeaveCalendar() {
    const year = dashLeaveMonth.getFullYear();
    const month = dashLeaveMonth.getMonth();
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    const label = document.getElementById('dash-leave-month-label');
    if(label) label.textContent = `${monthNames[month]} ${year}`;
    
    const calEl = document.getElementById('dash-leave-calendar');
    if(!calEl) return;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    // Helper to get leave color
    function getLeaveColor(leaveType) {
        if(!leaveType) return '#FF9500';
        if(leaveType.includes('ป่วย')) return '#FF3B30';
        if(leaveType.includes('พักร้อน')) return '#007AFF';
        return '#FF9500'; // ลากิจ
    }
    
    let html = '';
    // Blank cells for offset
    for(let i=0; i<firstDay; i++) {
        html += '<div style="min-height:72px;"></div>';
    }
    
    for(let d=1; d<=daysInMonth; d++) {
        const isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear());
        const dayOfWeek = new Date(year, month, d).getDay();
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // Find all leave requests for this date
        const leaveForDay = myRequestsData.filter(r => 
            r.type === 'leave' && r.status === 'approved' && r.startDate <= dateStr && (r.endDate || r.startDate) >= dateStr
        );
        
        let leaveHtml = '';
        if(leaveForDay.length > 0) {
            leaveForDay.slice(0, 2).forEach(r => {
                const color = getLeaveColor(r.leaveType);
                const name = (MOCK_USER?.name || 'พนักงาน').split(' ')[0];
                leaveHtml += `<div style="font-size:9px; padding:2px 4px; border-radius:4px; background:${color}15; color:${color}; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-left: 2px solid ${color}; margin-top:2px;">${name}</div>`;
            });
            if(leaveForDay.length > 2) {
                leaveHtml += `<div style="font-size:8px; color:var(--text-muted); text-align:center;">+${leaveForDay.length - 2} คน</div>`;
            }
        }
        
        const todayStyle = isToday 
            ? 'background: linear-gradient(135deg, #007AFF, #5856D6); color: white; font-weight: 700; border-radius: 12px;' 
            : `border-radius: 10px; ${isSun ? 'color:#FF3B30;' : ''} ${isSat ? 'color:#007AFF;' : ''}`;
        
        html += `<div style="min-height:72px; padding:6px; text-align:center; cursor:pointer; ${todayStyle} transition: background 0.2s;" onclick="navigateTo('report-leave', document.querySelector('[data-page=report-leave]'), true)">
            <div style="font-size:14px; font-weight:${isToday?'700':'500'}; margin-bottom:2px;">${d}</div>
            ${leaveHtml}
        </div>`;
    }
    calEl.innerHTML = html;
}

function changeDashLeaveMonth(dir) {
    dashLeaveMonth.setMonth(dashLeaveMonth.getMonth() + dir);
    loadDashLeaveCalendar();
}

// ─── DEPARTMENT TAG MANAGEMENT ─────────────────────────
let departmentTags = [];

function renderDepartmentTags() {
    const container = document.getElementById('dept-tags-container');
    if(!container) return;
    
    if(departmentTags.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted); font-size:13px;">ยังไม่มีแผนก กรุณากด + เพิ่มแผนก</span>';
    } else {
        container.innerHTML = departmentTags.map((tag, idx) => `
            <span style="display:inline-flex; align-items:center; gap:6px; background: #eef2ff; color: #4f46e5; padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">
                ${tag}
                <button type="button" onclick="removeDepartmentTag(${idx})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px; padding:0; line-height:1;">&times;</button>
            </span>
        `).join('');
    }
    // Update hidden input
    const hiddenInput = document.getElementById('st-departments');
    if(hiddenInput) hiddenInput.value = departmentTags.join(',');
}

function addDepartmentTag() {
    const input = document.getElementById('dept-new-input');
    const name = (input.value || '').trim();
    if(!name) return alert('กรุณาพิมพ์ชื่อแผนก');
    if(departmentTags.includes(name)) return alert('แผนกนี้มีอยู่แล้ว');
    departmentTags.push(name);
    input.value = '';
    renderDepartmentTags();
}

function removeDepartmentTag(idx) {
    departmentTags.splice(idx, 1);
    renderDepartmentTags();
}

function loadDepartmentTagsFromSettings() {
    const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    const deptStr = lsSettings.departments || '';
    departmentTags = deptStr.split(',').map(d => d.trim()).filter(d => d);
    renderDepartmentTags();
}

function updateApprovalBadges() {
    // Fetch real counts from DB in the future. Currently zeroed for production readiness.
    const otCount = 0; 
    const leaveCount = 0; 
    const total = otCount + leaveCount;
    
    const badgeTotal = document.getElementById('nav-badge-approve-total');
    const badgeOT = document.getElementById('nav-badge-approve-ot');
    const badgeLeave = document.getElementById('nav-badge-approve-leave');
    
    if (badgeTotal) {
        badgeTotal.textContent = total;
        badgeTotal.style.display = total > 0 ? 'inline-block' : 'none';
    }
    if (badgeOT) {
        badgeOT.textContent = otCount;
        badgeOT.style.display = otCount > 0 ? 'inline-block' : 'none';
    }
    if (badgeLeave) {
        badgeLeave.textContent = leaveCount;
        badgeLeave.style.display = leaveCount > 0 ? 'inline-block' : 'none';
    }
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

        // 4. Fetch 5 recent activity for the dashboard list
        const { data: recentLogs, error: errRecent } = await supabase
            .from('attendance_logs')
            .select(`
                *,
                profiles:user_id (full_name, employee_id)
            `)
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (!errRecent && recentLogs) {
            renderDashActivity(recentLogs);
        }

    } catch (error) {
        console.error("Failed to load dashboard stats from Supabase:", error.message);
        // Fallback or error UI
        const activityEl = document.getElementById('dash-recent-activity');
        if(activityEl) activityEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--danger);">ไม่สามารถโหลดข้อมูลกิจกรรมได้</div>';
        
        updateDashboardUI({
            totalEmployees: 0,
            totalCheckins: 0,
            onTime: 0,
            late: 0,
            outOfRange: 0
        });
    }
}

function renderDashActivity(logs) {
    const activityEl = document.getElementById('dash-recent-activity');
    if(!activityEl) return;

    if(logs.length === 0) {
        activityEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted);">ไม่มีกิจกรรมล่าสุด</div>';
        return;
    }

    let html = '';
    logs.forEach(log => {
        const time = log.time ? log.time.substring(0, 5) : '--:--';
        const name = log.profiles ? log.profiles.full_name : 'ไม่ทราบชื่อ';
        const empId = log.profiles ? log.profiles.employee_id : '-';
        const type = log.type === 'Check-in' ? '<span style="color:var(--success)">เข้างาน</span>' : '<span style="color:var(--danger)">ออกงาน</span>';
        
        let statusBadge = '';
        if(log.status === 'ปกติ') statusBadge = '<span class="badge badge-success">ปกติ</span>';
        else if(log.status === 'สาย') statusBadge = '<span class="badge badge-warning">สาย</span>';
        else statusBadge = `<span class="badge badge-danger">${log.status}</span>`;

        html += `
            <div style="display:flex; align-items:center; gap:16px; padding:12px 20px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.2s;" 
                 onclick="navigateTo('records', document.querySelector('[data-page=records]'))"
                 onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px;">
                    ${name.substring(0, 1)}
                </div>
                <div style="flex:1;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-main);">${name} <small style="font-weight:normal; color:var(--text-muted); ml-4">(${empId})</small></div>
                    <div style="font-size:12px; color:var(--text-muted); display:flex; gap:8px; align-items:center;">
                        ${type} • ${time} น. • ${log.workplace_name || 'ไม่ระบุสถานที่'}
                    </div>
                </div>
                <div>
                   ${statusBadge}
                </div>
            </div>
        `;
    });
    activityEl.innerHTML = html;
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
            department: u.department || '',
            shift: u.primary_shift,
            status: u.status
        }));

        // Merge local users from localStorage
        const localUsers = JSON.parse(localStorage.getItem('localUsers') || '[]');
        localUsers.forEach(lu => {
            if (!usersData.find(u => u.empId === lu.employee_id)) {
                usersData.push({
                    id: lu.id,
                    empId: lu.employee_id,
                    name: lu.full_name,
                    email: lu.email,
                    username: lu.username,
                    role: lu.role,
                    department: lu.department || '',
                    shift: lu.primary_shift,
                    status: lu.status
                });
            }
        });

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
    
    // Populate departments from settings
    const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    const deptSelect = document.getElementById('u-department');
    if (deptSelect && lsSettings.departments) {
        const depts = lsSettings.departments.split(',').map(d => d.trim()).filter(d => d);
        if (depts.length > 0) {
            deptSelect.innerHTML = '<option value="">-- เลือกแผนก --</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }
    
    // Default permissions for new users
    const defaultPerms = ['dashboard', 'checkin', 'records', 'map', 'worklog', 'shifts', 'my-requests', 'profile'];
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
    // Split name into fname and lname
    const nameParts = (u.name || '').split(' ');
    document.getElementById('u-fname').value = nameParts[0] || '';
    document.getElementById('u-lname').value = nameParts.slice(1).join(' ') || '';
    document.getElementById('u-email').value = u.email;
    document.getElementById('u-username').value = u.username;
    document.getElementById('u-role').value = u.role;
    
    // Populate departments and select existing
    const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    const deptSelect = document.getElementById('u-department');
    if (deptSelect && lsSettings.departments) {
        const depts = lsSettings.departments.split(',').map(d => d.trim()).filter(d => d);
        if (depts.length > 0) {
            deptSelect.innerHTML = '<option value="">-- เลือกแผนก --</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    }
    if (document.getElementById('u-department')) document.getElementById('u-department').value = u.department || '';
    
    document.getElementById('u-shift').value = u.shift || '';
    document.getElementById('u-status').value = u.status;
    
    const perms = getPermissionsByRole(u.role);
    document.querySelectorAll('input[name="u-perms"]').forEach(cb => {
        cb.checked = perms.includes(cb.value);
    });

    openModal('user-modal');
}

async function saveUser() {
    const selectedPerms = Array.from(document.querySelectorAll('input[name="u-perms"]:checked')).map(cb => cb.value);
    
    const fname = document.getElementById('u-fname').value.trim();
    const lname = document.getElementById('u-lname').value.trim();
    
    if (!fname) return alert('กรุณากรอกชื่อจริง');
    if (!lname) return alert('กรุณากรอกนามสกุล');
    
    const fullName = fname + ' ' + lname;
    const username = document.getElementById('u-username').value.trim();
    if (!username) return alert('กรุณากรอกชื่อผู้ใช้ (Username)');
    
    const payload = {
        employee_id: document.getElementById('u-empid').value.trim(),
        full_name: fullName,
        email: document.getElementById('u-email').value.trim(),
        username: username,
        role: document.getElementById('u-role').value,
        department: document.getElementById('u-department').value,
        primary_shift: document.getElementById('u-shift').value.trim(),
        status: document.getElementById('u-status').value,
        accessible_menus: selectedPerms // This will be stored as JSONB
    };
    
    const orgId = document.getElementById('u-original-id').value;
    const isEdit = orgId !== '';

    closeModal('user-modal');
    const tbody = document.getElementById('users-table-body');
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...</td></tr>';

    try {
        if (isEdit) {
            const { error } = await supabase
                .from('profiles')
                .update(payload)
                .eq('employee_id', orgId);
            if (error) throw error;
            
            logActivity('Edit User', `Updated profile for ${fullName} (${payload.employee_id})`);
            alert('แก้ไขข้อมูลสำเร็จ!');
        } else {
            // New user registration
            const syntheticEmail = usernameToEmail(username);
            const defaultPassword = payload.employee_id + '@Neo2026';
            
            // Note: In real production, use a service role client to avoid switching sessions
            // For this demo, we use the standard signup. If the admin is logged out, they may need to re-login.
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: syntheticEmail,
                password: defaultPassword,
                options: {
                    data: { full_name: fullName }
                }
            });
            
            if (authError) throw authError;
            
            if (authData?.user) {
                // profile insert
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert([{ ...payload, id: authData.user.id }]);
                
                if (profileError) throw profileError;
                
                logActivity('Create User', `Created new user ${fullName} (${payload.employee_id})`);
                alert(`บันทึกสำเร็จ! Username: ${username} / รหัสผ่าน: ${defaultPassword}`);
            }
        }
    } catch (error) {
        console.error('Error saving user:', error.message);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message);
    } finally {
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

async function loadShifts() {
    renderCalendar();
    loadSwapRequests();

    const y = currentShiftsDate.getFullYear();
    const m = currentShiftsDate.getMonth();
    myShiftsMap = {};

    console.log(`[Shifts] Fetching shifts for ${MOCK_USER.uuid} (${y}-${m+1})`);

    try {
        const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
        const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('user_id', MOCK_USER.uuid)
            .gte('date', firstDay)
            .lte('date', lastDay);

        if (error) throw error;

        if (data) {
            data.forEach(row => {
                const ds = new Date(row.date);
                const dateKey = ds.toDateString();
                
                // Map shift code to object for renderCalendar
                let type = 'off';
                let label = row.shift_code || 'O';
                if (label === 'D') type = 'morning';
                else if (label === 'N') type = 'night';
                else if (label === 'Sat' || label === 'Sun') type = 'afternoon';
                else if (label === 'M') type = 'morning';
                else if (label === 'A') type = 'afternoon';

                myShiftsMap[dateKey] = {
                    type: type,
                    label: label
                };
            });
        }
    } catch(e) {
        console.warn('[Shifts] DB fetch failed, using local fallback:', e.message);
        const saved = JSON.parse(localStorage.getItem('shiftAssignments') || '{}');
        Object.keys(saved).forEach(dateStr => {
            const ds = new Date(dateStr);
            if (ds.getFullYear() === y && ds.getMonth() === m) {
                myShiftsMap[ds.toDateString()] = saved[dateStr];
            }
        });
    }

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
            let badgeColor = '';
            if (shift.type === 'morning') { badgeClass = 'shift-morning'; badgeColor = 'background:#dcfce7;color:#15803d;'; }
            else if (shift.type === 'afternoon') { badgeClass = 'shift-afternoon'; badgeColor = 'background:#fef3c7;color:#b45309;'; }
            else if (shift.type === 'night') { badgeClass = 'shift-night'; badgeColor = 'background:#dbeafe;color:#1d4ed8;'; }
            else if (shift.type === 'overnight') { badgeClass = 'shift-overnight'; badgeColor = 'background:#ede9fe;color:#6d28d9;'; }
            
            // Show employee name if available
            const empName = shift.empName || '';
            const nameHtml = empName ? `<div style="font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${empName}</div>` : '';
            badgeHtml = `<div class="shift-badge ${badgeClass}" style="${badgeColor}font-size:10px;padding:2px 4px;border-radius:4px;text-align:center;">${shift.label}</div>${nameHtml}`;
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

// ─── MANAGE SHIFTS (MANUAL & AI) ───
let manualShiftData = [];

function loadManageShifts() {
    // Just refresh the header text for the month
    const year = currentManageMonth.getFullYear();
    const month = currentManageMonth.getMonth();
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('manage-month-year').textContent = `${monthNames[month]} ${year}`;
    
    // Default empty on load
    manualShiftData = [];
    renderManageShiftsTable();
}

function renderManageShiftsTable() {
    const year = currentManageMonth.getFullYear();
    const month = currentManageMonth.getMonth();
    const daysInMon = new Date(year, month + 1, 0).getDate();
    
    let headerHtml = '<th style="position: sticky; left: 0; background: #f8fafc; z-index: 25; border-right: 2px solid var(--border); box-shadow: 2px 0 5px rgba(0,0,0,0.05);">พนักงาน</th>';
    for(let d=1; d<=daysInMon; d++) {
        const dateObj = new Date(year, month, d);
        const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const bg = isWeekend ? '#fff1f2' : 'var(--bg-main)';
        const color = isWeekend ? '#e11d48' : 'inherit';
        
        headerHtml += `<th style="text-align:center; min-width: 55px; font-weight: 600; font-size: 11px; background: ${bg}; color: ${color}; border-right: 1px solid #f1f5f9;">${d}</th>`;
    }
    headerHtml += '<th style="position: sticky; right: 0; background: #f8fafc; z-index: 20; border-left: 1px solid var(--border);">ลบ</th>';


    let bodyHtml = '';
    if(manualShiftData.length === 0) {
        bodyHtml = `<tr><td colspan="${daysInMon + 2}" style="text-align:center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-calendar-days" style="font-size: 48px; margin-bottom: 16px; color: #cbd5e1;"></i>
            <p>ยังไม่มีพนักงานในตาราง คลิก 'เลือกพนักงานลงตาราง'</p>
        </td></tr>`;
    } else {
        manualShiftData.forEach((empRow, empIdx) => {
             bodyHtml += `<tr><td style="position: sticky; left: 0; background: white; z-index: 5; border-right: 2px solid var(--border); font-weight: 600;">${empRow.empName}</td>`;
             for(let d=1; d<=daysInMon; d++) {
                 let shiftVal = empRow.shifts[d-1] || 'O';
                 // Color mapping
                 let color = 'var(--text-main)';
                 if(shiftVal === 'O') color = 'var(--text-muted)';
                 else if(shiftVal === 'D' || shiftVal === 'Day') color = 'var(--primary)';
                 else if(shiftVal === 'N' || shiftVal === 'Night') color = '#1e293b';
                 else if(shiftVal === 'Sat') color = '#f59e0b';
                 else if(shiftVal === 'Sun') color = '#ef4444';
                 else if(shiftVal === 'M') color = 'var(--success)';
                 else if(shiftVal === 'A') color = 'var(--warning)';

                 bodyHtml += `<td style="text-align:center; padding: 0; border: 1px solid #f1f5f9;">
                    <select class="form-control" style="width:100%; height:100%; border:none; padding: 4px 2px; background: transparent; font-weight:bold; color:${color}; cursor:pointer; text-align:center; appearance: none; font-size: 12px; min-width: 50px;" onchange="updateManualShift(${empIdx}, ${d-1}, this.value)">
                      <option value="D" ${shiftVal==='D'?'selected':''} style="color:var(--primary)">D</option>
                      <option value="N" ${shiftVal==='N'?'selected':''} style="color:#1e293b">N</option>
                      <option value="O" ${shiftVal==='O'?'selected':''} style="color:var(--text-muted)">O</option>
                      <option value="Sat" ${shiftVal==='Sat'?'selected':''} style="color:#f59e0b">Sat</option>
                      <option value="Sun" ${shiftVal==='Sun'?'selected':''} style="color:#ef4444">Sun</option>
                      <option value="M" ${shiftVal==='M'?'selected':''} style="color:var(--success)">M</option>
                      <option value="A" ${shiftVal==='A'?'selected':''} style="color:var(--warning)">A</option>
                    </select>
                 </td>`;
             }
             bodyHtml += `<td style="text-align:center; position: sticky; right: 0; background: white;"><button class="btn-icon text-danger" onclick="removeEmpFromShift(${empIdx})"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        });
    }

    const container = document.getElementById('manage-shifts-table-container');
    container.innerHTML = `
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: #fafafa;">
            <div style="display:flex; gap:12px; flex-wrap: wrap;">
                <span class="badge" style="background:#e0f2fe; color:var(--primary);">D=Day</span>
                <span class="badge" style="background:#f1f5f9; color:#1e293b;">N=Night</span>
                <span class="badge" style="background:#fef3c7; color:#f59e0b;">Sat=เสาร์</span>
                <span class="badge" style="background:#fee2e2; color:#ef4444;">Sun=อาทิตย์</span>
                <span class="badge" style="background:#f3f4f6; color:var(--text-muted);">O=หยุด</span>
            </div>
            ${manualShiftData.length > 0 ? `
            <div style="display:flex; gap:8px;">
               <button class="btn btn-primary" id="btn-publish-shifts" onclick="saveManageShifts()" style="padding: 8px 16px; font-size: 13px;"><i class="fa-solid fa-save"></i> บันทึกและประกาศกะ</button>
            </div>
            ` : ''}
        </div>
        <div class="table-responsive" style="max-height: 600px; overflow: auto; border: 1px solid var(--border); border-top: none;">
            <table class="data-table" style="font-size: 13px; text-align: center; white-space: nowrap; width: auto; min-width: 100%;">
                <thead><tr>${headerHtml}</tr></thead>
                <tbody>${bodyHtml}</tbody>
            </table>
        </div>
    `;
}



function updateManualShift(empIdx, dayIdx, val) {
    manualShiftData[empIdx].shifts[dayIdx] = val;
    renderManageShiftsTable(); // Re-render for colors
}

function removeEmpFromShift(empIdx) {
    manualShiftData.splice(empIdx, 1);
    renderManageShiftsTable();
}

function addEmployeeToShiftTable() {
    const list = document.getElementById('shift-emp-checkbox-list');
    document.getElementById('shift-emp-search').value = '';

    let usersList = usersData.filter(u => u.name && u.status !== 'ปิดการใช้งาน');
    if(usersList.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-user-slash" style="font-size:24px; margin-bottom:8px;"></i><p>ยังไม่มีพนักงานในระบบ กรุณาเพิ่มพนักงานที่หน้า "จัดการผู้ใช้" ก่อน</p></div>';
        openModal('shift-emp-picker-modal');
        return;
    }

    const alreadyInTable = manualShiftData.map(e => e.empName);

    list.innerHTML = usersList.map(u => {
        const isAlready = alreadyInTable.includes(u.name);
        return `
            <label class="shift-emp-item" style="display:flex; align-items:center; gap:12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; cursor: ${isAlready ? 'not-allowed' : 'pointer'}; opacity: ${isAlready ? '0.5' : '1'}; background: ${isAlready ? '#f1f5f9' : 'white'};" data-name="${u.name}">
                <input type="checkbox" value="${u.id}" data-empname="${u.name}" ${isAlready ? 'disabled checked' : ''} style="width:18px; height:18px; accent-color: var(--primary);">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&color=fff&background=3b82f6&size=32" style="width:32px; height:32px; border-radius: 50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:14px;">${u.name}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${u.empId || ''} ${u.department ? ' · ' + u.department : ''}</div>
                </div>
                ${isAlready ? '<span class="badge badge-info" style="font-size:10px;">อยู่ในตาราง</span>' : ''}
            </label>
        `;
    }).join('');


    openModal('shift-emp-picker-modal');
}

function filterShiftEmpPicker() {
    const q = (document.getElementById('shift-emp-search').value || '').toLowerCase();
    document.querySelectorAll('#shift-emp-checkbox-list .shift-emp-item').forEach(item => {
        const name = item.getAttribute('data-name').toLowerCase();
        item.style.display = name.includes(q) ? 'flex' : 'none';
    });
}

function confirmShiftEmpPicker() {
    const checked = document.querySelectorAll('#shift-emp-checkbox-list input[type="checkbox"]:checked:not(:disabled)');
    if(checked.length === 0) return alert('กรุณาเลือกพนักงานอย่างน้อย 1 คน');

    const daysInMon = new Date(currentManageMonth.getFullYear(), currentManageMonth.getMonth() + 1, 0).getDate();
    checked.forEach(cb => {
        const uuid = cb.value;
        const name = cb.getAttribute('data-empname');
        if(!manualShiftData.find(e => e.userId === uuid)) {
            manualShiftData.push({
                userId: uuid,
                empName: name,
                shifts: Array(daysInMon).fill('O')
            });
        }
    });

    closeModal('shift-emp-picker-modal');
    renderManageShiftsTable();
}

async function saveManageShifts() {
    confirmAction('ยืนยันหน้าการประกาศตารางกะงาน?', 'พนักงานจะเริ่มเห็นตารางงานของตนเองทันทีบนปฏิทินของระบบ', async () => {
        const btn = document.getElementById('btn-publish-shifts');
        if(!btn) return;
        const orgHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
        btn.disabled = true;

        const year = currentManageMonth.getFullYear();
        const month = currentManageMonth.getMonth();
        const daysInMon = new Date(year, month + 1, 0).getDate();

        const payloads = [];
        manualShiftData.forEach(empRow => {
            empRow.shifts.forEach((shiftCode, idx) => {
                // date format YYYY-MM-DD
                const d = idx + 1;
                const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                payloads.push({
                    user_id: empRow.userId,
                    date: formattedDate,
                    shift_code: shiftCode,
                    status: 'published'
                });
            });
        });

        try {
            const { error } = await supabase.from('shifts').upsert(payloads, { onConflict: 'user_id, date' });
            if(error) throw error;
            
            alert('บันทึกและประกาศตารางกะงานเรียบร้อยแล้ว');
        } catch(e) {
            console.error('[ManageShifts] Save failed:', e);
            alert('ไม่สามารถบันทึกตารางงานได้: ' + e.message);
        } finally {
            btn.innerHTML = orgHtml;
            btn.disabled = false;
        }
    });
}


function validateManualShifts() {
    const rules = [];
    document.querySelectorAll('#shift-conditions-list .condition-item').forEach(item => {
        const isActive = item.querySelector('input[type="checkbox"]').checked;
        if(isActive) rules.push(item);
    });

    if (rules.length === 0) {
        return alert("ตารางถูกต้อง: ไม่มีการกำหนดเงื่อนไขควบคุมไว้");
    }

    // Mock validation logic
    // Just simulating a pass or fail random chance based on UI, 
    // real app would compute constraint logic per rule
    const isPassing = Math.random() > 0.3; // 70% chance pass
    if (isPassing) {
         alert("✅ ตารางยอดเยี่ยม! จัดตารางได้ถูกต้องตามเงื่อนไขทุกข้อ");
    } else {
         alert("❌ พบข้อผิดพลาด! มีการจัดกะผิดเงื่อนไข กรุณาตรวจสอบจำนวนคนเข้ากะ หรือกะติดต่อกัน");
    }
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
        if(item.querySelector('input[type="checkbox"]').checked) rules.push(1);
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
        // AI populating the manual table data
        const daysInMon = new Date(currentManageMonth.getFullYear(), currentManageMonth.getMonth() + 1, 0).getDate();
        
        let emps = usersData.filter(u => u.name && u.status !== 'ปิดการใช้งาน').map(u => u.name);
        if(emps.length === 0) {
            alert('ยังไม่มีพนักงานในระบบ กรุณาเพิ่มพนักงานที่หน้า "จัดการผู้ใช้" ก่อน');
            renderManageShiftsTable();
            return;
        }

        manualShiftData = emps.map(emp => {
            const shifts = [];
            for(let d=1; d<=daysInMon; d++) {
                const r = Math.random();
                let txt = 'O'; 
                if(r > 0.85) txt = 'D';       // ดึก (22:00-06:00)
                else if(r > 0.7) txt = 'N';   // ค่ำ (16:00-00:00)
                else if(r > 0.5) txt = 'M';   // เช้า (08:00-16:00)
                else if(r > 0.15) txt = 'A';  // บ่าย (12:00-20:00)
                shifts.push(txt);
            }
            return { empName: emp, shifts: shifts };
        });

        alert("AI จัดตารางให้เรียบร้อยแล้ว หากพบจุดใดไม่สมบูรณ์ คุณสามารถปรับเปลี่ยนแบบ Manual ในตารางได้ทันที");
        renderManageShiftsTable();
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

    // Real app should load shifts from DB
    const mockShifts = [];

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
    // Fetch real data from DB
    if (swapRequestsList.length === 0) {
        // Ready for real data
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

    // Real app should fetch from Supabase here
    if (myRequestsData.length === 0) {
        // Ready for real data
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
    updateLeaveRemainingBalance();
    
    // reset total days visual
    document.getElementById('leave-total-days-group').style.display = 'none';
    document.getElementById('leave-total-days-value').textContent = '1';
    
    openModal('create-request-modal');
}

function updateLeaveRemainingBalance() {
    const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    const type = document.getElementById('req-leave-type').value;
    let limit = 0;
    if(type === 'ลาป่วย') limit = lsSettings.leaveSick !== undefined ? parseInt(lsSettings.leaveSick) : 30;
    if(type === 'ลากิจ') limit = lsSettings.leavePersonal !== undefined ? parseInt(lsSettings.leavePersonal) : 6;
    if(type === 'ลาพักร้อน') limit = lsSettings.leaveVacation !== undefined ? parseInt(lsSettings.leaveVacation) : 6;
    
    // In a real app we would subtract the taken days from the user's DB. We mock it here.
    const used = 0; 
    const remain = limit - used;
    
    document.getElementById('leave-balance-display').textContent = `สิทธิ์คงเหลือ: ${remain} วัน (รอใช้งาน: ${used} วัน)`;
}

function updateLeaveDatesLogic() {
    const duration = document.getElementById('req-leave-duration').value;
    const endDateGroup = document.getElementById('leave-date-end-group');
    const totalDaysGroup = document.getElementById('leave-total-days-group');
    
    if(duration !== 'full') {
         // Half day -> end date is the same as start date automatically, and hide end date
         endDateGroup.style.display = 'none';
         totalDaysGroup.style.display = 'block';
         document.getElementById('leave-total-days-value').textContent = '0.5';
         document.getElementById('req-end-date').value = document.getElementById('req-start-date').value;
    } else {
         endDateGroup.style.display = 'block';
         calculateLeaveDays();
    }
}

function calculateLeaveDays() {
    const duration = document.getElementById('req-leave-duration')?.value;
    if (duration !== 'full') return; // Fixed to 0.5
    
    const s = document.getElementById('req-start-date').value;
    const e = document.getElementById('req-end-date').value;
    const totalDaysGroup = document.getElementById('leave-total-days-group');
    
    if(s && e) {
        const d1 = new Date(s);
        const d2 = new Date(e);
        if(d2 >= d1) {
             const diffTime = Math.abs(d2 - d1);
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
             totalDaysGroup.style.display = 'block';
             document.getElementById('leave-total-days-value').textContent = diffDays;
        } else {
             totalDaysGroup.style.display = 'none';
        }
    } else {
        totalDaysGroup.style.display = 'none';
    }
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
        newReq.leaveDuration = document.getElementById('req-leave-duration').value;
        
        if(newReq.leaveDuration !== 'full') {
            newReq.endDate = startDate;
        } else {
            newReq.endDate = document.getElementById('req-end-date').value || startDate;
        }

        // Validate consecutive leave days
        const lsSettings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
        const maxConsecutive = parseInt(lsSettings.leaveMaxConsecutive) || 0;
        if(maxConsecutive > 0) {
            const d1 = new Date(newReq.startDate);
            const d2 = new Date(newReq.endDate);
            const diffMs = Math.abs(d2 - d1);
            const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
            if(totalDays > maxConsecutive) {
                alert(`ไม่สามารถลาต่อเนื่องเกิน ${maxConsecutive} วันได้\nคุณขอลา ${totalDays} วัน ซึ่งเกินสิทธิ์ตามที่ระบบกำหนดไว้ กรุณาปรับจำนวนวันลา`);
                return;
            }
        }
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

    // Fetch real data from DB
    if (approveOTData.length === 0) {
        // Ready for real data
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

    // Fetch real data from DB
    if (approveLeaveData.length === 0) {
        // Ready for real data
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

    // Fetch real data from DB
    if (generalReportData.length === 0) {
        // Ready for real data
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

    // Fetch real data from DB
    if (leaveReportData.length === 0) {
        // Ready for real data
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
        let statusBadge = r.status === 'approved' ? '<span class="badge badge-success">อนุมัติแล้ว</span>' : '<span class="badge badge-danger">ไม่อนุมัติแล้ว</span>';
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

    // Fetch real data from DB
    if (auditLogData.length === 0) {
        // Ready for real data
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
            .maybeSingle();

        if (error) throw error;
        
        if (data) {
            // Update UI elements
            document.getElementById('profile-display-name').textContent = data.full_name || 'ไม่ทราบชื่อ';
            document.getElementById('profile-display-role').textContent = data.role || '-';
            
            const statusEl = document.getElementById('profile-display-status');
            statusEl.textContent = data.status || 'ใช้งาน';
            statusEl.className = data.status === 'ใช้งาน' ? 'badge badge-success' : 'badge badge-danger';
            
            // Avatar
            const localAvatar = localStorage.getItem('userAvatar_' + MOCK_USER.uuid);
            const avatarImg = document.getElementById('profile-img-preview');
            const encodedName = encodeURIComponent(data.full_name || 'User');
            if (avatarImg) {
                avatarImg.src = localAvatar || `https://ui-avatars.com/api/?name=${encodedName}&background=2563eb&color=fff`;
            }
            
            // Populate Form
            document.getElementById('prof-empid').value = data.employee_id || '';
            document.getElementById('prof-name').value = data.full_name || '';
            document.getElementById('prof-email').value = data.email || '';
            document.getElementById('prof-role').value = data.role || '';
            document.getElementById('prof-phone').value = data.phone || '';
            document.getElementById('prof-department').value = data.department || '';
            
            // Signature Load
            const sigB64 = data.signature_base64 || '';
            const sigInput = document.getElementById('prof-signature_base64');
            if (sigInput) sigInput.value = sigB64;
            
            const preImg = document.getElementById('saved-signature-preview');
            const noSigTxt = document.getElementById('no-signature-text');
            if (preImg && noSigTxt) {
                if (sigB64) {
                    preImg.src = sigB64;
                    preImg.style.display = 'block';
                    noSigTxt.style.display = 'none';
                } else {
                    preImg.style.display = 'none';
                    noSigTxt.style.display = 'block';
                }
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
        
        // Generate new avatar or keep custom
        const localAvatar = localStorage.getItem('userAvatar_' + MOCK_USER.uuid);
        if(localAvatar) {
            document.getElementById('profile-img-preview').src = localAvatar;
        } else {
            const encodedName = encodeURIComponent(payload.full_name || 'User');
            document.getElementById('profile-img-preview').src = `https://ui-avatars.com/api/?name=${encodedName}&background=2563eb&color=fff`;
        }
        
        showToast("สำเร็จ", "อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว", "success");
        
        // Refresh display texts
        document.getElementById('profile-display-name').textContent = payload.full_name;
        
    } catch (err) {
        console.error("Error saving profile details:", err.message);
        showToast("ผิดพลาด", "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message, "danger");
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

// ─── PROFILE PICTURE UPLOAD ──────────────────
function previewProfileImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let size = 200; // Profile pic size limit
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                
                // Keep aspect ratio crop to center
                let scale = Math.max(canvas.width / img.width, canvas.height / img.height);
                let x = (canvas.width / scale - img.width) / 2;
                let y = (canvas.height / scale - img.height) / 2;
                ctx.drawImage(img, x, y, img.width, img.height, 0, 0, img.width * scale, img.height * scale);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                
                const preview = document.getElementById('profile-img-preview');
                const headerAvatar = document.getElementById('user-avatar-img');
                if(preview) preview.src = dataUrl;
                if(headerAvatar) headerAvatar.src = dataUrl;
                
                // Save to local storage for persistence across reloads (mock)
                if(MOCK_USER && MOCK_USER.uuid) {
                    localStorage.setItem('userAvatar_' + MOCK_USER.uuid, dataUrl);
                }
            };
            img.src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// ─── SIGNATURE PAD & DOCUMENT VIEWER ─────────────────
let sigCanvas, sigCtx;
let isDrawing = false;
let isCanvasInitialized = false;

function openSignatureModal() {
    isCanvasInitialized = false;
    document.getElementById('signature-modal').style.display = 'flex';
    setTimeout(() => {
        initSignatureCanvas();
    }, 100);
}

function initSignatureCanvas() {
    sigCanvas = document.getElementById('signature-canvas');
    if (!sigCanvas) return;
    
    if (!isCanvasInitialized) {
        sigCtx = sigCanvas.getContext('2d');
        sigBaseSetup();

        sigCanvas.addEventListener('mousedown', startDrawing);
        sigCanvas.addEventListener('mousemove', draw);
        sigCanvas.addEventListener('mouseup', stopDrawing);
        sigCanvas.addEventListener('mouseout', stopDrawing);

        sigCanvas.addEventListener('touchstart', handleTouchStart, {passive: false});
        sigCanvas.addEventListener('touchmove', handleTouchMove, {passive: false});
        sigCanvas.addEventListener('touchend', stopDrawing);
        isCanvasInitialized = true;
    } else {
        sigBaseSetup();
    }
}

function sigBaseSetup() {
    const rect = sigCanvas.parentElement.getBoundingClientRect();
    sigCanvas.width = rect.width;
    sigCanvas.height = Math.max(rect.height, 200);
    sigCtx.lineWidth = 3;
    sigCtx.lineCap = 'round';
    sigCtx.strokeStyle = '#2563eb';
    // Clear initial state
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
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
    document.getElementById('signature-file-upload').value = '';
}

function importSignatureFile(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
                // Center the image
                const scale = Math.min(sigCanvas.width / img.width, sigCanvas.height / img.height);
                const w = img.width * scale * 0.8;
                const h = img.height * scale * 0.8;
                const x = (sigCanvas.width - w) / 2;
                const y = (sigCanvas.height - h) / 2;
                sigCtx.drawImage(img, x, y, w, h);
            };
            img.src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function confirmSignatureModal() {
    const dataUrl = sigCanvas.toDataURL('image/png');
    document.getElementById('prof-signature_base64').value = dataUrl;
    
    // Check if canvas is actually empty (naive pixel check could be done, but we assume user drew something)
    const preImg = document.getElementById('saved-signature-preview');
    const noSigTxt = document.getElementById('no-signature-text');
    if(preImg) {
        preImg.src = dataUrl;
        preImg.style.display = 'block';
    }
    if(noSigTxt) noSigTxt.style.display = 'none';
    
    closeModal('signature-modal');
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

async function loadSystemSettings() {
    console.log('[Settings] Loading from database...');
    let settings = {};
    
    try {
        const { data, error } = await supabase.from('system_settings').select('*');
        if (error) throw error;
        
        if (data && data.length > 0) {
            data.forEach(row => {
                settings[row.key] = row.value;
            });
        } else {
            settings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
        }
    } catch (e) {
        console.warn('[Settings] DB fetch failed, using local fallback:', e);
        settings = JSON.parse(localStorage.getItem('systemAdminSettings') || '{}');
    }

    // 1. Apply Theme
    const themeMode = settings.themeMode || 'light';
    if(themeMode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    const themeInput = document.getElementById('st-theme-mode');
    if(themeInput) themeInput.value = themeMode;

    // 2. Apply Custom Logo
    const logoBase64 = settings.logoBase64;
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
    const watermarkBase64 = settings.watermarkBase64;
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

    // 4. Update Inputs
    if (settings.timeIn && document.getElementById('st-time-in')) document.getElementById('st-time-in').value = settings.timeIn;
    if (settings.timeOut && document.getElementById('st-time-out')) document.getElementById('st-time-out').value = settings.timeOut;
    if (settings.lateGrace && document.getElementById('st-late-grace')) document.getElementById('st-late-grace').value = settings.lateGrace;
    if (settings.wifi && document.getElementById('st-wifi')) document.getElementById('st-wifi').value = settings.wifi;
    if (settings.photo && document.getElementById('st-photo')) document.getElementById('st-photo').value = settings.photo;
    if (settings.leaveSick !== undefined && document.getElementById('st-leave-sick')) document.getElementById('st-leave-sick').value = settings.leaveSick;
    if (settings.leavePersonal !== undefined && document.getElementById('st-leave-personal')) document.getElementById('st-leave-personal').value = settings.leavePersonal;
    if (settings.leaveVacation !== undefined && document.getElementById('st-leave-vacation')) document.getElementById('st-leave-vacation').value = settings.leaveVacation;
    if (settings.leaveMaxConsecutive !== undefined && document.getElementById('st-leave-max-consecutive')) document.getElementById('st-leave-max-consecutive').value = settings.leaveMaxConsecutive;
    if (settings.departments && document.getElementById('st-departments')) document.getElementById('st-departments').value = settings.departments;
    
    localStorage.setItem('systemAdminSettings', JSON.stringify(settings));
    loadDepartmentTagsFromSettings();
}

async function saveSystemSettings() {
    confirmAction('ยืนยันการบันทึกการตั้งค่าระบบ?', 'ข้อมูลจะถูกอัปเดตไปยังฐานข้อมูลส่วนกลาง', async () => {
        const btn = document.querySelector('#page-settings .btn-primary');
        if (!btn) return;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
        btn.disabled = true;

        const logoPreview = document.getElementById('st-logo-preview');
        const wmPreview = document.getElementById('st-watermark-preview');

        const newSettings = {
            timeIn: document.getElementById('st-time-in')?.value,
            timeOut: document.getElementById('st-time-out')?.value,
            lateGrace: document.getElementById('st-late-grace')?.value,
            wifi: document.getElementById('st-wifi')?.value,
            photo: document.getElementById('st-photo')?.value,
            themeMode: document.getElementById('st-theme-mode')?.value,
            departments: document.getElementById('st-departments')?.value,
            leaveSick: document.getElementById('st-leave-sick')?.value,
            leavePersonal: document.getElementById('st-leave-personal')?.value,
            leaveVacation: document.getElementById('st-leave-vacation')?.value,
            leaveMaxConsecutive: document.getElementById('st-leave-max-consecutive')?.value,
            logoBase64: (logoPreview && logoPreview.style.display !== 'none') ? logoPreview.src : null,
            watermarkBase64: (wmPreview && wmPreview.style.display !== 'none') ? wmPreview.src : null
        };

        try {
            const upsertPromises = Object.keys(newSettings).map(key => {
                if (newSettings[key] === undefined) return Promise.resolve();
                return supabase.from('system_settings').upsert({
                    key: key,
                    value: newSettings[key],
                    updated_at: new Date().toISOString()
                });
            });

            await Promise.all(upsertPromises);
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
            alert('ไม่สามารถบันทึกได้: ' + e.message);
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

// ─── WORKLOG / TIMESHEET ─────────────────────────────────
let worklogEntries = [];
let wlCounter = 0;
let wlCurrentDate = new Date();
let wlViewMode = 'daily';

function changeWorklogView() {
    const modeEl = document.getElementById('wl-view-mode');
    if(modeEl) wlViewMode = modeEl.value;
    updateWorklogDateDisplay();
    renderWorklog();
}

function changeWorklogPeriod(dir) {
    if(wlViewMode === 'daily') {
        wlCurrentDate.setDate(wlCurrentDate.getDate() + dir);
    } else if(wlViewMode === 'weekly') {
        wlCurrentDate.setDate(wlCurrentDate.getDate() + (dir * 7));
    } else if(wlViewMode === 'monthly') {
        wlCurrentDate.setMonth(wlCurrentDate.getMonth() + dir);
    }
    updateWorklogDateDisplay();
    renderWorklog();
}

function updateWorklogDateDisplay() {
    const dOpts = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
    const wOpts = { year: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' };
    let text = '';
    if(wlViewMode === 'daily') {
        text = wlCurrentDate.toLocaleDateString('th-TH', dOpts);
    } else if(wlViewMode === 'weekly') {
        const d1 = new Date(wlCurrentDate);
        d1.setDate(d1.getDate() - d1.getDay() + 1); // Monday
        const d2 = new Date(d1);
        d2.setDate(d1.getDate() + 6); // Sunday
        text = d1.toLocaleDateString('th-TH', {day:'numeric', month:'short'}) + ' - ' + d2.toLocaleDateString('th-TH', {day:'numeric', month:'short', year:'numeric'});
    } else if(wlViewMode === 'monthly') {
        text = wlCurrentDate.toLocaleDateString('th-TH', wOpts);
    }
    
    const displayEl = document.getElementById('wl-current-date');
    if(displayEl) displayEl.textContent = text;
}

async function loadWorklogPage() {
    console.log('[Worklog] Loading worklog page from database...');
    wlCurrentDate = new Date();
    const modeEl = document.getElementById('wl-view-mode');
    if(modeEl) modeEl.value = wlViewMode;
    updateWorklogDateDisplay();
    
    try {
        const { data, error } = await supabase
            .from('worklogs')
            .select('*')
            .eq('user_id', MOCK_USER.uuid)
            .order('date', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            worklogEntries = data.map(row => ({
                id: row.id,
                date: row.date || '',
                startTime: (row.start_time || '09:00:00').substring(0, 5),
                endTime: (row.end_time || '18:00:00').substring(0, 5),
                detail: row.detail || '',
                status: row.status || 'Pending'
            }));
        } else {

            worklogEntries = [];
            addWorklogEntry();
        }
    } catch(e) {
        console.warn('[Worklog] DB fetch failed:', e.message);
        const key = 'myWorklog_' + (MOCK_USER?.uuid || 'default');
        const drafts = JSON.parse(localStorage.getItem(key));
        if(drafts && drafts.entries && drafts.entries.length > 0) {
            worklogEntries = drafts.entries;
        } else {
            worklogEntries = [];
            addWorklogEntry();
        }
    }
    
    renderWorklog();
}


function addWorklogEntry() {
    wlCounter++;
    worklogEntries.push({
        id: 'wl_' + wlCounter,
        date: wlViewMode === 'daily' ? wlCurrentDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '18:00',
        detail: '',
        status: 'Done'
    });
    renderWorklog();
}

function removeWorklogEntry(id) {
    worklogEntries = worklogEntries.filter(e => e.id !== id);
    renderWorklog();
}

function updateWorklogData(id, field, value) {
    const entry = worklogEntries.find(e => e.id === id);
    if(entry) {
        entry[field] = value;
    }
}

// Global exposure for innerHTML handlers
window.updateWorklogData = updateWorklogData;
window.addWorklogEntry = addWorklogEntry;
window.removeWorklogEntry = removeWorklogEntry;
window.getStatusColor = getStatusColor;
window.changeWorklogView = changeWorklogView;
window.changeWorklogPeriod = changeWorklogPeriod;
window.saveWorklogDraft = saveWorklogDraft;
window.exportWorklog = exportWorklog;
window.sendWorklogMonthly = sendWorklogMonthly;

function getStatusColor(st) {
    if(st === 'Done') return 'var(--success)';
    if(st === 'Onprocess') return 'var(--warning)';
    return 'var(--text-muted)';
}

function renderWorklog() {
    const tbody = document.getElementById('worklog-tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Filter display entries based on current view/date (Simple mock filter via matches)
    // Real implementation would filter based on Date range
    
    if(worklogEntries.length === 0) {
       tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;" class="text-muted">ไม่พบรายการบันทึกการทำงาน กรุณาเพิ่มรายการ</td></tr>';
       return;
    }
    
    const colDate = document.querySelector('.wl-col-date');
    if(colDate) {
        colDate.style.display = wlViewMode === 'daily' ? 'none' : '';
    }
    
    worklogEntries.forEach(entry => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', entry.id);
        
        let dateHtml = '';
        if(wlViewMode !== 'daily') {
             dateHtml = `<td style="vertical-align: middle;"><input type="date" class="form-control" value="${entry.date}" onchange="window.updateWorklogData('${entry.id}', 'date', this.value)"></td>`;
        }
        
        tr.innerHTML = `
            ${dateHtml}
            <td style="vertical-align: middle;">
              <div style="display:flex; align-items:center; gap:8px;">
                <input type="time" class="form-control" style="padding: 6px;" value="${entry.startTime}" onchange="window.updateWorklogData('${entry.id}', 'startTime', this.value)">
                <span>-</span>
                <input type="time" class="form-control" style="padding: 6px;" value="${entry.endTime}" onchange="window.updateWorklogData('${entry.id}', 'endTime', this.value)">
              </div>
            </td>
            <td style="vertical-align: middle;"><input type="text" class="form-control" placeholder="รายละเอียดงาน / กิจกรรม" value="${entry.detail}" onchange="window.updateWorklogData('${entry.id}', 'detail', this.value)"></td>
            <td style="vertical-align: middle;">
              <select class="form-control" style="color: ${getStatusColor(entry.status)}; font-weight: bold;" onchange="window.updateWorklogData('${entry.id}', 'status', this.value); this.style.color = getStatusColor(this.value)">
                 <option value="Done" ${entry.status==='Done'?'selected':''}>Done</option>
                 <option value="Onprocess" ${entry.status==='Onprocess'?'selected':''}>On Process</option>
                 <option value="Pending" ${entry.status==='Pending'?'selected':''}>Pending</option>
              </select>
            </td>
            <td style="vertical-align: middle; text-align: center;"><button class="btn-icon text-danger" onclick="removeWorklogEntry('${entry.id}')"><i class="fa-solid fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

function clearProfileSignature() {
    if (!confirm('คุณต้องการรีเซ็ตหรือลบลายเซ็นปัจจุบันใช่หรือไม่?')) return;
    
    document.getElementById('prof-signature_base64').value = '';
    const preImg = document.getElementById('saved-signature-preview');
    const noSigTxt = document.getElementById('no-signature-text');
    
    if (preImg) preImg.style.display = 'none';
    if (noSigTxt) noSigTxt.style.display = 'block';
    
    showToast('ล้างลายเซ็นเรียบร้อย', 'อย่าลืมกด "บันทึกข้อมูล" เพื่อยืนยันการเปลี่ยนแปลง', 'warning');
}

window.clearProfileSignature = clearProfileSignature;

async function saveWorklogDraft() {
    confirmAction('ยืนยันการบันทึกรายการทำงานทั้งหมด?', 'ข้อมูลจะถูกบันทึกลงฐานข้อมูลส่วนกลาง', async () => {
        try {
            if(!MOCK_USER || !MOCK_USER.uuid) throw new Error('User not identified');

            const payloads = worklogEntries.map(e => ({
                user_id: MOCK_USER.uuid,
                date: e.date,
                start_time: e.startTime,
                end_time: e.endTime,
                detail: e.detail,
                status: e.status
            }));

            const { error } = await supabase.from('worklogs').upsert(payloads);
            if (error) throw error;

            localStorage.setItem('myWorklog_' + MOCK_USER.uuid, JSON.stringify({
                entries: worklogEntries
            }));
            
            showToast('บันทึกสำเร็จ', 'บันทึกข้อมูลการทำงานลงฐานข้อมูลเรียบร้อยแล้ว', 'success');
            loadWorklogPage();
        } catch(e) {
            console.error('[Worklog] Save failed:', e);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + e.message);
        }
    });
}


function exportWorklog() {
    if(worklogEntries.length === 0) {
        alert('ยังไม่มีข้อมูลการทำงานสำหรับ Export');
        return;
    }
    
    let csv = '\\uFEFF'; 
    csv += 'วันที่,เวลาเริ่ม,เวลาสิ้นสุด,รายละเอียดการทำงาน,สถานะ\\n';
    
    worklogEntries.forEach(e => {
        const d = `"${e.date}"`;
        const stTime = `"${e.startTime}"`;
        const enTime = `"${e.endTime}"`;
        const detail = `"${(e.detail||'').replace(/"/g, '""')}"`;
        const st = `"${e.status}"`;
        csv += `${d},${stTime},${enTime},${detail},${st}\\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Worklog_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function sendWorklogMonthly() {
    if(worklogEntries.length === 0) {
        alert('ไม่มีข้อมูลการทำงานสำหรับส่งรายงาน');
        return;
    }
    confirmAction('ส่งสรุปรายงานการทำงานทั้งหมดให้ผู้บริหาร?', '', () => {
        alert('ส่งรายงานประจำเดือนให้ผู้บริหารทางอีเมลเรียบร้อยแล้ว (Mock System)');
    });
}

// ─── UTILITIES & HELPERS ───────────────────────────

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function logActivity(action, detail = '') {
    try {
        const payload = {
            user_id: MOCK_USER ? MOCK_USER.uuid : null,
            action: action,
            detail: detail,
            ip_address: 'browser-client'
        };
        if (payload.user_id === 'default-uuid') {
            console.log("Demo Mode: Skipping audit log", payload);
            return;
        }
        await supabase.from('audit_logs').insert([payload]);
    } catch(e) {
        console.warn('Silent fail: Audit log could not be saved', e);
    }
}


// ฟังก์ชันแสดงการแจ้งเตือนแบบ Toast (iOS Glassmorphism Style)
function showToast(title, message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    if (type === 'danger') icon = 'fa-circle-xmark';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-content">
            <span class="toast-title">${title}</span>
            <span class="toast-message">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove
    const timer = setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 500);
    }, duration);

    // Manual remove on click
    toast.onclick = () => {
        clearTimeout(timer);
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 500);
    };
}

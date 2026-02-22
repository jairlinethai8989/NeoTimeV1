// ============================================================
// Time Attendance System - Google Apps Script Backend
// Version: 2.0  |  Project: Gravity Time Attendance
// Full Admin Panel with Workplace, User, Map, Reports
// ============================================================

// ─── Configuration Constants ────────────────────────────────
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
const IMAGE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
const LINE_NOTIFY_TOKEN = 'YOUR_LINE_NOTIFY_TOKEN_HERE';
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE';
const TARGET_GROUP_ID = 'YOUR_LINE_GROUP_ID_HERE';

// ─── Sheet Names ────────────────────────────────────────────
const SHEET_ATTENDANCE = 'Attendance';
const SHEET_EMPLOYEES = 'Employees';
const SHEET_USERS = 'Users';
const SHEET_WORKPLACES = 'Workplaces';
const SHEET_SHIFTS = 'Shifts';
const SHEET_AUDIT = 'AuditLog';

// ─── Default Shift ──────────────────────────────────────────
const DEFAULT_SHIFT_START = '08:00';
const DEFAULT_LATE_THRESHOLD = 15;
const DEFAULT_SHIFT_END = '17:00';


// ============================================================
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบเช็คชื่อพนักงาน - Time Attendance')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.events && data.events.length > 0) {
      data.events.forEach(event => handleLineEvent(event));
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('doPost error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ============================================================
// DASHBOARD
// ============================================================

function getDashboardStats() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_ATTENDANCE);
    const empSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    const wpSheet = ss.getSheetByName(SHEET_WORKPLACES);

    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');

    let totalCheckins = 0, onTime = 0, late = 0, outOfRange = 0;
    let totalEmployees = 0, totalWorkplaces = 0;

    // Attendance stats
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
      const todayRecords = data.filter(r => {
        const d = r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Bangkok', 'yyyy-MM-dd') : String(r[1]);
        return d === today;
      });
      totalCheckins = todayRecords.length;
      onTime = todayRecords.filter(r => r[6] === 'Normal').length;
      late = todayRecords.filter(r => r[6] === 'Late').length;
      outOfRange = todayRecords.filter(r => r[9] === 'Out of Range').length;
    }

    if (empSheet && empSheet.getLastRow() > 1) {
      totalEmployees = empSheet.getLastRow() - 1;
    }
    if (wpSheet && wpSheet.getLastRow() > 1) {
      totalWorkplaces = wpSheet.getLastRow() - 1;
    }

    return {
      success: true,
      data: {
        totalCheckins, onTime, late, outOfRange,
        totalEmployees, totalWorkplaces,
        date: today
      }
    };
  } catch (error) {
    Logger.log('getDashboardStats error: ' + error.message);
    return { success: false, message: error.message };
  }
}


// ============================================================
// ATTENDANCE
// ============================================================

function submitAttendance(data) {
  Logger.log('submitAttendance: ' + JSON.stringify({ empId: data.empId, type: data.type }));
  try {
    if (!data.empId || !data.empName) throw new Error('กรุณากรอกรหัสพนักงานและชื่อ');
    if (!data.lat || !data.lng) throw new Error('ไม่สามารถรับตำแหน่ง GPS ได้');

    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(now, 'Asia/Bangkok', 'HH:mm:ss');
    const yearMonth = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
    const timestamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    // Use selected workplace or fallback
    let workplace = null;
    let distance = 999;
    
    if (data.workplaceId) {
      workplace = findWorkplaceById(data.workplaceId);
      if (workplace) {
        distance = calculateDistance(data.lat, data.lng, workplace.lat, workplace.lng);
      }
    }
    
    // If not found by ID, try finding nearest (Backward Compatibility)
    if (!workplace) {
      workplace = findNearestWorkplace(data.lat, data.lng);
      if (workplace) distance = workplace.distance;
    }

    const status = calculateStatus(now, data.type, data.workplaceId);
    const isInRange = workplace ? (distance * 1000 <= workplace.radius) : false;
    const locationStatus = isInRange ? 'In Range' : 'Out of Range';
    const workplaceName = workplace ? workplace.name : (data.workplaceName || 'ไม่ทราบระบุ');

    // Save image
    let imageUrl = '';
    if (data.imageBase64) {
      imageUrl = saveImageToDrive(data.imageBase64, data.empId, now, yearMonth);
    }

    // Write to sheet
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    if (!sheet) throw new Error('Sheet not found');

    const row = [
      timestamp, dateStr, timeStr, data.empId, data.empName,
      data.type, status, data.lat, data.lng, locationStatus,
      distance.toFixed(3), workplaceName, imageUrl, data.note || ''
    ];
    sheet.appendRow(row);

    // Audit log
    addAuditLog(data.empId, data.type, `${status} | ${locationStatus} | ${workplaceName}`);

    // LINE notification for anomalies
    if (status === 'Late' || locationStatus === 'Out of Range') {
      const emoji = status === 'Late' ? '🔴' : '📍';
      const msg = `${emoji} แจ้งเตือน\n👤 ${data.empName} (${data.empId})\n📋 ${data.type}\n🕐 ${timeStr}\n📌 ${status} | ${locationStatus}\n📍 ${workplaceName} (${(distance * 1000).toFixed(0)}m)`;
      sendLineNotify(msg, LINE_NOTIFY_TOKEN);
      broadcastToGroup(msg);
    }

    return {
      success: true,
      message: 'บันทึกสำเร็จ',
      data: { timestamp, status, locationStatus, distance: distance.toFixed(3), workplaceName, imageUrl }
    };
  } catch (error) {
    Logger.log('submitAttendance error: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getAttendanceRecords(filterDate) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    let records = data.map(row => ({
      timestamp: row[0], date: formatDateValue(row[1]), time: row[2],
      empId: row[3], empName: row[4], type: row[5], status: row[6],
      lat: row[7], lng: row[8], locationStatus: row[9],
      distance: row[10], workplaceName: row[11], imageUrl: row[12], note: row[13]
    }));

    if (filterDate) {
      records = records.filter(r => r.date === filterDate);
    }

    records.reverse();
    return { success: true, data: records };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function getActiveEmployeesForMap() {
  try {
    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();

    // Get today's records grouped by employee
    const empMap = {};
    data.forEach(row => {
      const dateVal = formatDateValue(row[1]);
      if (dateVal === today) {
        const empId = String(row[3]);
        if (!empMap[empId]) empMap[empId] = [];
        empMap[empId].push({
          timestamp: row[0], time: row[2], empId: empId,
          empName: row[4], type: row[5], status: row[6],
          lat: row[7], lng: row[8], locationStatus: row[9],
          workplaceName: row[11]
        });
      }
    });

    // Determine current status per employee
    const activeList = [];
    for (const empId in empMap) {
      const records = empMap[empId];
      const lastRecord = records[records.length - 1];
      const checkins = records.filter(r => r.type === 'Check-in').length;
      const checkouts = records.filter(r => r.type === 'Check-out').length;

      let currentStatus = 'checked-in';
      if (checkouts >= checkins) currentStatus = 'checked-out';

      activeList.push({
        empId: lastRecord.empId,
        empName: lastRecord.empName,
        lat: lastRecord.lat,
        lng: lastRecord.lng,
        time: lastRecord.time,
        type: lastRecord.type,
        status: lastRecord.status,
        locationStatus: lastRecord.locationStatus,
        workplaceName: lastRecord.workplaceName,
        currentStatus: currentStatus
      });
    }

    return { success: true, data: activeList };
  } catch (error) {
    return { success: false, message: error.message };
  }
}


// ============================================================
// WORKPLACE MANAGEMENT
// ============================================================

function getWorkplaces() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_WORKPLACES);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    const workplaces = data.filter(r => r[0]).map(row => ({
      id: String(row[0]),
      name: String(row[1]),
      lat: Number(row[2]),
      lng: Number(row[3]),
      radius: Number(row[4]),  // in meters
      qrCode: String(row[5]),
      status: String(row[6]) || 'ใช้งาน'
    }));
    return { success: true, data: workplaces };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function addWorkplace(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_WORKPLACES);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_WORKPLACES);
      sheet.getRange(1, 1, 1, 7).setValues([['รหัส', 'ชื่อหน้างาน', 'Latitude', 'Longitude', 'รัศมี (m)', 'QR Code', 'สถานะ']]);
    }

    const qrCode = data.id + '_' + new Date().getTime();
    sheet.appendRow([data.id, data.name, data.lat, data.lng, data.radius || 100, qrCode, 'ใช้งาน']);
    addAuditLog('SYSTEM', 'เพิ่มหน้างาน', data.name);
    return { success: true, message: 'เพิ่มหน้างานสำเร็จ' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function updateWorkplace(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_WORKPLACES);
    if (!sheet) throw new Error('Sheet not found');

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][0]) === String(data.id)) {
        const rowNum = i + 2;
        sheet.getRange(rowNum, 2).setValue(data.name);
        sheet.getRange(rowNum, 3).setValue(data.lat);
        sheet.getRange(rowNum, 4).setValue(data.lng);
        sheet.getRange(rowNum, 5).setValue(data.radius);
        sheet.getRange(rowNum, 7).setValue(data.status || 'ใช้งาน');
        addAuditLog('SYSTEM', 'แก้ไขหน้างาน', data.name);
        return { success: true, message: 'แก้ไขสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรหัสหน้างาน');
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function deleteWorkplace(id) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_WORKPLACES);
    if (!sheet) throw new Error('Sheet not found');

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        addAuditLog('SYSTEM', 'ลบหน้างาน', String(allData[i][1]));
        return { success: true, message: 'ลบสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรหัสหน้างาน');
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function findNearestWorkplace(lat, lng) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_WORKPLACES);
    if (!sheet || sheet.getLastRow() < 2) return null;

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    let nearest = null;
    let minDist = 999;

    data.forEach(row => {
      if (String(row[6]) === 'ใช้งาน') {
        const dist = calculateDistance(lat, lng, Number(row[2]), Number(row[3]));
        if (dist < minDist) {
          minDist = dist;
          nearest = { id: row[0], name: row[1], lat: row[2], lng: row[3], radius: row[4], distance: dist };
        }
      }
    });

    return nearest;
  } catch (error) {
    Logger.log('findNearestWorkplace error: ' + error.message);
    return null;
  }
}

function findWorkplaceById(id) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_WORKPLACES);
    if (!sheet || sheet.getLastRow() < 2) return null;

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(id) && String(data[i][6]) === 'ใช้งาน') {
        return { 
          id: data[i][0], 
          name: data[i][1], 
          lat: Number(data[i][2]), 
          lng: Number(data[i][3]), 
          radius: Number(data[i][4]) 
        };
      }
    }
    return null;
  } catch (error) {
    Logger.log('findWorkplaceById error: ' + error.message);
    return null;
  }
}


// ============================================================
// USER MANAGEMENT
// ============================================================

function getUsers() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USERS);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    const users = data.filter(r => r[0]).map(row => ({
      empId: String(row[0]),
      name: String(row[1]),
      email: String(row[2]),
      username: String(row[3]),
      role: String(row[4]),  // HR Admin, หัวหน้างาน, พนักงาน
      shift: String(row[5]),
      status: String(row[6]) || 'ใช้งาน'
    }));
    return { success: true, data: users };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function addUser(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_USERS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_USERS);
      sheet.getRange(1, 1, 1, 7).setValues([['รหัส', 'ชื่อ-นามสกุล', 'อีเมล', 'ชื่อผู้ใช้', 'บทบาท', 'กะงาน', 'สถานะ']]);
    }

    sheet.appendRow([data.empId, data.name, data.email, data.username, data.role, data.shift || '-', 'ใช้งาน']);

    // Also add to Employees sheet if role is พนักงาน or หัวหน้างาน
    if (data.role === 'พนักงาน' || data.role === 'หัวหน้างาน') {
      let empSheet = ss.getSheetByName(SHEET_EMPLOYEES);
      if (!empSheet) {
        empSheet = ss.insertSheet(SHEET_EMPLOYEES);
        empSheet.getRange(1, 1, 1, 4).setValues([['Employee ID', 'Employee Name', 'Department', 'Email']]);
      }
      empSheet.appendRow([data.empId, data.name, data.department || '', data.email]);
    }

    addAuditLog('SYSTEM', 'เพิ่มผู้ใช้', data.name + ' (' + data.role + ')');
    return { success: true, message: 'เพิ่มผู้ใช้สำเร็จ' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function updateUser(data) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USERS);
    if (!sheet) throw new Error('Sheet not found');

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][0]) === String(data.empId)) {
        const rowNum = i + 2;
        sheet.getRange(rowNum, 2).setValue(data.name);
        sheet.getRange(rowNum, 3).setValue(data.email);
        sheet.getRange(rowNum, 4).setValue(data.username);
        sheet.getRange(rowNum, 5).setValue(data.role);
        sheet.getRange(rowNum, 6).setValue(data.shift || '-');
        sheet.getRange(rowNum, 7).setValue(data.status || 'ใช้งาน');
        addAuditLog('SYSTEM', 'แก้ไขผู้ใช้', data.name);
        return { success: true, message: 'แก้ไขสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรหัสผู้ใช้');
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function deleteUser(empId) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USERS);
    if (!sheet) throw new Error('Sheet not found');

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][0]) === String(empId)) {
        sheet.deleteRow(i + 2);
        addAuditLog('SYSTEM', 'ลบผู้ใช้', String(allData[i][1]));
        return { success: true, message: 'ลบสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรหัสผู้ใช้');
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function getEmployeeList() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_EMPLOYEES);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    const employees = data.filter(r => r[0]).map(row => ({
      empId: String(row[0]), empName: String(row[1]),
      department: String(row[2] || ''), email: String(row[3] || '')
    }));
    return { success: true, data: employees };
  } catch (error) {
    return { success: false, message: error.message };
  }
}


// ============================================================
// AUDIT LOG
// ============================================================

function addAuditLog(userId, action, details) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_AUDIT);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_AUDIT);
      sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'User', 'Action', 'Details']]);
    }
    const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([now, userId, action, details]);
  } catch (error) {
    Logger.log('addAuditLog error: ' + error.message);
  }
}

function getAuditLogs() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_AUDIT);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    const logs = data.map(row => ({
      timestamp: row[0], user: row[1], action: row[2], details: row[3]
    }));
    logs.reverse();
    return { success: true, data: logs.slice(0, 100) };  // last 100
  } catch (error) {
    return { success: false, message: error.message };
  }
}


// ============================================================
// STATUS CALCULATION
// ============================================================

function calculateStatus(now, type, workplaceId) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const current = hours * 60 + minutes;

  if (type === 'Check-in') {
    const [h, m] = DEFAULT_SHIFT_START.split(':').map(Number);
    if (current > (h * 60 + m + DEFAULT_LATE_THRESHOLD)) return 'Late';
    return 'Normal';
  } else if (type === 'Check-out') {
    const [h, m] = DEFAULT_SHIFT_END.split(':').map(Number);
    if (current < (h * 60 + m)) return 'Early Leave';
    return 'Normal';
  }
  return 'Normal';
}


// ============================================================
// IMAGE MANAGEMENT
// ============================================================

function saveImageToDrive(base64Data, empId, now, yearMonth) {
  try {
    const mainFolder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    let subFolder;
    const subFolders = mainFolder.getFoldersByName(yearMonth);
    subFolder = subFolders.hasNext() ? subFolders.next() : mainFolder.createFolder(yearMonth);

    const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const blob = Utilities.newBlob(
      Utilities.base64Decode(cleanBase64), 'image/png',
      empId + '_' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd_HHmmss') + '.png'
    );

    const file = subFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?id=' + file.getId();
  } catch (error) {
    Logger.log('saveImageToDrive error: ' + error.message);
    return '';
  }
}


// ============================================================
// GEOLOCATION
// ============================================================

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ============================================================
// LINE INTEGRATION
// ============================================================

function sendLineNotify(message, token) {
  if (!token || token.includes('YOUR_')) return;
  try {
    UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method: 'post', headers: { 'Authorization': 'Bearer ' + token },
      payload: { message: message }, muteHttpExceptions: true
    });
  } catch (e) { Logger.log('LINE Notify error: ' + e.message); }
}

function broadcastToGroup(message) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.includes('YOUR_')) return;
  if (!TARGET_GROUP_ID || TARGET_GROUP_ID.includes('YOUR_')) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify({ to: TARGET_GROUP_ID, messages: [{ type: 'text', text: message }] }),
      muteHttpExceptions: true
    });
  } catch (e) { Logger.log('LINE Push error: ' + e.message); }
}

function handleLineEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const msg = event.message.text.trim();
  const token = event.replyToken;

  if (msg === '!setup' && event.source.type === 'group') {
    replyMessage(token, '✅ Group ID:\n' + event.source.groupId);
  } else if (msg.toLowerCase() === 'check status' || msg === 'เช็คสถานะ') {
    const profile = getLineUserProfile(event.source.userId);
    if (profile) {
      const rec = findLastRecordByName(profile.displayName);
      if (rec) {
        replyMessage(token, `📋 ${rec.empName}\n📅 ${rec.date} 🕐 ${rec.time}\n📌 ${rec.type}: ${rec.status}`);
      } else {
        replyMessage(token, '❌ ไม่พบข้อมูล');
      }
    }
  } else if (msg === '!help') {
    replyMessage(token, '🤖 คำสั่ง:\n• Check Status - ดูสถานะ\n• !setup - ดู Group ID\n• !help - ช่วยเหลือ');
  }
}

function replyMessage(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.includes('YOUR_')) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
  } catch (e) { Logger.log('Reply error: ' + e.message); }
}

function getLineUserProfile(userId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN.includes('YOUR_')) return null;
  try {
    const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + userId, {
      headers: { 'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }, muteHttpExceptions: true
    });
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
  } catch (e) { return null; }
}

function findLastRecordByName(name) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    if (!sheet || sheet.getLastRow() < 2) return null;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][4]).includes(name) || name.includes(String(data[i][4]))) {
        return { empName: data[i][4], date: data[i][1], time: data[i][2], type: data[i][5], status: data[i][6] };
      }
    }
    return null;
  } catch (e) { return null; }
}


// ============================================================
// UTILITIES
// ============================================================

function formatDateValue(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd');
  return String(val).substring(0, 10);
}

function initializeSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Attendance
  let s = ss.getSheetByName(SHEET_ATTENDANCE);
  if (!s) s = ss.insertSheet(SHEET_ATTENDANCE);
  s.getRange(1, 1, 1, 14).setValues([['Timestamp', 'Date', 'Time', 'Employee ID', 'Employee Name', 'Type', 'Status', 'Latitude', 'Longitude', 'Location Status', 'Distance (km)', 'Workplace', 'Image URL', 'Note']]);
  s.getRange(1, 1, 1, 14).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');

  // Employees
  s = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!s) s = ss.insertSheet(SHEET_EMPLOYEES);
  s.getRange(1, 1, 1, 4).setValues([['Employee ID', 'Employee Name', 'Department', 'Email']]);
  s.getRange(1, 1, 1, 4).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');

  // Users
  s = ss.getSheetByName(SHEET_USERS);
  if (!s) s = ss.insertSheet(SHEET_USERS);
  s.getRange(1, 1, 1, 7).setValues([['รหัส', 'ชื่อ-นามสกุล', 'อีเมล', 'ชื่อผู้ใช้', 'บทบาท', 'กะงาน', 'สถานะ']]);
  s.getRange(1, 1, 1, 7).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');

  // Workplaces
  s = ss.getSheetByName(SHEET_WORKPLACES);
  if (!s) s = ss.insertSheet(SHEET_WORKPLACES);
  s.getRange(1, 1, 1, 7).setValues([['รหัส', 'ชื่อหน้างาน', 'Latitude', 'Longitude', 'รัศมี (m)', 'QR Code', 'สถานะ']]);
  s.getRange(1, 1, 1, 7).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');

  // Shifts
  s = ss.getSheetByName(SHEET_SHIFTS);
  if (!s) s = ss.insertSheet(SHEET_SHIFTS);
  s.getRange(1, 1, 1, 5).setValues([['Shift ID', 'Shift Name', 'Start Time', 'End Time', 'Late Threshold (min)']]);
  s.getRange(1, 1, 1, 5).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');
  if (s.getLastRow() < 2) s.appendRow(['SHIFT001', 'กะปกติ', '08:00', '17:00', 15]);

  // Audit Log
  s = ss.getSheetByName(SHEET_AUDIT);
  if (!s) s = ss.insertSheet(SHEET_AUDIT);
  s.getRange(1, 1, 1, 4).setValues([['Timestamp', 'User', 'Action', 'Details']]);
  s.getRange(1, 1, 1, 4).setBackground('#1e3a5f').setFontColor('#fff').setFontWeight('bold');

  Logger.log('All sheets initialized');
}

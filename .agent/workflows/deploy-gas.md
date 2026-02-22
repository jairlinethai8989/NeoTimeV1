---
description: How to deploy the Gravity Time Attendance to Google Apps Script
---

# Deploy Gravity Time Attendance to Google Apps Script

## Prerequisites
- Google Account
- Access to Google Sheets, Google Drive, Google Apps Script

## Steps

### 1. Create Google Sheet
1. Go to https://sheets.google.com
2. Create a new Spreadsheet
3. Copy the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`

### 2. Create Google Drive Folder
1. Create a new folder in Google Drive named "Gravity_Attendance_Images"
2. Copy the **Folder ID** from the URL: `https://drive.google.com/drive/folders/[FOLDER_ID]`

### 3. Create Apps Script Project
1. Go to https://script.google.com
2. Click **New Project**
3. Rename to "Gravity Time Attendance"

### 4. Add the Code Files
1. In the default `Code.gs` file, delete all content and paste the contents of `Code.gs` from this project
2. Click **File > New > HTML file**, name it `Index` (not Index.html, just Index)
3. Paste the contents of `Index.html` from this project

### 5. Configure Constants in Code.gs
Update these constants at the top of `Code.gs`:
```javascript
const SHEET_ID = 'paste_your_sheet_id_here';
const IMAGE_FOLDER_ID = 'paste_your_folder_id_here';
const OFFICE_LAT = 13.7563;   // Your office latitude
const OFFICE_LNG = 100.5018;  // Your office longitude
```

### 6. Initialize the Sheet
1. In Apps Script, select function `initializeSheet` from the dropdown
2. Click **Run**
3. Authorize the script when prompted
4. This creates the "Attendance" and "Employees" sheet headers

### 7. Deploy as Web App
1. Click **Deploy > New deployment**
2. Click the gear icon > Select **Web app**
3. Set:
   - Description: "Gravity Time Attendance v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Copy the Web App URL

### 8. (Optional) Setup LINE Notify
1. Go to https://notify-bot.line.me/my/
2. Generate a new token, select the group to notify
3. Update `LINE_NOTIFY_TOKEN` in Code.gs
4. Redeploy (Deploy > Manage deployments > Edit > New version > Deploy)

### 9. (Optional) Setup LINE Messaging API
1. Go to https://developers.line.me/
2. Create a Messaging API channel
3. Copy Channel Access Token
4. Update `LINE_CHANNEL_ACCESS_TOKEN` in Code.gs
5. Add the bot to your LINE group
6. In the group, type `!setup` to get the Group ID
7. Update `TARGET_GROUP_ID` in Code.gs
8. Set the Webhook URL to your Web App URL
9. Redeploy

### 10. Add Employees (Optional)
1. Open the Google Sheet
2. Go to "Employees" tab
3. Add employee data: Employee ID, Employee Name, Department

## Testing
1. Open the Web App URL in a mobile browser
2. Fill in Employee ID and Name
3. Allow camera and location permissions
4. Capture a photo
5. Click Check-in
6. Switch to Dashboard tab to verify the record

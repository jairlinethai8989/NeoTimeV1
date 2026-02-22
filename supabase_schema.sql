-- ผู้ใช้งานและพนักงาน (Users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'พนักงาน' CHECK (role IN ('พนักงาน', 'หัวหน้างาน', 'HR Admin')),
    primary_shift TEXT,
    status TEXT DEFAULT 'ใช้งาน' CHECK (status IN ('ใช้งาน', 'ระงับ')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- การเปิด RLS สำหรับ Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- สร้าง นโยบายให้ทุกคนอ่านโปรไฟล์คนอื่นได้ (เอาไว้โชว์ชื่อ)
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ฟังก์ชันดึง HR Admin หรือหัวหน้างาน (สำหรับจัดการ Role) - แบบง่ายใช้เช็คสิทธิ์คร่าวๆ ก่อนครับ

-- สถานที่ทำงาน (Workplaces)
CREATE TABLE public.workplaces (
    id TEXT PRIMARY KEY, -- เช่น HQ001
    name TEXT NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    radius INTEGER DEFAULT 100 NOT NULL,
    status TEXT DEFAULT 'ใช้งาน' CHECK (status IN ('ใช้งาน', 'ระงับ')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workplaces are viewable by everyone" ON workplaces FOR SELECT USING (true);
-- ชั่วคราว: ให้อนุญาตแก้ไขได้ทุกคนก่อนเพื่อความง่ายในการเทส (เอาไปปรับได้ตอนหลัง)
CREATE POLICY "Anyone can manage workplaces" ON workplaces FOR ALL USING (true);

-- การลงเวลาเข้า-ออกงาน (Attendance Logs)
CREATE TABLE public.attendance_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    workplace_id TEXT REFERENCES public.workplaces(id),
    type TEXT NOT NULL CHECK (type IN ('Check-in', 'Check-out')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    time TIME WITHOUT TIME ZONE DEFAULT CURRENT_TIME NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    distance_meters NUMERIC,
    status TEXT DEFAULT 'ปกติ', -- ปกติ, สาย, ขาด, etc.
    note TEXT,
    image_url TEXT
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
-- ดูประวัติ: ดูของตัวเองได้ทั้งหมด (หรือถ้าเป็นโหมดหัวหน้างานค่อยว่ากันทีหลัง)
CREATE POLICY "Users can insert their own logs" ON attendance_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own logs" ON attendance_logs FOR SELECT USING (auth.uid() = user_id);
-- เปิดให้ดูทั้งหมดชั่วคราวเพื่อทำ Report ฝั่งแอดมิน (เอาไปเพิ่มเงื่อนไขภายหลัง)
CREATE POLICY "Admins can view all logs" ON attendance_logs FOR SELECT USING (true); 

-- คำขอต่างๆ (Requests: Leave, OT, Swap)
CREATE TABLE public.requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('leave', 'ot', 'swap')),
    leave_type TEXT, -- ลาป่วย, ลากิจ
    start_date DATE,
    end_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    reason TEXT NOT NULL,
    document_url TEXT,
    target_user_id UUID REFERENCES public.profiles(id), -- กรณี Swap กะให้เพื่อน
    target_date DATE, -- วันที่ของเพื่อนที่ต้องการแลก
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own requests" ON requests FOR ALL USING (auth.uid() = user_id);
-- เปิดให้แอดมิน หรือ target_user ดูคำขอได้
CREATE POLICY "Others can view related requests" ON requests FOR SELECT USING (true);
CREATE POLICY "Admins can update requests" ON requests FOR UPDATE USING (true);

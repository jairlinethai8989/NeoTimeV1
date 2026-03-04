-- ผู้ใช้งานและพนักงาน (Users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'พนักงาน' CHECK (role IN ('พนักงาน', 'หัวหน้างาน', 'HR Admin')),
    phone TEXT,
    department TEXT,
    signature_base64 TEXT,
    primary_shift TEXT,
    accessible_menus JSONB DEFAULT '["dashboard", "checkin", "records", "map", "shifts", "my-requests", "profile"]'::jsonb,
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
CREATE POLICY "Users can insert their own logs" ON attendance_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own logs" ON attendance_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON attendance_logs FOR SELECT USING (true); 

-- คำขอต่างๆ (Requests: Leave, OT, Swap)
CREATE TABLE public.requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('leave', 'ot', 'swap')),
    leave_type TEXT, 
    start_date DATE,
    end_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    reason TEXT NOT NULL,
    document_url TEXT,
    target_user_id UUID REFERENCES public.profiles(id), 
    target_date DATE, 
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own requests" ON requests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Others can view related requests" ON requests FOR SELECT USING (true);
CREATE POLICY "Admins can update requests" ON requests FOR UPDATE USING (true);

-- บันทึกการทำงาน (Worklogs)
CREATE TABLE public.worklogs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    detail TEXT NOT NULL,
    status TEXT DEFAULT 'Done' CHECK (status IN ('Done', 'Onprocess', 'Pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.worklogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own worklogs" ON public.worklogs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all worklogs" ON public.worklogs FOR SELECT USING (true);

-- ตั้งค่าระบบ (System Settings)
CREATE TABLE public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read system settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL USING (true);

/** Human-readable access areas for Super Admin UI */
export const ACCESS_CATALOG: {
  code: string;
  labelAr: string;
  labelEn: string;
  routes: string[];
}[] = [
  {
    code: '*',
    labelAr: 'صلاحية كاملة على كل النظام',
    labelEn: 'Full system access',
    routes: ['*'],
  },
  {
    code: 'dashboard',
    labelAr: 'لوحة التحكم',
    labelEn: 'Dashboard',
    routes: ['/dashboard'],
  },
  {
    code: 'students',
    labelAr: 'الطلاب',
    labelEn: 'Students',
    routes: ['/students'],
  },
  {
    code: 'teachers',
    labelAr: 'المدرسون',
    labelEn: 'Teachers',
    routes: ['/teachers'],
  },
  {
    code: 'groups',
    labelAr: 'المجموعات والجدول',
    labelEn: 'Groups & calendar',
    routes: ['/groups', '/calendar'],
  },
  {
    code: 'groups.own',
    labelAr: 'مجموعات المدرس فقط',
    labelEn: 'Own groups only',
    routes: ['/groups', '/calendar'],
  },
  {
    code: 'attendance',
    labelAr: 'الحضور وكشك المسح',
    labelEn: 'Attendance',
    routes: ['/attendance', '/check-in'],
  },
  {
    code: 'finance',
    labelAr: 'الحسابات والفواتير',
    labelEn: 'Finance',
    routes: ['/finance'],
  },
  {
    code: 'finance.payments',
    labelAr: 'تسجيل المدفوعات فقط',
    labelEn: 'Record payments',
    routes: ['/finance'],
  },
  {
    code: 'revenue',
    labelAr: 'إيرادات إضافية (أونلاين/ملازم/قاعات)',
    labelEn: 'Extra revenue',
    routes: ['/revenue'],
  },
  {
    code: 'ops',
    labelAr: 'تشغيل الحصص والتحصيل',
    labelEn: 'Session ops',
    routes: ['/ops'],
  },
  {
    code: 'bookings',
    labelAr: 'استمارات الحجز',
    labelEn: 'Bookings',
    routes: ['/bookings'],
  },
  {
    code: 'reports',
    labelAr: 'التقارير',
    labelEn: 'Reports',
    routes: ['/reports'],
  },
  {
    code: 'exams',
    labelAr: 'الامتحانات',
    labelEn: 'Exams',
    routes: ['/exams'],
  },
  {
    code: 'messaging',
    labelAr: 'التواصل',
    labelEn: 'Messaging',
    routes: ['/messaging'],
  },
  {
    code: 'settings',
    labelAr: 'إعدادات السنتر',
    labelEn: 'Settings',
    routes: ['/settings'],
  },
  {
    code: 'users',
    labelAr: 'إدارة الحسابات والأدوار',
    labelEn: 'Users & roles',
    routes: ['/users'],
  },
  {
    code: 'children',
    labelAr: 'متابعة الأبناء (ولي أمر)',
    labelEn: 'Parent children',
    routes: ['/portal'],
  },
  {
    code: 'self',
    labelAr: 'بوابة الطالب الشخصية',
    labelEn: 'Student portal',
    routes: ['/portal'],
  },
];

export function describeAccess(permissions: string[]) {
  if (permissions.includes('*')) {
    const full = ACCESS_CATALOG.find((a) => a.code === '*')!;
    return {
      isFullAccess: true,
      areas: [full],
      permissionCodes: ['*'],
    };
  }
  const areas = ACCESS_CATALOG.filter(
    (a) => a.code !== '*' && permissions.includes(a.code),
  );
  return {
    isFullAccess: false,
    areas,
    permissionCodes: permissions,
  };
}

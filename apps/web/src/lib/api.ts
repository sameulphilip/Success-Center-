const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  mustSetPassword?: boolean;
  role: string;
  permissions: string[];
  teacherId?: string | null;
  parentId?: string | null;
  studentId?: string | null;
};

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const raw = err.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : raw || 'Request failed';

    if (res.status === 401 && typeof window !== 'undefined') {
      const hadToken = !!token;
      const onLogin = window.location.pathname.startsWith('/login');
      if (hadToken) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
      if (hadToken && !onLogin) {
        window.location.href = '/login';
        throw new Error('انتهت الجلسة — سجّل الدخول مرة أخرى');
      }
      throw new Error(message);
    }

    throw new Error(message);
  }
  return res.json();
}

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

function persistAuth(data: LoginResult) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export async function login(email: string, password: string) {
  const data = await api<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return persistAuth(data);
}

export async function phoneStatus(phone: string) {
  return api<{
    status: 'not_ready' | 'needs_password' | 'ready';
    fullName?: string;
    phone?: string;
    message: string;
  }>('/auth/phone/status', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function phoneSetup(phone: string, password: string) {
  const data = await api<LoginResult>('/auth/phone/setup', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
  return persistAuth(data);
}

export async function phoneLogin(phone: string, password: string) {
  const data = await api<LoginResult>('/auth/phone/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
  return persistAuth(data);
}

export function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

/** Authenticated binary download (PDF, etc.) */
export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open authenticated file (image/PDF) in a new tab */
export async function openFileInTab(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const raw = err.message;
    throw new Error(
      Array.isArray(raw) ? raw.join(', ') : raw || 'تعذر فتح الملف',
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

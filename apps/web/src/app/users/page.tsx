'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api, getStoredUser } from '@/lib/api';

type Role = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  permissions: string[];
  _count?: { users: number };
};

type AccessArea = {
  code: string;
  labelAr: string;
  labelEn: string;
  routes: string[];
};

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  role: Role;
  access?: {
    isFullAccess: boolean;
    areas: AccessArea[];
    permissionCodes: string[];
  };
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'مدير النظام',
  CENTER_MANAGER: 'مدير السنتر',
  ACCOUNTANT: 'محاسب',
  RECEPTION: 'استقبال',
  TEACHER: 'مدرس',
  PARENT: 'ولي أمر',
  STUDENT: 'طالب',
};

export default function UsersAdminPage() {
  const router = useRouter();
  const me = getStoredUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<AccessArea[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [roleEditId, setRoleEditId] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const [createForm, setCreateForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    roleCode: 'RECEPTION',
  });
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    roleCode: '',
    isActive: true,
    password: '',
  });

  useEffect(() => {
    if (me && me.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [me, router]);

  async function load() {
    const [u, r, c] = await Promise.all([
      api<UserRow[]>('/users'),
      api<Role[]>('/users/roles'),
      api<AccessArea[]>('/users/access-catalog'),
    ]);
    setUsers(u);
    setRoles(r);
    setCatalog(c.filter((a) => a.code !== '*'));
    if (!selectedId && u[0]) setSelectedId(u[0].id);
  }

  async function loadDetail(id: string) {
    if (!id) {
      setDetail(null);
      return;
    }
    const d = await api<UserRow>(`/users/${id}`);
    setDetail(d);
    setEditForm({
      fullName: d.fullName,
      email: d.email,
      phone: d.phone || '',
      roleCode: d.role.code,
      isActive: d.isActive,
      password: '',
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId).catch((e) => setError(e.message));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.code.toLowerCase().includes(q) ||
        (u.role.nameAr || '').includes(filter),
    );
  }, [users, filter]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === roleEditId) || null,
    [roles, roleEditId],
  );

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError('');
    try {
      const created = await api<UserRow>('/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setCreateForm({
        fullName: '',
        email: '',
        phone: '',
        password: '',
        roleCode: 'RECEPTION',
      });
      await load();
      setSelectedId(created.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy('save');
    setError('');
    try {
      const body: Record<string, unknown> = {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone || null,
        roleCode: editForm.roleCode,
        isActive: editForm.isActive,
      };
      if (editForm.password.trim()) body.password = editForm.password.trim();
      const updated = await api<UserRow>(`/users/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setDetail(updated);
      setEditForm((f) => ({ ...f, password: '' }));
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function startRoleEdit(role: Role) {
    setRoleEditId(role.id);
    setRolePerms([...role.permissions]);
  }

  function togglePerm(code: string) {
    setRolePerms((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  }

  async function saveRolePerms() {
    if (!roleEditId) return;
    setBusy('role');
    setError('');
    try {
      await api(`/users/roles/${roleEditId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: rolePerms }),
      });
      await load();
      if (selectedId) await loadDetail(selectedId);
      setRoleEditId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (me && me.role !== 'SUPER_ADMIN') {
    return null;
  }

  return (
    <AppShell>
      <PageHeader
        title="الحسابات والأدوار"
        subtitle="تحكم Super Admin في المستخدمين وصلاحيات كل دور"
      />
      <PageHero
        eyebrow="ACCESS CONTROL"
        title="من يشوف إيه؟"
        subtitle="أنشئ حسابات، غيّر الأدوار، وعطّل الحسابات، وعدّل صلاحيات كل دور"
        metrics={[
          { label: 'حسابات', value: users.length, highlight: true },
          {
            label: 'نشط',
            value: users.filter((u) => u.isActive).length,
          },
          { label: 'أدوار', value: roles.length },
          {
            label: 'معطّل',
            value: users.filter((u) => !u.isActive).length,
          },
        ]}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <SectionCard title="الحسابات" subtitle="اختر حسابًا لإدارة بياناته">
          <input
            className="field mb-3"
            placeholder="بحث بالاسم أو الإيميل أو الدور"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="space-y-2 max-h-[420px] overflow-auto mb-4">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-right transition ${
                    selectedId === u.id
                      ? 'bg-[#0B2545] text-white'
                      : 'bg-sand hover:bg-mist/80 text-navy'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">
                      {u.fullName}
                    </span>
                    {!u.isActive ? (
                      <span className="text-[10px] opacity-80">معطّل</span>
                    ) : null}
                  </span>
                  <span
                    className={`block text-[11px] truncate ${
                      selectedId === u.id ? 'text-white/60' : 'text-navy/45'
                    }`}
                  >
                    {u.email}
                  </span>
                  <span
                    className={`mt-1 inline-block text-[10px] font-bold ${
                      selectedId === u.id ? 'text-amber-300' : 'text-navy/55'
                    }`}
                  >
                    {ROLE_LABEL[u.role.code] || u.role.nameAr}
                  </span>
                </button>
              </li>
            ))}
            {!filtered.length ? <EmptyState>لا توجد نتائج</EmptyState> : null}
          </ul>

          <form
            onSubmit={createUser}
            className="space-y-2 border-t border-mist pt-4"
          >
            <p className="text-xs font-bold text-navy/55">إنشاء حساب جديد</p>
            <FieldLabel label="الاسم">
              <input
                className="field"
                required
                value={createForm.fullName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, fullName: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="البريد">
              <input
                className="field"
                type="email"
                required
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="الموبايل">
              <input
                className="field"
                value={createForm.phone}
                onChange={(e) =>
                  setCreateForm({ ...createForm, phone: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="كلمة المرور">
              <input
                className="field"
                type="password"
                required
                minLength={6}
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
              />
            </FieldLabel>
            <FieldLabel label="الدور">
              <select
                className="field"
                value={createForm.roleCode}
                onChange={(e) =>
                  setCreateForm({ ...createForm, roleCode: e.target.value })
                }
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.nameAr} ({r.code})
                  </option>
                ))}
              </select>
            </FieldLabel>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy === 'create'}
            >
              {busy === 'create' ? 'جاري الإنشاء…' : 'إنشاء الحساب'}
            </button>
          </form>
        </SectionCard>

        <div className="space-y-4">
          {detail ? (
            <>
              <SectionCard
                title={detail.fullName}
                subtitle={detail.email}
                badge={
                  <span className={detail.isActive ? 'badge-ok' : 'badge-warn'}>
                    {detail.isActive ? 'نشط' : 'معطّل'}
                  </span>
                }
              >
                <form
                  onSubmit={saveUser}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <FieldLabel label="الاسم">
                    <input
                      className="field"
                      required
                      value={editForm.fullName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, fullName: e.target.value })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="البريد">
                    <input
                      className="field"
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm({ ...editForm, email: e.target.value })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="الموبايل">
                    <input
                      className="field"
                      value={editForm.phone}
                      onChange={(e) =>
                        setEditForm({ ...editForm, phone: e.target.value })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel label="الدور">
                    <select
                      className="field"
                      value={editForm.roleCode}
                      onChange={(e) =>
                        setEditForm({ ...editForm, roleCode: e.target.value })
                      }
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.code}>
                          {r.nameAr}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="كلمة مرور جديدة (اختياري)">
                    <input
                      className="field"
                      type="password"
                      minLength={6}
                      value={editForm.password}
                      onChange={(e) =>
                        setEditForm({ ...editForm, password: e.target.value })
                      }
                      placeholder="اتركها فارغة للإبقاء على الحالية"
                    />
                  </FieldLabel>
                  <label className="flex items-center gap-2 text-sm text-navy/70 pt-6">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          isActive: e.target.checked,
                        })
                      }
                    />
                    الحساب نشط (يقدر يسجّل دخول)
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={busy === 'save'}
                    >
                      {busy === 'save' ? 'جاري الحفظ…' : 'حفظ التعديلات'}
                    </button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard
                title="ماذا يرى هذا الحساب؟"
                subtitle={`${detail.role.nameAr} · ${detail.role.code}`}
              >
                {detail.access?.isFullAccess ? (
                  <div className="rounded-xl bg-[#0B2545] text-white px-4 py-3">
                    <p className="font-bold text-amber-300">صلاحية كاملة</p>
                    <p className="text-sm text-white/70 mt-1">
                      يشوف ويدير كل صفحات النظام
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {(detail.access?.areas || []).map((a) => (
                      <li
                        key={a.code}
                        className="rounded-xl border border-mist bg-sand/50 px-3 py-2"
                      >
                        <p className="font-semibold text-navy text-sm">
                          {a.labelAr}
                        </p>
                        <p className="text-[11px] text-navy/45 mt-0.5 font-mono">
                          {a.routes.join(' · ')}
                        </p>
                      </li>
                    ))}
                    {!detail.access?.areas?.length ? (
                      <EmptyState>لا توجد صلاحيات مسجّلة لهذا الدور</EmptyState>
                    ) : null}
                  </ul>
                )}
                <p className="text-[11px] text-navy/40 mt-3">
                  أكواد الصلاحيات:{' '}
                  {(detail.access?.permissionCodes || detail.role.permissions).join(
                    ', ',
                  )}
                </p>
              </SectionCard>
            </>
          ) : (
            <SectionCard title="تفاصيل الحساب">
              <EmptyState>اختر حسابًا من القائمة</EmptyState>
            </SectionCard>
          )}

          <SectionCard
            title="الأدوار والصلاحيات"
            subtitle="عدّل ماذا يرى كل دور في النظام"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {roles.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-mist px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-navy">{r.nameAr}</p>
                      <p className="text-[11px] text-navy/45">
                        {r.code} · {r._count?.users ?? 0} حساب
                      </p>
                    </div>
                    {r.code !== 'SUPER_ADMIN' ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1"
                        onClick={() => startRoleEdit(r)}
                      >
                        تعديل
                      </button>
                    ) : (
                      <span className="badge-gold">ثابت</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.permissions.includes('*') ? (
                      <span className="soft-chip">كامل النظام</span>
                    ) : (
                      r.permissions.map((p) => (
                        <span key={p} className="soft-chip">
                          {catalog.find((c) => c.code === p)?.labelAr || p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedRole ? (
              <div className="mt-4 border-t border-mist pt-4">
                <p className="font-bold text-navy mb-2">
                  تعديل صلاحيات: {selectedRole.nameAr}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-3">
                  {catalog.map((a) => (
                    <label
                      key={a.code}
                      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                        rolePerms.includes(a.code)
                          ? 'border-[#C99612] bg-amber-50/60'
                          : 'border-mist bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 accent-[#0B2545]"
                        checked={rolePerms.includes(a.code)}
                        onChange={() => togglePerm(a.code)}
                      />
                      <span>
                        <span className="font-semibold text-navy block">
                          {a.labelAr}
                        </span>
                        <span className="text-[11px] text-navy/45 font-mono">
                          {a.routes.join(' · ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy === 'role'}
                    onClick={saveRolePerms}
                  >
                    {busy === 'role' ? 'جاري الحفظ…' : 'حفظ صلاحيات الدور'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setRoleEditId('')}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}

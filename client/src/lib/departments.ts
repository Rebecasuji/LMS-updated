import { supabase } from './supabaseClient';

export interface Department {
    id: string;
    name: string;
}

export async function getDepartments(): Promise<Department[]> {
    try {
        const { data, error } = await supabase.from('departments').select('id,name').order('name');
        if (error) throw error;
        return (data || []).map((d: any) => ({ id: String(d.id), name: d.name }));
    } catch (err) {
        console.error('Error fetching departments', err);
        return [];
    }
}

function friendlyError(error: any): string {
    if (error?.code === '23505') return 'A department with this name already exists.';
    if (error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || ''))
        return 'The departments table is missing. Run script/add_departments.sql in Supabase first.';
    return error?.message || 'Something went wrong.';
}

export async function createDepartment(name: string): Promise<{ ok: boolean; error?: string }> {
    const clean = name.trim();
    if (!clean) return { ok: false, error: 'Enter a department name.' };
    const { error } = await supabase.from('departments').insert({ name: clean });
    return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

export async function renameDepartment(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const clean = name.trim();
    if (!clean) return { ok: false, error: 'Enter a department name.' };
    const { error } = await supabase.from('departments').update({ name: clean }).eq('id', id);
    return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

// Employees in this department become "unassigned" (FK is ON DELETE SET NULL).
export async function deleteDepartment(id: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from('departments').delete().eq('id', id);
    return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

// Saves the Employees-page edit so it survives a refresh.
export async function saveEmployeeProfile(
    userId: string,
    employeeCode: string,
    values: { name: string; designation: string; departmentId: string | null }
): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase
        .from('users')
        .update({ designation: values.designation.trim() || null, department_id: values.departmentId })
        .eq('user_id', userId);
    if (error) {
        const msg = /column .* does not exist/i.test(error.message || '')
            ? 'Columns are missing. Run script/add_departments.sql in Supabase first.'
            : error.message;
        return { ok: false, error: msg };
    }

    // Name lives in users.name (best effort - ignored if that column is absent)
    if (values.name.trim()) {
        await supabase.from('users').update({ name: values.name.trim() }).eq('user_id', userId);
    }

    // Keep public.employees in step when a matching row exists (best effort)
    await supabase
        .from('employees')
        .update({ name: values.name.trim(), designation: values.designation.trim() || null })
        .eq('employee_code', employeeCode);

    return { ok: true };
}
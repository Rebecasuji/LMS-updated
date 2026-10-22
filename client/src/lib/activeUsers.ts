import { supabase } from './supabaseClient';

/**
 * Returns the set of identifiers (user_id AND username) belonging to inactive
 * users, so rows keyed by either one (leaves, permissions, comp-off, ...) can
 * be hidden. If the `is_active` column does not exist yet (migration not run),
 * the query errors and we return an empty set, i.e. nothing is hidden.
 */
export async function getInactiveUserKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    try {
        const { data, error } = await supabase
            .from('users')
            .select('user_id,username')
            .eq('is_active', false);
        if (error) return keys;
        (data || []).forEach((u: any) => {
            if (u.user_id) keys.add(String(u.user_id).toLowerCase());
            if (u.username) keys.add(String(u.username).toLowerCase());
        });
    } catch {
        /* ignore */
    }
    return keys;
}

export function isInactiveKey(keys: Set<string>, ...ids: Array<string | null | undefined>): boolean {
    return ids.some(id => id != null && id !== '' && keys.has(String(id).toLowerCase()));
}
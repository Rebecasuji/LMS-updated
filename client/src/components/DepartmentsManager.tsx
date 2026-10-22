import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import {
    Department,
    getDepartments,
    createDepartment,
    renameDepartment,
    deleteDepartment,
} from '@/lib/departments';
import { getAllUsersAsync } from '@/lib/storage';

export function DepartmentsManager() {
    const { toast } = useToast();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        const [deps, users] = await Promise.all([getDepartments(), getAllUsersAsync(true)]);
        const c: Record<string, number> = {};
        users.forEach((u) => {
            if (u.departmentId) c[u.departmentId] = (c[u.departmentId] || 0) + 1;
        });
        setDepartments(deps);
        setCounts(c);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const handleAdd = async () => {
        const res = await createDepartment(newName);
        if (!res.ok) {
            toast({ title: 'Could not add department', description: res.error, variant: 'destructive' });
            return;
        }
        toast({ title: 'Department added', description: `${newName.trim()} is now available for employees.`, className: 'bg-emerald-500 text-white border-none' });
        setNewName('');
        load();
    };

    const handleRename = async (id: string) => {
        const res = await renameDepartment(id, editName);
        if (!res.ok) {
            toast({ title: 'Could not rename', description: res.error, variant: 'destructive' });
            return;
        }
        setEditingId(null);
        load();
    };

    const handleDelete = async (d: Department) => {
        const n = counts[d.id] || 0;
        const msg = n
            ? `Delete "${d.name}"? ${n} employee(s) will become unassigned.`
            : `Delete "${d.name}"?`;
        if (!window.confirm(msg)) return;
        const res = await deleteDepartment(d.id);
        if (!res.ok) {
            toast({ title: 'Could not delete', description: res.error, variant: 'destructive' });
            return;
        }
        load();
    };

    return (
        <div className="space-y-6">
            <Card className="border-blue-200 shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-blue-600" />
                        Create Department
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                        Departments created here appear in the Department list when you edit an employee.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-end gap-3">
                        <div className="flex-1 w-full space-y-1">
                            <Label className="text-xs font-bold text-slate-700">Department Name</Label>
                            <Input
                                placeholder="e.g. Finance, Site Engineering, HR & Admin"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                className="bg-white border-slate-300"
                                data-testid="input-new-department"
                            />
                        </div>
                        <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-5 shrink-0" data-testid="button-add-department">
                            <Plus className="w-4 h-4" />
                            Add Department
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        Departments ({departments.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="text-slate-500 font-bold">Department</TableHead>
                                <TableHead className="text-slate-500 font-bold">Employees</TableHead>
                                <TableHead className="text-slate-500 font-bold w-32">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {departments.map((d) => (
                                <TableRow key={d.id}>
                                    <TableCell className="font-semibold text-slate-900">
                                        {editingId === d.id ? (
                                            <Input
                                                value={editName}
                                                autoFocus
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(d.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                className="h-8 max-w-xs bg-white"
                                            />
                                        ) : (
                                            d.name
                                        )}
                                    </TableCell>
                                    <TableCell className="text-slate-600">{counts[d.id] || 0}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            {editingId === d.id ? (
                                                <>
                                                    <Button size="sm" variant="outline" className="bg-green-50 text-green-600 border-green-100" onClick={() => handleRename(d.id)}>
                                                        <Check className="w-3 h-3" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                                        <X className="w-3 h-3" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100"
                                                        onClick={() => {
                                                            setEditingId(d.id);
                                                            setEditName(d.name);
                                                        }}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="bg-red-50 hover:bg-red-100 text-red-600 border-red-100" onClick={() => handleDelete(d)}>
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && departments.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                                        No departments yet. Create the first one above.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
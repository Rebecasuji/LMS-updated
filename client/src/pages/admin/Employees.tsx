import { getAllUsersAsync, setUserActive } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Edit2, Trash2, UserX, UserCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';

export default function Employees() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const { toast } = useToast();

  // Load from the database, including inactive employees (only visible on this page)
  useEffect(() => {
    getAllUsersAsync(true).then(setUsers);
  }, []);

  const filteredUsers = users.filter(u =>
    (showInactive || u.isActive !== false) &&
    (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.designation || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditDesignation(user.designation);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, name: editName, designation: editDesignation } : u));
    setEditingUser(null);
    toast({
      title: "Success",
      description: "Employee updated successfully",
      className: "bg-green-500/10 border-green-500/20 text-white"
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      setUsers(prev => prev.filter(u => u.id !== id));
      toast({
        title: "Success",
        description: "Employee deleted successfully",
        className: "bg-green-500/10 border-green-500/20 text-white"
      });
    }
  };

  const handleToggleActive = async (user: any) => {
    const makeActive = user.isActive === false;
    if (!makeActive) {
      if (currentUser && (currentUser.id === user.id || currentUser.code === user.code)) {
        toast({ title: "Not allowed", description: "You cannot deactivate your own account.", variant: "destructive" });
        return;
      }
      if (!window.confirm(`Mark ${user.name} as inactive? They will be hidden everywhere and cannot log in.`)) return;
    }
    const ok = await setUserActive(user.id, user.code, makeActive);
    if (!ok) {
      toast({ title: "Error", description: "Could not update status. Has the is_active column been added?", variant: "destructive" });
      return;
    }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: makeActive } : u));
    toast({
      title: "Success",
      description: `${user.name} is now ${makeActive ? 'active' : 'inactive'}`,
      className: "bg-green-500/10 border-green-500/20 text-white"
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Employees Directory</h2>
          <p className="text-slate-600">Manage employee details and roles</p>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-96">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white border-slate-200 text-slate-900 focus:border-primary/50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} data-testid="checkbox-show-inactive" />
            Show inactive employees
          </label>
        </div>
      </div>

      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-200">
                <TableHead className="text-slate-500 font-bold">Code</TableHead>
                <TableHead className="text-slate-500 font-bold">Name</TableHead>
                <TableHead className="text-slate-500 font-bold">Designation</TableHead>
                <TableHead className="text-slate-500 font-bold">Role</TableHead>
                <TableHead className="text-slate-500 font-bold">Status</TableHead>
                <TableHead className="text-slate-500 font-bold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className={`hover:bg-slate-50/50 border-slate-100 transition-colors ${user.isActive === false ? "opacity-60" : ""}`} data-testid={`row-employee-${user.id}`}>
                  <TableCell className="font-mono text-primary font-medium">{user.code}</TableCell>
                  <TableCell className="font-bold text-slate-900">{user.name}</TableCell>
                  <TableCell className="text-slate-600">{user.designation}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'} className={user.role === 'Admin' ? 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20' : 'bg-slate-100 text-slate-600'}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${user.isActive === false ? 'bg-slate-400' : 'bg-green-500'}`}></span>
                    <span className="text-xs text-slate-500 font-medium">{user.isActive === false ? 'Inactive' : 'Active'}</span>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100"
                      onClick={() => handleEdit(user)}
                      data-testid={`button-edit-${user.id}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={user.isActive === false ? "bg-green-50 hover:bg-green-100 text-green-600 border-green-100" : "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-100"}
                      onClick={() => handleToggleActive(user)}
                      title={user.isActive === false ? "Activate" : "Deactivate"}
                      data-testid={`button-toggle-active-${user.id}`}
                    >
                      {user.isActive === false ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-red-50 hover:bg-red-100 text-red-600 border-red-100"
                      onClick={() => handleDelete(user.id, user.name)}
                      data-testid={`button-delete-${user.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Designation</Label>
              <Input
                value={editDesignation}
                onChange={(e) => setEditDesignation(e.target.value)}
                className="bg-white border-slate-200 text-slate-900"
                data-testid="input-edit-designation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="text-slate-600 border-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-save-edit"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
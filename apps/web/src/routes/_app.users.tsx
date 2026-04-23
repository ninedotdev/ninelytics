import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  IconPlus,
  IconDots,
  IconSearch,
  IconFilter,
  IconX,
  IconTrash,
  IconUserCog,
  IconChevronDown,
  IconCheck,
  IconEye,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { sileo } from "sileo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

const inviteUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"], {
    message: "Please select a role",
  }),
});

type InviteUserFormData = z.infer<typeof inviteUserSchema>;

type FilterRole = "ALL" | "ADMIN" | "OWNER" | "VIEWER";
type SortField = "name" | "email" | "createdAt" | "lastActive" | "role";
type SortDirection = "asc" | "desc";

function UsersPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<FilterRole>("ALL");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showBulkRoleDialog, setShowBulkRoleDialog] = useState(false);
  const [bulkNewRole, setBulkNewRole] = useState<"ADMIN" | "OWNER" | "VIEWER">("VIEWER");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
  });

  const { data: usersData = [], isLoading: loadingUsers, refetch: refetchUsers } = trpc.users.list.useQuery({
    search: searchQuery || undefined,
    role: filterRole !== "ALL" ? filterRole : undefined,
  });

  const users = usersData;
  const loading = loadingUsers;

  const inviteUser = trpc.users.invite.useMutation({
    onSuccess: () => {
      setIsInviteDialogOpen(false);
      reset();
      sileo.success({ title: "User invitation sent successfully!" });
      refetchUsers();
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to send invitation" });
    },
  });

  const onSubmit = async (data: InviteUserFormData) => {
    setIsSubmitting(true);
    try {
      await inviteUser.mutateAsync(data);
    } catch {
      // Error handling is done in mutation callback
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      refetchUsers();
      sileo.success({ title: "User role updated successfully!" });
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to update user role" });
    },
  });

  const updateUserRole = async (userId: string, newRole: string) => {
    await updateUser.mutateAsync({
      id: userId,
      data: { role: newRole as "ADMIN" | "OWNER" | "VIEWER" },
    });
  };

  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      refetchUsers();
      sileo.success({ title: "User removed successfully!" });
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to remove user" });
    },
  });

  const removeUser = async (userId: string) => {
    await deleteUser.mutateAsync({ id: userId });
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(
        Array.from(selectedUsers).map((userId) =>
          deleteUser.mutateAsync({ id: userId })
        )
      );
      setSelectedUsers(new Set());
      setShowBulkDeleteDialog(false);
      sileo.success({ title: `${selectedUsers.size} user(s) removed successfully!` });
    } catch {
      sileo.error({ title: "Error removing users" });
    }
  };

  const handleBulkRoleChange = async () => {
    try {
      await Promise.all(
        Array.from(selectedUsers).map((userId) =>
          updateUser.mutateAsync({
            id: userId,
            data: { role: bulkNewRole },
          })
        )
      );
      setSelectedUsers(new Set());
      setShowBulkRoleDialog(false);
      sileo.success({ title: `${selectedUsers.size} user(s) role updated successfully!` });
    } catch {
      sileo.error({ title: "Error updating users" });
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "ADMIN": return "destructive" as const;
      case "OWNER": return "default" as const;
      case "VIEWER": return "secondary" as const;
      default: return "secondary" as const;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const filteredUsers = users
    .filter((user) => {
      const matchesSearch =
        (user.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = filterRole === "ALL" || user.role === filterRole;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      let aValue: string | number, bValue: string | number;
      switch (sortField) {
        case "name": aValue = (a.name || "").toLowerCase(); bValue = (b.name || "").toLowerCase(); break;
        case "email": aValue = a.email.toLowerCase(); bValue = b.email.toLowerCase(); break;
        case "createdAt": aValue = new Date(a.createdAt).getTime(); bValue = new Date(b.createdAt).getTime(); break;
        case "lastActive": aValue = new Date(a.createdAt).getTime(); bValue = new Date(b.createdAt).getTime(); break;
        case "role": aValue = a.role; bValue = b.role; break;
      }
      if (sortDirection === "asc") return aValue > bValue ? 1 : -1;
      return aValue < bValue ? 1 : -1;
    });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <IconPlus size={16} className="mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
                <DialogDescription>
                  Send an invitation to a new team member to join your analytics dashboard.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="user@example.com" {...register("email")} />
                  {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select onValueChange={(value) => setValue("role", value as "ADMIN" | "OWNER" | "VIEWER")}>
                    <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">
                        <div className="flex flex-col">
                          <p className="font-medium">Viewer</p>
                          <p className="text-xs text-gray-500">Can view analytics data</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="OWNER">
                        <div className="flex flex-col">
                          <p className="font-medium">Owner</p>
                          <p className="text-xs text-gray-500">Can manage websites and view analytics</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="ADMIN">
                        <div className="flex flex-col">
                          <p className="font-medium">Admin</p>
                          <p className="text-xs text-gray-500">Full access to all features</p>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.role && <p className="text-sm text-red-600">{errors.role.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Sending..." : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Total Users</p><p className="text-2xl font-semibold mt-1">{users.length}</p></CardContent></Card>
          <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Admins</p><p className="text-2xl font-semibold mt-1">{users.filter((u) => u.role === "ADMIN").length}</p></CardContent></Card>
          <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Owners</p><p className="text-2xl font-semibold mt-1">{users.filter((u) => u.role === "OWNER").length}</p></CardContent></Card>
          <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Viewers</p><p className="text-2xl font-semibold mt-1">{users.filter((u) => u.role === "VIEWER").length}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Search users by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
                <IconFilter size={16} />
                Filters
                {filterRole !== "ALL" && <Badge variant="secondary" className="ml-1">1</Badge>}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    Sort by
                    <IconChevronDown size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => { setSortField("createdAt"); setSortDirection("desc"); }}>
                    <div className="flex items-center justify-between w-full">
                      <span>Newest first</span>
                      {sortField === "createdAt" && sortDirection === "desc" && <IconCheck size={16} />}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortField("createdAt"); setSortDirection("asc"); }}>
                    <div className="flex items-center justify-between w-full">
                      <span>Oldest first</span>
                      {sortField === "createdAt" && sortDirection === "asc" && <IconCheck size={16} />}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setSortField("name"); setSortDirection("asc"); }}>
                    <div className="flex items-center justify-between w-full">
                      <span>Name (A-Z)</span>
                      {sortField === "name" && sortDirection === "asc" && <IconCheck size={16} />}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortField("name"); setSortDirection("desc"); }}>
                    <div className="flex items-center justify-between w-full">
                      <span>Name (Z-A)</span>
                      {sortField === "name" && sortDirection === "desc" && <IconCheck size={16} />}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setSortField("role"); setSortDirection("asc"); }}>
                    <div className="flex items-center justify-between w-full">
                      <span>Role</span>
                      {sortField === "role" && <IconCheck size={16} />}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {selectedUsers.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="secondary" className="text-sm">{selectedUsers.size} selected</Badge>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkRoleDialog(true)} className="gap-2">
                    <IconUserCog size={16} />
                    Change Role
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkDeleteDialog(true)} className="gap-2 text-red-600 hover:text-red-700">
                    <IconTrash size={16} />
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUsers(new Set())}>
                    <IconX size={16} />
                  </Button>
                </div>
              )}
            </div>

            {showFilters && (
              <div className="flex items-center gap-4 pt-4 border-t">
                <Label className="text-sm font-medium">Role:</Label>
                <div className="flex gap-2">
                  <Button variant={filterRole === "ALL" ? "default" : "outline"} size="sm" onClick={() => setFilterRole("ALL")}>All</Button>
                  <Button variant={filterRole === "ADMIN" ? "default" : "outline"} size="sm" onClick={() => setFilterRole("ADMIN")}>Admin</Button>
                  <Button variant={filterRole === "OWNER" ? "default" : "outline"} size="sm" onClick={() => setFilterRole("OWNER")}>Owner</Button>
                  <Button variant={filterRole === "VIEWER" ? "default" : "outline"} size="sm" onClick={() => setFilterRole("VIEWER")}>Viewer</Button>
                </div>
                {filterRole !== "ALL" && (
                  <Button variant="ghost" size="sm" onClick={() => setFilterRole("ALL")} className="ml-auto">Clear filters</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center"><p className="text-muted-foreground">No users found</p></div>
            ) : (
              <div className="divide-y">
                <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-4 py-3 bg-muted/50 text-xs font-medium text-muted-foreground items-center">
                  <Checkbox checked={selectedUsers.size === filteredUsers.length} onCheckedChange={toggleAllUsers} />
                  <span>User</span>
                  <span className="w-20">Role</span>
                  <span className="w-24">Websites</span>
                  <span className="w-24">Joined</span>
                  <span className="w-8"></span>
                </div>

                {filteredUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    <Checkbox checked={selectedUsers.has(user.id)} onCheckedChange={() => toggleUserSelection(user.id)} className="shrink-0" />
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => router.navigate({ to: `/users/${user.id}` })}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.navigate({ to: `/users/${user.id}` }); }}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={user.image || undefined} alt={user.name || ""} />
                        <AvatarFallback className="text-xs">{getInitials(user.name || user.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                        <p className="text-xs text-muted-foreground truncate hidden sm:block">{user.email}</p>
                      </div>
                    </div>
                    <Badge variant={getRoleBadgeVariant(user.role)} className="shrink-0 text-[10px]">{user.role}</Badge>
                    <span className="hidden md:inline text-xs text-muted-foreground w-24 shrink-0">{user._count.ownedWebsites} sites</span>
                    <span className="hidden md:inline text-xs text-muted-foreground w-24 shrink-0">{formatRelativeDate(user.createdAt)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0">
                          <IconDots size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.navigate({ to: `/users/${user.id}` })}>
                          <IconEye size={16} className="mr-2" />
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => updateUserRole(user.id, "VIEWER")}>Set as Viewer</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateUserRole(user.id, "OWNER")}>Set as Owner</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateUserRole(user.id, "ADMIN")}>Set as Admin</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => removeUser(user.id)} className="text-red-600 focus:text-red-600">
                          <IconTrash size={16} className="mr-2" />
                          Remove User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground text-center">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedUsers.size} user(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} variant="destructive">
              Delete {selectedUsers.size} User(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showBulkRoleDialog} onOpenChange={setShowBulkRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for {selectedUsers.size} User(s)</DialogTitle>
            <DialogDescription>Select the new role to assign to the selected users.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Role</Label>
              <Select value={bulkNewRole} onValueChange={(v) => setBulkNewRole(v as "ADMIN" | "OWNER" | "VIEWER")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkRoleDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkRoleChange}>Update {selectedUsers.size} User(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

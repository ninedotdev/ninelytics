import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  IconArrowLeft,
  IconMail,
  IconShield,
  IconCalendar,
  IconGlobe,
  IconChartBar,
  IconActivity,
  IconClock,
  IconTrash,
  IconUserCog,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sileo } from "sileo";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/users/$id")({
  component: UserProfilePage,
});

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OWNER" | "VIEWER";
  image?: string;
  createdAt: string;
  lastActive?: string;
  _count: {
    ownedWebsites: number;
    websiteAccess: number;
  };
  ownedWebsites: {
    id: string;
    name: string;
    url: string;
    createdAt: string;
  }[];
  websites: {
    id: string;
    website: {
      id: string;
      name: string;
      url: string;
    };
    accessLevel: string;
    grantedAt: string;
  }[];
  activityLog: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }[];
}

function UserProfilePage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newRole, setNewRole] = useState<string>("");

  const { data: userData, isLoading: loadingUser, error: userError } = trpc.users.byId.useQuery(
    { id }
  );

  useEffect(() => {
    if (userData) {
      const mappedUser: UserDetail = {
        ...userData,
        name: userData.name || "",
        image: userData.image ?? undefined,
        websites: userData.websiteAccess.map((access) => ({
          id: access.id,
          website: access.website,
          accessLevel: access.accessLevel,
          grantedAt: access.createdAt,
        })),
      };
      setUser(mappedUser);
      setNewRole(userData.role);
    }
    setLoading(loadingUser);
  }, [userData, loadingUser]);

  useEffect(() => {
    if (userError) {
      sileo.error({ title: "Failed to fetch user details" });
      router.navigate({ to: "/users" });
    }
  }, [userError, router]);

  const updateUser = trpc.users.update.useMutation({
    onSuccess: (updatedUser) => {
      setUser(updatedUser as UserDetail);
      sileo.success({ title: "User role updated successfully!" });
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to update user role" });
    },
  });

  const updateUserRole = async () => {
    if (!user || newRole === user.role) return;
    await updateUser.mutateAsync({
      id: user.id,
      data: { role: newRole as "ADMIN" | "OWNER" | "VIEWER" },
    });
  };

  const deleteUserMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      sileo.success({ title: "User removed successfully!" });
      router.navigate({ to: "/users" });
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to remove user" });
    },
  });

  const deleteUser = async () => {
    if (!user) return;
    await deleteUserMutation.mutateAsync({ id: user.id });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "OWNER":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "VIEWER":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return formatDate(dateString);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "website_created":
      case "website_updated":
        return <IconGlobe size={16} />;
      case "website_deleted":
        return <IconTrash size={16} />;
      case "role_changed":
        return <IconUserCog size={16} />;
      case "analytics_viewed":
        return <IconChartBar size={16} />;
      case "login":
        return <IconActivity size={16} />;
      default:
        return <IconActivity size={16} />;
    }
  };

  const getActionText = (activity: UserDetail["activityLog"][0]) => {
    const metadata = activity.metadata || {};
    switch (activity.action) {
      case "website_created":
        return `Created website "${metadata.websiteName || "Unknown"}"`;
      case "website_updated":
        return `Updated website "${metadata.websiteName || "Unknown"}"`;
      case "website_deleted":
        return `Deleted website "${metadata.websiteName || "Unknown"}"`;
      case "role_changed":
        return `Role changed from ${metadata.oldRole} to ${metadata.newRole}`;
      case "analytics_viewed":
        return `Viewed analytics for "${metadata.websiteName || "Unknown"}"`;
      case "login":
        return "Logged in to the dashboard";
      default:
        return activity.action.replace(/_/g, " ");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-32" />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <div className="flex gap-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.navigate({ to: "/users" })}
            className="gap-2"
          >
            <IconArrowLeft size={16} />
            Back to Users
          </Button>
        </div>

        {/* User Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user.image} alt={user.name} />
                  <AvatarFallback className="text-2xl">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold">{user.name}</h1>
                    <Badge className={getRoleColor(user.role)}>
                      {user.role}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <IconMail size={16} />
                      {user.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <IconCalendar size={16} />
                      Joined {formatDate(user.createdAt)}
                    </div>
                  </div>

                  {user.lastActive && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <IconClock size={16} />
                      Last active {formatRelativeTime(user.lastActive)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 hover:text-red-700"
                >
                  <IconTrash size={16} className="mr-2" />
                  Delete User
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <IconGlobe size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Owned Websites
                  </p>
                  <p className="text-2xl font-semibold">
                    {user._count.ownedWebsites}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <IconShield size={24} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Shared Access
                  </p>
                  <p className="text-2xl font-semibold">
                    {user._count.websiteAccess}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <IconActivity size={24} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Activity
                  </p>
                  <p className="text-2xl font-semibold">
                    {user.activityLog?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="websites" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="websites">Websites</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Websites Tab */}
          <TabsContent value="websites" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Owned Websites</CardTitle>
                <CardDescription>
                  Websites created and managed by this user
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user.ownedWebsites.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No owned websites
                  </p>
                ) : (
                  <div className="space-y-3">
                    {user.ownedWebsites.map((website) => (
                      <div
                        key={website.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => router.navigate({ to: `/websites/${website.id}` })}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                            <IconGlobe size={20} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium">{website.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {website.url}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Created {formatDate(website.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shared Access</CardTitle>
                <CardDescription>
                  Websites this user has access to
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user.websites.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No shared websites
                  </p>
                ) : (
                  <div className="space-y-3">
                    {user.websites.map((access) => (
                      <div
                        key={access.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() =>
                          router.navigate({ to: `/websites/${access.website.id}` })
                        }
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded">
                            <IconShield size={20} className="text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="font-medium">{access.website.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {access.website.url}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{access.accessLevel}</Badge>
                          <span className="text-sm text-muted-foreground">
                            Since {formatDate(access.grantedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <CardDescription>Recent actions and events</CardDescription>
              </CardHeader>
              <CardContent>
                {!user.activityLog || user.activityLog.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">
                    No activity recorded yet
                  </p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border"></div>
                    <div className="space-y-6">
                      {user.activityLog.map((activity) => (
                        <div key={activity.id} className="relative flex gap-4">
                          <div className="relative z-10 flex items-center justify-center w-12 h-12 bg-background border-2 border-border rounded-full">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                              {getActionIcon(activity.action)}
                            </div>
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-foreground">
                                  {getActionText(activity)}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {formatDateTime(activity.timestamp)}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(activity.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>User Settings</CardTitle>
                <CardDescription>
                  Manage user role and permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <div className="flex items-center gap-4">
                      <Select value={newRole} onValueChange={setNewRole}>
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIEWER">
                            <div className="flex flex-col">
                              <span className="font-medium">Viewer</span>
                              <span className="text-xs text-muted-foreground">
                                Can view analytics data
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="OWNER">
                            <div className="flex flex-col">
                              <span className="font-medium">Owner</span>
                              <span className="text-xs text-muted-foreground">
                                Can manage websites and view analytics
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="ADMIN">
                            <div className="flex flex-col">
                              <span className="font-medium">Admin</span>
                              <span className="text-xs text-muted-foreground">
                                Full access to all features
                              </span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {newRole !== user.role && (
                        <Button onClick={updateUserRole}>Update Role</Button>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-red-600">
                      Danger Zone
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Permanently remove this user and all associated data
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                    >
                      <IconTrash size={16} className="mr-2" />
                      Delete User
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {user.name} and remove all their data
              from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteUser}
              variant="destructive"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Label({
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className="text-sm font-medium text-foreground"
      {...props}
    >
      {children}
    </label>
  );
}

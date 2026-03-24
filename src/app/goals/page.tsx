"use client";

import { useState, useEffect, useMemo } from "react";
import {
  IconPlus,
  IconDots,
  IconPencil,
  IconTrash,
  IconChartBar,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sileo } from "sileo";
import { useForm } from "react-hook-form";
import { api } from "@/utils/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { useRouter } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const goalSchema = z.object({
  websiteId: z.string().min(1, "Please select a website"),
  name: z.string().min(1, "Goal name is required"),
  description: z.string().optional(),
  type: z.enum(["PAGEVIEW", "EVENT", "DURATION", "REVENUE", "SEARCH_POSITION", "SEARCH_CLICKS"]),
  targetValue: z.string().min(1, "Target value is required"),
  targetQuery: z.string().optional(),
  threshold: z.number().min(1, "Threshold must be at least 1"),
  targetUnit: z.enum(["TOTAL", "PER_SESSION", "PER_VISITOR"]),
  isActive: z.boolean().optional(),
});

type GoalFormData = z.infer<typeof goalSchema>;

interface Website {
  id: string;
  name: string;
  url: string;
}

interface Goal {
  id: string;
  websiteId: string;
  name: string;
  description: string | null;
  type: "PAGEVIEW" | "EVENT" | "DURATION" | "REVENUE" | "SEARCH_POSITION" | "SEARCH_CLICKS";
  targetValue: string;
  targetQuery?: string | null;
  threshold: number;
  targetUnit: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    conversions: number;
  };
}

export default function GoalsPage() {
  const router = useRouter();
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GoalFormData>({
    resolver: zodResolver(goalSchema),
  });

  const watchType = watch("type");

  const { data: websitesData } = api.websites.optimized.useQuery()
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : []
    return items.map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? ""),
      url: String(w.url ?? ""),
    }))
  }, [websitesData])

  // Initialize selectedWebsite only once when websites are loaded
  const initialWebsite = useMemo(() => {
    if (websites.length === 0) return "";
    return websites[0]?.id ?? "";
  }, [websites]);

  const effectiveSelectedWebsite = selectedWebsite || initialWebsite;

  // Fetch top search queries for the selected website (for SEARCH goal types)
  const { data: searchQueries } = api.goals.topSearchQueries.useQuery(
    { websiteId: effectiveSelectedWebsite },
    { enabled: !!effectiveSelectedWebsite && (watchType === "SEARCH_POSITION" || watchType === "SEARCH_CLICKS") }
  );

  // Sync form field with selected website only when it changes
  useEffect(() => {
    if (effectiveSelectedWebsite && effectiveSelectedWebsite !== watch("websiteId")) {
      setValue("websiteId", effectiveSelectedWebsite, {
        shouldDirty: false,
        shouldValidate: false,
      })
    }
  }, [effectiveSelectedWebsite, setValue, watch])

  // Set initial website when websites load
  useEffect(() => {
    if (!selectedWebsite && initialWebsite) {
      setSelectedWebsite(initialWebsite);
    }
  }, [initialWebsite, selectedWebsite]);

  const { data: goalsData = [], isLoading: loadingGoals, refetch: refetchGoals } = api.goals.list.useQuery(
    { websiteId: effectiveSelectedWebsite },
    { enabled: !!effectiveSelectedWebsite }
  );

  const goals = goalsData;
  const loading = loadingGoals;

  const createGoal = api.goals.create.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Goal created successfully!" });
      reset();
      setIsCreateDialogOpen(false);
      refetchGoals();
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to create goal" });
    },
  });

  const updateGoalMutation = api.goals.update.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Goal updated successfully!" });
      reset();
      setIsEditDialogOpen(false);
      setEditingGoal(null);
      refetchGoals();
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to update goal" });
    },
  });

  const deleteGoal = api.goals.delete.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Goal deleted successfully!" });
      setShowDeleteDialog(false);
      setGoalToDelete(null);
      refetchGoals();
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to delete goal" });
    },
  });

  const toggleGoalStatusMutation = api.goals.update.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Goal status updated" });
      refetchGoals();
    },
    onError: (error) => {
      sileo.error({ title: error.message || "Failed to update goal status" });
    },
  });

  const onSubmit = async (data: GoalFormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        isActive: data.isActive !== undefined ? data.isActive : true,
      };

      if (editingGoal) {
        await updateGoalMutation.mutateAsync({
          id: editingGoal.id,
          data: payload,
        });
      } else {
        await createGoal.mutateAsync(payload);
      }
    } catch {
      // Error handling is done in mutation callbacks
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setValue("websiteId", goal.websiteId);
    setValue("name", goal.name);
    setValue("description", goal.description || "");
    setValue("type", goal.type);
    setValue("targetValue", goal.targetValue);
    setValue("targetQuery", goal.targetQuery || "");
    setValue("threshold", goal.threshold);
    setValue(
      "targetUnit",
      goal.targetUnit as "TOTAL" | "PER_SESSION" | "PER_VISITOR"
    );
    setValue("isActive", goal.isActive);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!goalToDelete) return;
    await deleteGoal.mutateAsync({ id: goalToDelete.id });
  };

  const toggleGoalStatus = async (goal: Goal) => {
    await toggleGoalStatusMutation.mutateAsync({
      id: goal.id,
      data: { isActive: !goal.isActive },
    });
  };

  const getGoalTypeLabel = (type: string) => {
    switch (type) {
      case "PAGEVIEW":
        return "Page View";
      case "EVENT":
        return "Custom Event";
      case "DURATION":
        return "Time on Site";
      default:
        return type;
    }
  };

  const getGoalTypeColor = (type: string) => {
    switch (type) {
      case "PAGEVIEW":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "EVENT":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400";
      case "DURATION":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const totalConversions = goals.reduce(
    (sum, goal) => sum + goal._count.conversions,
    0
  );
  const activeGoals = goals.filter((g) => g.isActive).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <Select value={effectiveSelectedWebsite} onValueChange={setSelectedWebsite}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a website" />
              </SelectTrigger>
              <SelectContent>
                {websites.map((website) => (
                  <SelectItem key={website.id} value={website.id}>
                    {website.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => {
                setEditingGoal(null);
                reset();
                if (selectedWebsite) {
                  setValue("websiteId", selectedWebsite);
                }
                setIsCreateDialogOpen(true);
              }}
            >
              <IconPlus size={16} className="mr-2" />
              Create Goal
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Total Goals</p>
              <p className="text-2xl font-semibold mt-1">{goals.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Active Goals</p>
              <p className="text-2xl font-semibold mt-1">{activeGoals}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Total Conversions</p>
              <p className="text-2xl font-semibold mt-1">{totalConversions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Avg. per Goal</p>
              <p className="text-2xl font-semibold mt-1">
                {goals.length > 0
                  ? Math.round(totalConversions / goals.length)
                  : 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Goals List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">All Goals</CardTitle>
            <CardDescription>
              {selectedWebsite
                ? `Manage goals for ${websites.find((w) => w.id === selectedWebsite)?.name || "this website"}`
                : "Select a website to view goals"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4 flex-1">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-5 w-20" />
                        </div>
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                      <div className="px-4 border-l space-y-1">
                        <Skeleton className="h-8 w-10" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Skeleton className="h-6 w-10 rounded-full" />
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : goals.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No goals created yet
                </p>
                <Button
                  onClick={() => {
                    if (selectedWebsite) {
                      setValue("websiteId", selectedWebsite);
                    }
                    setIsCreateDialogOpen(true);
                  }}
                  variant="outline"
                >
                  Create Your First Goal
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">
                            {goal.name}
                          </h3>
                          <Badge className={getGoalTypeColor(goal.type)}>
                            {getGoalTypeLabel(goal.type)}
                          </Badge>
                          {!goal.isActive && (
                            <Badge variant="outline" className="text-gray-500">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {goal.description && (
                          <p className="text-sm text-muted-foreground mb-1">
                            {goal.description}
                          </p>
                        )}
                        <p className="text-sm text-gray-500">
                          Target:{" "}
                          {goal.type === "PAGEVIEW" && <span className="font-mono">{goal.targetValue}</span>}
                          {goal.type === "EVENT" && <span className="font-mono">{goal.targetValue}</span>}
                          {goal.type === "DURATION" && <><span className="font-mono">{goal.targetValue}</span> seconds</>}
                          {goal.type === "REVENUE" && <>${(parseInt(goal.targetValue) / 100).toFixed(0)}/day</>}
                          {goal.type === "SEARCH_POSITION" && <>top {goal.targetValue} for &quot;{goal.targetQuery}&quot;</>}
                          {goal.type === "SEARCH_CLICKS" && <>{goal.targetValue}+ clicks for &quot;{goal.targetQuery}&quot;</>}
                        </p>
                        <p className="text-sm text-gray-500">
                          Achieves when: {goal.threshold}x{" "}
                          {goal.targetUnit === "TOTAL"
                            ? "(all time)"
                            : goal.targetUnit === "PER_SESSION"
                              ? "(per session)"
                              : "(per visitor)"}
                        </p>
                      </div>

                      <div className="text-center px-4 border-l">
                        <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                          {goal._count.conversions}
                        </div>
                        <div className="text-xs text-gray-500">conversions</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={goal.isActive}
                        onCheckedChange={() => toggleGoalStatus(goal)}
                      />

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <IconDots size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/goals/${goal.id}`)}
                          >
                            <IconChartBar size={16} className="mr-2" />
                            View Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(goal)}>
                            <IconPencil size={16} className="mr-2" />
                            Edit Goal
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setGoalToDelete(goal);
                              setShowDeleteDialog(true);
                            }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <IconTrash size={16} className="mr-2" />
                            Delete Goal
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            setEditingGoal(null);
            reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingGoal ? "Edit Goal" : "Create New Goal"}
            </DialogTitle>
            <DialogDescription>
              {editingGoal
                ? "Update your goal configuration"
                : "Define a new goal to track conversions"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="websiteId">Website</Label>
              <Select
                value={watch("websiteId")}
                onValueChange={(value) => setValue("websiteId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a website" />
                </SelectTrigger>
                <SelectContent>
                  {websites.map((website) => (
                    <SelectItem key={website.id} value={website.id}>
                      {website.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.websiteId && (
                <p className="text-sm text-red-600">
                  {errors.websiteId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Goal Name</Label>
              <Input
                id="name"
                placeholder="e.g., Newsletter Signup"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe your goal..."
                {...register("description")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Goal Type</Label>
              <Select
                value={watch("type")}
                onValueChange={(value) =>
                  setValue("type", value as "PAGEVIEW" | "EVENT" | "DURATION")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAGEVIEW">Page View</SelectItem>
                  <SelectItem value="EVENT">Custom Event</SelectItem>
                  <SelectItem value="DURATION">Time on Site</SelectItem>
                  <SelectItem value="REVENUE">Revenue (Stripe)</SelectItem>
                  <SelectItem value="SEARCH_POSITION">Search Position (GSC)</SelectItem>
                  <SelectItem value="SEARCH_CLICKS">Search Clicks (GSC)</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-sm text-red-600">{errors.type.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetValue">Target Value</Label>
              {(watchType === "SEARCH_POSITION" || watchType === "SEARCH_CLICKS") && (
                <div className="space-y-2 mb-3">
                  <Label>Search Query</Label>
                  {searchQueries && searchQueries.length > 0 ? (
                    <Select
                      value={watch("targetQuery") || ""}
                      onValueChange={(v) => setValue("targetQuery", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a query from your Search Console data" />
                      </SelectTrigger>
                      <SelectContent>
                        {searchQueries.map((q) => (
                          <SelectItem key={q.query} value={q.query}>
                            <span className="flex items-center justify-between w-full gap-4">
                              <span className="truncate">{q.query}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {q.clicks} clicks · pos {q.avgPosition}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-sm text-muted-foreground py-3 text-center border rounded-md">
                      No Search Console data synced yet. Sync data first in website settings.
                    </div>
                  )}
                </div>
              )}
              <Input
                id="targetValue"
                placeholder={
                  watchType === "PAGEVIEW" ? "/thank-you"
                    : watchType === "EVENT" ? "button_click"
                    : watchType === "DURATION" ? "60"
                    : watchType === "REVENUE" ? "10000"
                    : watchType === "SEARCH_POSITION" ? "3"
                    : watchType === "SEARCH_CLICKS" ? "100"
                    : ""
                }
                {...register("targetValue")}
              />
              <p className="text-xs text-gray-500">
                {watchType === "PAGEVIEW" &&
                  "Enter the page path (e.g., /thank-you)"}
                {watchType === "EVENT" &&
                  "Enter the event name (e.g., button_click)"}
                {watchType === "DURATION" &&
                  "Enter duration in seconds (e.g., 60)"}
                {watchType === "REVENUE" &&
                  "Daily revenue target in cents (e.g., 10000 = $100)"}
                {watchType === "SEARCH_POSITION" &&
                  "Maximum average position (e.g., 3 = rank in top 3)"}
                {watchType === "SEARCH_CLICKS" &&
                  "Minimum clicks in last 30 days (e.g., 100)"}
              </p>
              {errors.targetValue && (
                <p className="text-sm text-red-600">
                  {errors.targetValue.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="threshold">Threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  min="1"
                  placeholder="1"
                  {...register("threshold", { valueAsNumber: true })}
                />
                <p className="text-xs text-gray-500">
                  Number of times to achieve the goal
                </p>
                {errors.threshold && (
                  <p className="text-sm text-red-600">
                    {errors.threshold.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetUnit">Count Per</Label>
                <Select
                  value={watch("targetUnit")}
                  onValueChange={(value) =>
                    setValue(
                      "targetUnit",
                      value as "TOTAL" | "PER_SESSION" | "PER_VISITOR"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TOTAL">Total (All Time)</SelectItem>
                    <SelectItem value="PER_SESSION">Per Session</SelectItem>
                    <SelectItem value="PER_VISITOR">Per Visitor</SelectItem>
                  </SelectContent>
                </Select>
                {errors.targetUnit && (
                  <p className="text-sm text-red-600">
                    {errors.targetUnit.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={watch("isActive")}
                onCheckedChange={(checked) => setValue("isActive", checked)}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setIsEditDialogOpen(false);
                  setEditingGoal(null);
                  reset();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingGoal
                    ? "Update Goal"
                    : "Create Goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the goal &ldquo;{goalToDelete?.name}
              &rdquo; and all its conversion data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              variant="destructive"
            >
              Delete Goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

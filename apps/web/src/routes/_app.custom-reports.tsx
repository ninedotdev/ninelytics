import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  IconPlus,
  IconTrash,
  IconPlayerPlay,
  IconCopy,
  IconDotsVertical,
  IconClock,
  IconGlobe,
  IconEye,
  IconUsers,
  IconTrendingUp,
  IconPointer,
  IconActivity,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sileo } from "sileo";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/custom-reports")({
  component: CustomReportsPage,
});

interface Website {
  id: string;
  name: string;
  url: string;
}

interface CustomReport {
  id: string;
  websiteId: string;
  name: string;
  description?: string;
  metrics: string[];
  filters?: Record<string, string>;
  schedule?: string;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  website: {
    id: string;
    name: string;
    url: string;
  };
  user: {
    id: string;
    name?: string;
    email: string;
  };
}

const METRIC_GROUPS = [
  {
    label: "Traffic",
    metrics: [
      { id: "pageViews", name: "Page Views", icon: IconEye, color: "bg-blue-500" },
      { id: "uniqueVisitors", name: "Unique Visitors", icon: IconUsers, color: "bg-green-500" },
      { id: "bounceRate", name: "Bounce Rate", icon: IconTrendingUp, color: "bg-orange-500" },
      { id: "avgSessionDuration", name: "Avg Session Duration", icon: IconClock, color: "bg-purple-500" },
      { id: "topPages", name: "Top Pages", icon: IconActivity, color: "bg-pink-500" },
      { id: "deviceBreakdown", name: "Device Breakdown", icon: IconPointer, color: "bg-cyan-500" },
    ],
  },
  {
    label: "Search Console",
    metrics: [
      { id: "searchClicks", name: "Search Clicks", icon: IconPointer, color: "bg-amber-500" },
      { id: "searchImpressions", name: "Search Impressions", icon: IconEye, color: "bg-amber-400" },
      { id: "searchPosition", name: "Avg Position", icon: IconTrendingUp, color: "bg-amber-600" },
      { id: "topQueries", name: "Top Queries", icon: IconActivity, color: "bg-amber-500" },
    ],
  },
  {
    label: "Revenue",
    metrics: [
      { id: "revenue", name: "Revenue", icon: IconActivity, color: "bg-emerald-500" },
      { id: "charges", name: "Charges", icon: IconPointer, color: "bg-emerald-400" },
      { id: "newCustomers", name: "New Customers", icon: IconUsers, color: "bg-emerald-600" },
    ],
  },
];

const AVAILABLE_METRICS = METRIC_GROUPS.flatMap((g) => g.metrics);

function CustomReportsPage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("ALL");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    websiteId: "",
    name: "",
    description: "",
    metrics: [] as string[],
    filters: {} as Record<string, string>,
    schedule: "",
    isPublic: false,
  });

  const { data: websitesData } = trpc.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : [];
    return items.map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? ""),
      url: String(w.url ?? ""),
    }));
  }, [websitesData]);

  const { data: reportsData = [], isLoading: loadingReports, refetch: refetchReports } = trpc.customReports.list.useQuery(
    {
      websiteId: selectedWebsite !== "ALL" ? selectedWebsite : undefined,
    },
    { enabled: true }
  );

  const reports = reportsData as CustomReport[];
  const loading = loadingReports;

  const createReport = trpc.customReports.create.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Report created successfully!" });
      setIsCreateDialogOpen(false);
      resetForm();
      refetchReports();
    },
    onError: (error: { message?: string }) => {
      sileo.error({ title: error.message || "Failed to create report" });
    },
  });

  const deleteReport = trpc.customReports.delete.useMutation({
    onSuccess: () => {
      sileo.success({ title: "Report deleted successfully" });
      refetchReports();
    },
    onError: (error: { message?: string }) => {
      sileo.error({ title: error.message || "Failed to delete report" });
    },
  });

  const handleCreateReport = async () => {
    if (!formData.websiteId || !formData.name || formData.metrics.length === 0) {
      sileo.error({ title: "Please fill in all required fields" });
      return;
    }

    try {
      const dataToSend = {
        ...formData,
        schedule: formData.schedule === "NONE" ? undefined : formData.schedule,
      };

      await createReport.mutateAsync(dataToSend);
    } catch {
      // Error handling is done in mutation callback
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      await deleteReport.mutateAsync({ id });
      setReportToDelete(null);
    } catch {
      setReportToDelete(null);
    }
  };

  const handleExecuteReport = (report: CustomReport) => {
    window.open(`/custom-reports/${report.id}/view`, "_blank");
  };

  const handleDuplicateReport = async (report: CustomReport) => {
    const newReport = {
      websiteId: report.websiteId,
      name: `${report.name} (Copy)`,
      description: report.description,
      metrics: report.metrics,
      filters: report.filters || {},
      schedule: report.schedule,
      isPublic: false,
    };

    try {
      await createReport.mutateAsync(newReport);
    } catch {
      // Error handling is done in mutation callback
    }
  };

  const toggleMetric = (metricId: string) => {
    setFormData((prev) => ({
      ...prev,
      metrics: prev.metrics.includes(metricId)
        ? prev.metrics.filter((m) => m !== metricId)
        : [...prev.metrics, metricId],
    }));
  };

  const resetForm = () => {
    setFormData({
      websiteId: "",
      name: "",
      description: "",
      metrics: [],
      filters: {},
      schedule: "",
      isPublic: false,
    });
  };

  const getMetricInfo = (metricId: string) => {
    return AVAILABLE_METRICS.find((m) => m.id === metricId);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredReports = reports.filter((report) => {
    if (selectedWebsite === "ALL") return true;
    return report.websiteId === selectedWebsite;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        >
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <IconPlus size={16} className="mr-2" />
              New Report
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Report</DialogTitle>
              <DialogDescription>
                Select metrics and configure your custom report
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="website">Website *</Label>
                <Select
                  value={formData.websiteId}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, websiteId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select website" />
                  </SelectTrigger>
                  <SelectContent>
                    {websites.map((website) => (
                      <SelectItem key={website.id} value={website.id}>
                        {website.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Report Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Weekly Traffic Report"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this report tracks..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label>Metrics * (Select at least one)</Label>
                {METRIC_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.metrics.map((metric) => {
                        const Icon = metric.icon;
                        const isSelected = formData.metrics.includes(metric.id);
                        return (
                          <button
                            key={metric.id}
                            type="button"
                            onClick={() => toggleMetric(metric.id)}
                            className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                            }`}
                          >
                            <div className={`p-2 rounded ${metric.color} bg-opacity-10`}>
                              <Icon size={16} />
                            </div>
                            <span className="text-sm font-medium">{metric.name}</span>
                            {isSelected && (
                              <span className="ml-auto text-blue-500">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule (Optional)</Label>
                <Select
                  value={formData.schedule}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, schedule: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No schedule</SelectItem>
                    <SelectItem value="0 9 * * 1">Weekly (Monday 9 AM)</SelectItem>
                    <SelectItem value="0 9 * * *">Daily (9 AM)</SelectItem>
                    <SelectItem value="0 9 1 * *">Monthly (1st at 9 AM)</SelectItem>
                  </SelectContent>
                </Select>
                {formData.schedule && formData.schedule !== "NONE" && (
                  <p className="text-xs text-gray-500">
                    Future feature: Reports will be automatically generated and emailed
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="public"
                  checked={formData.isPublic}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isPublic: checked }))
                  }
                />
                <Label htmlFor="public" className="cursor-pointer">
                  Make this report public (visible to all team members)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateReport}>Create Report</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="filter-website">Filter by Website</Label>
              <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
                <SelectTrigger>
                  <SelectValue placeholder="All websites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All websites</SelectItem>
                  {websites.map((website) => (
                    <SelectItem key={website.id} value={website.id}>
                      {website.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-24 ml-auto" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IconActivity size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {reports.length === 0 ? "No reports yet" : "No reports match the filter"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {reports.length === 0
                ? "Create your first custom report to get started"
                : "Try selecting a different website"}
            </p>
            {reports.length === 0 && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <IconPlus size={16} className="mr-2" />
                Create Report
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <Card key={report.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{report.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {report.website.name}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <IconDotsVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExecuteReport(report)}>
                        <IconPlayerPlay size={16} className="mr-2" />
                        Run Report
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateReport(report)}>
                        <IconCopy size={16} className="mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setReportToDelete(report.id)}
                        className="text-red-600"
                      >
                        <IconTrash size={16} className="mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {report.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {report.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {report.metrics.map((metricId) => {
                    const metric = getMetricInfo(metricId);
                    if (!metric) return null;
                    const Icon = metric.icon;
                    return (
                      <Badge key={metricId} variant="secondary" className="gap-1">
                        <Icon size={12} />
                        {metric.name}
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {report.schedule && (
                    <div className="flex items-center gap-1">
                      <IconClock size={12} />
                      Scheduled
                    </div>
                  )}
                  {report.isPublic && (
                    <div className="flex items-center gap-1">
                      <IconGlobe size={12} />
                      Public
                    </div>
                  )}
                  <div className="ml-auto">Updated {formatDate(report.updatedAt)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!reportToDelete}
        onOpenChange={() => setReportToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reportToDelete && handleDeleteReport(reportToDelete)}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

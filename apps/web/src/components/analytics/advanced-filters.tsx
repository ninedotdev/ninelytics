
import { useState } from "react";
import { IconFilter, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export interface FilterValues {
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
}

interface AdvancedFiltersProps {
  filters: FilterValues;
  onFiltersChange: (filters: FilterValues) => void;
  availableDevices?: string[];
  availableBrowsers?: string[];
  availableOS?: string[];
  availableCountries?: string[];
}

export function AdvancedFilters({
  filters,
  onFiltersChange,
  availableDevices = ["Desktop", "Mobile", "Tablet"],
  availableBrowsers = ["Chrome", "Safari", "Firefox", "Edge"],
  availableOS = ["Windows", "MacOS", "Linux", "iOS", "Android"],
  availableCountries = [],
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount = Object.keys(filters).filter(
    (key) => filters[key as keyof FilterValues]
  ).length;

  const handleFilterChange = (
    key: keyof FilterValues,
    value: string | undefined
  ) => {
    const newFilters = { ...filters };
    if (value && value !== "all") {
      newFilters[key] = value;
    } else {
      delete newFilters[key];
    }
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const removeFilter = (key: keyof FilterValues) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
  };

  return (
    <div className="space-y-3">
      {/* Filter Button */}
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <IconFilter size={16} />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Advanced Filters</h4>
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-auto p-1 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <Separator />

              {/* Device Type */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Device Type</Label>
                <Select
                  value={filters.device || "all"}
                  onValueChange={(value) => handleFilterChange("device", value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All devices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All devices</SelectItem>
                    {availableDevices.map((device) => (
                      <SelectItem key={device} value={device}>
                        {device}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Browser */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Browser</Label>
                <Select
                  value={filters.browser || "all"}
                  onValueChange={(value) =>
                    handleFilterChange("browser", value)
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All browsers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All browsers</SelectItem>
                    {availableBrowsers.map((browser) => (
                      <SelectItem key={browser} value={browser}>
                        {browser}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operating System */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Operating System</Label>
                <Select
                  value={filters.os || "all"}
                  onValueChange={(value) => handleFilterChange("os", value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All OS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All OS</SelectItem>
                    {availableOS.map((os) => (
                      <SelectItem key={os} value={os}>
                        {os}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Country */}
              {availableCountries.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Country</Label>
                  <Select
                    value={filters.country || "all"}
                    onValueChange={(value) =>
                      handleFilterChange("country", value)
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All countries</SelectItem>
                      {availableCountries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* City */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">City</Label>
                <Input
                  placeholder="Enter city name"
                  value={filters.city || ""}
                  onChange={(e) =>
                    handleFilterChange("city", e.target.value || undefined)
                  }
                  className="h-9"
                />
              </div>

              <Separator />

              {/* Traffic Source */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Traffic Source</Label>
                <Select
                  value={filters.source || "all"}
                  onValueChange={(value) => handleFilterChange("source", value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="organic">Organic Search</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Medium */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Medium</Label>
                <Input
                  placeholder="e.g., cpc, email"
                  value={filters.medium || ""}
                  onChange={(e) =>
                    handleFilterChange("medium", e.target.value || undefined)
                  }
                  className="h-9"
                />
              </div>

              {/* Campaign */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Campaign</Label>
                <Input
                  placeholder="Campaign name"
                  value={filters.campaign || ""}
                  onChange={(e) =>
                    handleFilterChange("campaign", e.target.value || undefined)
                  }
                  className="h-9"
                />
              </div>

              {/* Referrer */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Referrer Domain</Label>
                <Input
                  placeholder="e.g., google.com"
                  value={filters.referrer || ""}
                  onChange={(e) =>
                    handleFilterChange("referrer", e.target.value || undefined)
                  }
                  className="h-9"
                />
              </div>

              <Separator />

              <Button
                onClick={() => setIsOpen(false)}
                className="w-full"
                size="sm"
              >
                Apply Filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Active Filters Display */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="gap-2"
          >
            Clear all filters
            <IconX size={12} />
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => {
            if (!value) return null;
            return (
              <Badge key={key} variant="secondary" className="gap-2 pr-1">
                <span className="text-xs">
                  <span className="font-semibold capitalize">{key}:</span>{" "}
                  {value}
                </span>
                <button
                  onClick={() => removeFilter(key as keyof FilterValues)}
                  className="ml-1 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-700 p-0.5"
                >
                  <IconX size={12} />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

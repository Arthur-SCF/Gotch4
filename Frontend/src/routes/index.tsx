import { createFileRoute } from "@tanstack/react-router";
import { DashboardKpiCards } from "@/components/DashboardKpiCards";
import { DashboardEventsChart } from "@/components/DashboardEventsChart";
import { DashboardMethodChart } from "@/components/DashboardMethodChart";
import { DashboardLiveFeed } from "@/components/DashboardLiveFeed";
import { DashboardProgramsTree } from "@/components/DashboardProgramsTree";
import { DashboardQuickActions } from "@/components/DashboardQuickActions";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Row 1 — KPI cards */}
          <DashboardKpiCards />

          {/* Row 2 — Activity chart + Method breakdown */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-3 lg:px-6">
            <div className="lg:col-span-2">
              <DashboardEventsChart />
            </div>
            <DashboardMethodChart />
          </div>

          {/* Row 3 — Live feed + Programs */}
          <div
            className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6"
            style={{ minHeight: "320px" }}
          >
            <DashboardLiveFeed />
            <DashboardProgramsTree />
          </div>

          {/* Row 4 — Quick actions */}
          <div className="px-4 lg:px-6">
            <DashboardQuickActions />
          </div>
        </div>
      </div>
    </div>
  );
}

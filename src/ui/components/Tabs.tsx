// Tabs with their panel: shadcn/ui's Tabs, underlined (its "line" variant).
import type { ReactNode } from "react";
import { Tabs as UiTabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Option } from "./Segmented.tsx";

/** `end`: what stands at the end of the tabs' row, such as a search box; it is not a tab. */
export function Tabs<V extends string>({ label, value, tabs, onChange, end, children }: { label: string; value: V; tabs: Option<V>[]; onChange: (value: V) => void; end?: ReactNode; children: ReactNode }) {
  return (
    <UiTabs value={value} onValueChange={(next) => onChange(next as V)} className="ds-tabs-wrap">
      <div className="flex flex-wrap items-center gap-2.5 border-b">
        <TabsList variant="line" aria-label={label}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.count !== undefined && <span className="text-muted-foreground tabular-nums">{tab.count}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        {end && <div className="ml-auto">{end}</div>}
      </div>
      <TabsContent value={value}>{children}</TabsContent>
    </UiTabs>
  );
}

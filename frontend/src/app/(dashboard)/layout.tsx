import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar />
      {/* Push content past the fixed sidebar on desktop */}
      <div className="lg:pl-[260px]">
        <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

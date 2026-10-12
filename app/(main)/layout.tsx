import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { NotificationProvider } from "@/components/providers/notification-provider";

const MainLayout = async ({
  children
}: {
  children: React.ReactNode;
}) => {
  return (
    <div className="h-full">
      <NotificationProvider />
      <div className="hidden md:flex h-full w-[68px] z-30 flex-col fixed inset-y-0">
        <NavigationSidebar />
      </div>
      <main className="md:pl-[68px] h-full">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
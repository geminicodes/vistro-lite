import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, LayoutDashboard, Globe, User, LogOut } from "lucide-react";
import { mockAuth } from "@/lib/mockAuth";
import { useToast } from "@/hooks/use-toast";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path);

  const handleSignOut = async () => {
    await mockAuth.signOut();
    toast({
      title: "Signed out successfully",
    });
    navigate("/");
  };

  const user = mockAuth.getCurrentUser();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            <span>Vistro Lite</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <aside className="md:col-span-3">
            <nav className="space-y-1">
              <Link to="/dashboard">
                <Button
                  variant={isActive("/dashboard") && location.pathname === "/dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Overview
                </Button>
              </Link>
              <Link to="/dashboard/sites">
                <Button
                  variant={isActive("/dashboard/sites") ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Sites
                </Button>
              </Link>
              <Link to="/dashboard/account">
                <Button
                  variant={isActive("/dashboard/account") ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <User className="w-4 h-4 mr-2" />
                  Account
                </Button>
              </Link>
            </nav>
          </aside>

          <main className="md:col-span-9">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

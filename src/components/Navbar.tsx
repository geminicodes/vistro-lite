import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, LogOut } from "lucide-react";
import { mockAuth } from "@/lib/mockAuth";
import { useToast } from "@/hooks/use-toast";

export const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isActive = (path: string) => location.pathname === path;
  const isAuthenticated = mockAuth.isAuthenticated();
  const user = mockAuth.getCurrentUser();

  const handleLogout = async () => {
    await mockAuth.signOut();
    toast({
      title: "Signed out successfully",
    });
    navigate("/");
  };

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
          <Sparkles className="w-5 h-5 text-primary" />
          <span>Vistro Lite</span>
        </Link>
        
        <div className="hidden md:flex items-center gap-6">
          <a 
            href="#features" 
            className="text-sm transition-colors hover:text-primary text-muted-foreground"
          >
            Product
          </a>
          <Link 
            to="/pricing" 
            className={`text-sm transition-colors hover:text-primary ${
              isActive("/pricing") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Pricing
          </Link>
          <Link 
            to="/docs" 
            className={`text-sm transition-colors hover:text-primary ${
              isActive("/docs") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/dashboard">
                  {user?.name || user?.email?.split('@')[0]}
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild className="gradient-primary text-white hover:opacity-90 transition-opacity">
                <Link to="/auth">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AddSiteDialog } from "@/components/AddSiteDialog";
import { mockData } from "@/lib/mockData";
import { mockAuth } from "@/lib/mockAuth";
import { Globe, ExternalLink, Calendar, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const isAuthenticated = mockAuth.isAuthenticated();
  const sites = mockData.getSites();

  const handleMagicLinkSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await mockAuth.signIn(email);
      toast({
        title: "Welcome!",
        description: "You've been signed in successfully",
      });
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Show login card if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pastel-yellow via-pastel-pink to-pastel-cyan flex items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute top-20 left-10 w-24 h-24 bg-pastel-cyan rotate-12 border-2 border-foreground" />
        <div className="absolute top-32 right-20 w-20 h-20 bg-pastel-pink -rotate-12 border-2 border-foreground" />
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-pastel-yellow rounded-full border-2 border-foreground" />
        
        <div className="w-full max-w-md relative z-10">
          <div className="bg-background border-2 border-foreground rounded-2xl p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="w-8 h-8 text-foreground" />
                <span className="text-2xl font-bold">Vistro-Lite</span>
              </div>
              <h1 className="text-xl font-bold">Sign In to Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Enter your email to access your sites
              </p>
            </div>
            
            <form onSubmit={handleMagicLinkSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-semibold">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="border-2 border-foreground/20 focus:border-foreground rounded-xl h-12"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-xl h-12 font-semibold" 
                disabled={loading}
              >
                {loading ? "Sending magic link..." : "Send Magic Link"}
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Don't have an account? Sign in to create one.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show dashboard with sites list if authenticated
  return (
    <DashboardLayout>
      <div className="space-y-8" key={refreshKey}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">My Sites</h1>
            <p className="text-muted-foreground">Manage your translation configurations</p>
          </div>
          <AddSiteDialog onSiteAdded={() => setRefreshKey(prev => prev + 1)} />
        </div>

        {sites.length === 0 ? (
          <div className="bg-pastel-yellow border-2 border-foreground rounded-2xl p-12 text-center">
            <Globe className="w-16 h-16 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No sites yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first site to start translating your content into multiple languages
            </p>
            <AddSiteDialog onSiteAdded={() => setRefreshKey(prev => prev + 1)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site, index) => {
              const colors = ["bg-pastel-yellow", "bg-pastel-pink", "bg-pastel-cyan", "bg-pastel-purple", "bg-pastel-green"];
              const bgColor = colors[index % colors.length];
              
              return (
                <div 
                  key={site.id} 
                  className={`${bgColor} border-2 border-foreground rounded-2xl p-6 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 cursor-pointer`}
                  onClick={() => navigate(`/dashboard/sites/${site.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{site.name}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <ExternalLink className="w-3 h-3" />
                        {site.domain}
                      </p>
                    </div>
                    <Badge className="bg-foreground text-background border-0">Active</Badge>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Translations</span>
                      <span className="font-bold">{site.translationCount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Created
                      </span>
                      <span className="font-bold">
                        {new Date(site.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    className="w-full border-2 border-foreground bg-background hover:bg-foreground hover:text-background rounded-xl font-semibold"
                    asChild
                  >
                    <Link to={`/dashboard/sites/${site.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
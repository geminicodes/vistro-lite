import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/DashboardLayout";
import { mockAuth } from "@/lib/mockAuth";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, LogOut, CreditCard, Shield } from "lucide-react";

const Account = () => {
  const user = mockAuth.getCurrentUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await mockAuth.signOut();
    toast({
      title: "Signed out successfully",
    });
    navigate("/");
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-black">Account Settings</h1>
          <p className="text-muted-foreground">Manage your account preferences</p>
        </div>

        {/* Profile Information */}
        <div className="bg-pastel-cyan border-2 border-foreground rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </h2>
          <div className="space-y-4">
            <div className="bg-background border-2 border-foreground rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-pastel-yellow border-2 border-foreground rounded-full flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-bold">{user?.name || "Not set"}</p>
              </div>
            </div>
            <div className="bg-background border-2 border-foreground rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-pastel-pink border-2 border-foreground rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-bold">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-pastel-yellow border-2 border-foreground rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Subscription
          </h2>
          <div className="bg-background border-2 border-foreground rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">Free Beta</p>
                <p className="text-sm text-muted-foreground">
                  Enjoy free access during beta period
                </p>
              </div>
              <span className="bg-pastel-green border-2 border-foreground px-3 py-1 rounded-full text-sm font-semibold">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-pastel-purple border-2 border-foreground rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </h2>
          <div className="bg-background border-2 border-foreground rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Your account is secured with email-based authentication.
            </p>
            <Button 
              variant="outline"
              className="border-2 border-foreground hover:bg-foreground hover:text-background rounded-xl font-semibold"
            >
              Change Password
            </Button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-pastel-pink border-2 border-foreground rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <LogOut className="w-5 h-5" />
            Session
          </h2>
          <div className="bg-background border-2 border-foreground rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Sign out of your account on this device.
            </p>
            <Button 
              onClick={handleSignOut}
              className="bg-foreground text-background hover:bg-foreground/90 rounded-xl font-semibold"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Account;
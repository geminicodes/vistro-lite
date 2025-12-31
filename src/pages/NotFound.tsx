import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Sparkles } from "lucide-react";

const NotFound = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pastel-yellow via-pastel-pink to-pastel-cyan flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative shapes */}
      <div className="absolute top-20 left-10 w-24 h-24 bg-pastel-cyan rotate-12 border-2 border-foreground" />
      <div className="absolute top-32 right-20 w-20 h-20 bg-pastel-pink -rotate-12 border-2 border-foreground" />
      <div className="absolute bottom-20 right-10 w-32 h-32 bg-pastel-yellow rounded-full border-2 border-foreground" />
      
      <div className="text-center relative z-10">
        <div className="bg-background border-2 border-foreground rounded-2xl p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles className="w-8 h-8 text-foreground" />
            <span className="text-xl font-bold">Vistro-Lite</span>
          </div>
          
          <h1 className="text-8xl font-black mb-4 bg-gradient-to-r from-pastel-pink via-pastel-purple to-pastel-cyan bg-clip-text text-transparent">
            404
          </h1>
          
          <p className="text-2xl font-bold text-foreground mb-2">
            Oops! Page not found
          </p>
          <p className="text-muted-foreground mb-8 max-w-md">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <Button 
            asChild
            className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-8 py-6 text-lg font-semibold"
          >
            <Link to="/">
              <Home className="w-5 h-5 mr-2" />
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
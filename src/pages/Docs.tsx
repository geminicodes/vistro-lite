import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, Twitter, Github, Linkedin, Copy, Check } from "lucide-react";
import { useState } from "react";

const Docs = () => {
  const [copied, setCopied] = useState(false);

  const codeSnippet = `<script src="https://vistro-lite.com/script.js"></script>
<script>
  VistroLite.init({
    apiKey: 'your-api-key',
    languages: ['en', 'es', 'pt', 'ru']
  });
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-foreground bg-background sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="w-5 h-5" />
            <span>Vistro-Lite</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/#features" className="text-sm font-medium hover:text-foreground/70 transition-colors">Features</Link>
            <Link to="/pricing" className="text-sm font-medium hover:text-foreground/70 transition-colors">Pricing</Link>
            <Link to="/#languages" className="text-sm font-medium hover:text-foreground/70 transition-colors">Languages</Link>
            <Link to="/#integration" className="text-sm font-medium hover:text-foreground/70 transition-colors">Integration</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm font-medium hover:text-foreground/70 transition-colors">
              Sign In
            </Link>
            <Button asChild className="bg-pastel-pink hover:bg-pastel-pink/80 text-foreground border-2 border-foreground rounded-xl font-semibold">
              <Link to="/auth">Start Free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 bg-gradient-to-br from-pastel-cyan/30 via-pastel-pink/20 to-pastel-yellow/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <span className="inline-block bg-pastel-cyan border-2 border-foreground px-4 py-1 rounded-full text-sm font-semibold mb-4">
              📚 DOCUMENTATION
            </span>
            <h1 className="text-4xl md:text-5xl font-black mb-4">Get Started</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Everything you need to integrate Vistro-Lite into your website.
            </p>
          </div>
        </div>
      </section>

      {/* Documentation Content */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-8">
            {/* Quick Start */}
            <div className="bg-pastel-yellow border-2 border-foreground rounded-2xl p-6">
              <h2 className="text-2xl font-bold mb-6">Quick Start</h2>
              
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-foreground text-background rounded-lg flex items-center justify-center font-bold flex-shrink-0">1</div>
                  <div>
                    <h3 className="font-bold mb-1">Sign up and create a site</h3>
                    <p className="text-muted-foreground">
                      Create a free account and add your website to get your unique site key.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-foreground text-background rounded-lg flex items-center justify-center font-bold flex-shrink-0">2</div>
                  <div>
                    <h3 className="font-bold mb-1">Add the script to your site</h3>
                    <p className="text-muted-foreground mb-3">
                      Copy and paste this code before the closing <code className="bg-foreground/10 px-2 py-0.5 rounded font-mono text-sm">&lt;/head&gt;</code> tag:
                    </p>
                    <div className="bg-foreground text-background rounded-xl p-4 relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-background/50">index.html</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-background/70 hover:text-background hover:bg-background/10 h-8"
                          onClick={handleCopy}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      <pre className="text-sm overflow-x-auto">
                        <code>{codeSnippet}</code>
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-foreground text-background rounded-lg flex items-center justify-center font-bold flex-shrink-0">3</div>
                  <div>
                    <h3 className="font-bold mb-1">That's it!</h3>
                    <p className="text-muted-foreground">
                      Your site will now automatically translate content based on visitor language preferences.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* How it Works */}
            <div className="bg-pastel-pink border-2 border-foreground rounded-2xl p-6">
              <h2 className="text-2xl font-bold mb-4">How it Works</h2>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  Vistro Lite automatically detects your visitor's language from their browser settings.
                  When a visitor arrives, we translate your content in real-time and cache it for instant delivery.
                </p>
                <p>
                  All translations are SEO-friendly and indexed by search engines, helping you reach a global audience.
                </p>
              </div>
            </div>

            {/* Supported Platforms */}
            <div className="bg-pastel-cyan border-2 border-foreground rounded-2xl p-6">
              <h2 className="text-2xl font-bold mb-4">Supported Platforms</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {["WordPress", "Shopify", "Webflow", "Wix", "Squarespace", "Custom HTML", "React", "Any Website"].map((platform) => (
                  <div key={platform} className="bg-background border-2 border-foreground rounded-xl p-3 text-center font-medium">
                    {platform}
                  </div>
                ))}
              </div>
            </div>

            {/* Need Help */}
            <div className="bg-pastel-purple border-2 border-foreground rounded-2xl p-6">
              <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
              <p className="text-muted-foreground mb-4">
                Contact us at{" "}
                <a href="mailto:support@vistrolite.com" className="text-foreground font-semibold hover:underline">
                  support@vistrolite.com
                </a>{" "}
                and we'll help you get set up.
              </p>
              <Button asChild className="bg-foreground text-background hover:bg-foreground/90 rounded-xl font-semibold">
                <a href="mailto:support@vistrolite.com">Contact Support</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" />
                <span className="font-bold">Vistro-Lite</span>
              </div>
              <p className="text-sm text-background/70">
                AI-powered translation for modern creators.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-background/70">
                <li><Link to="/#features" className="hover:text-background transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-background transition-colors">Pricing</Link></li>
                <li><Link to="/#integration" className="hover:text-background transition-colors">Integration</Link></li>
                <li><Link to="/docs" className="hover:text-background transition-colors">Documentation</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-background/70">
                <li><a href="#" className="hover:text-background transition-colors">About</a></li>
                <li><a href="#" className="hover:text-background transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-background transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-background transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-background/70">
                <li><a href="#" className="hover:text-background transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-background transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-background transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-background/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-background/70">
              © 2024 Vistro-Lite. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="w-10 h-10 rounded-full border border-background/20 flex items-center justify-center hover:bg-background/10 transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full border border-background/20 flex items-center justify-center hover:bg-background/10 transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full border border-background/20 flex items-center justify-center hover:bg-background/10 transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Docs;
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Globe, 
  Zap, 
  Code, 
  ShoppingBag, 
  Square, 
  Layers, 
  Copy, 
  Bot, 
  RefreshCw, 
  TrendingUp,
  Check,
  Star,
  Twitter,
  Facebook,
  Linkedin
} from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header/Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <Globe className="w-6 h-6" />
            Vistro-Lite
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">Pricing</a>
            <a href="#languages" className="text-sm font-medium hover:text-primary transition-colors">Languages</a>
            <a href="#integration" className="text-sm font-medium hover:text-primary transition-colors">Integration</a>
          </nav>
          
          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm font-medium hover:text-primary transition-colors">Sign In</Link>
            <Button asChild className="bg-pastel-pink text-black hover:bg-pastel-pink/90">
              <Link to="/auth">Start Free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pastel-yellow via-pastel-pink to-pastel-cyan py-20 md:py-32">
        {/* Decorative shapes */}
        <div className="absolute top-10 left-10 w-32 h-32 bg-pastel-cyan rounded-lg rotate-12 opacity-60"></div>
        <div className="absolute top-20 right-20 w-24 h-24 bg-pastel-pink rounded-lg rotate-15 opacity-60"></div>
        <div className="absolute bottom-20 right-32 w-40 h-40 bg-pastel-yellow rounded-full opacity-60"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge className="bg-white text-black hover:bg-white border-2 border-black">
              <Check className="w-3 h-3 mr-1" />
              BETA VERSION - AI POWERED
            </Badge>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-black">
              Translate Your Store{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                In One Click
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-black/80 max-w-2xl mx-auto">
              Perfect for Shopify, Webflow & Wix stores
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="bg-black text-white hover:bg-black/90 rounded-xl px-8">
                Get Started Free
              </Button>
              <Button size="lg" variant="outline" className="bg-white text-black border-2 border-black hover:bg-white/90 rounded-xl px-8">
                Watch Demo
              </Button>
            </div>
            
            {/* User avatars and rating */}
            <div className="flex flex-col items-center gap-3 pt-8">
              <div className="flex items-center -space-x-2">
                <div className="w-10 h-10 rounded-full bg-pastel-purple border-2 border-white flex items-center justify-center text-sm font-bold">JD</div>
                <div className="w-10 h-10 rounded-full bg-pastel-cyan border-2 border-white flex items-center justify-center text-sm font-bold">SM</div>
                <div className="w-10 h-10 rounded-full bg-pastel-pink border-2 border-white flex items-center justify-center text-sm font-bold">AL</div>
                <div className="w-10 h-10 rounded-full bg-pastel-green border-2 border-white flex items-center justify-center text-sm font-bold">RK</div>
                <div className="w-10 h-10 rounded-full bg-pastel-orange border-2 border-white flex items-center justify-center text-sm font-bold">TP</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm font-medium text-black">500+ creators trust Vistro-Lite</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Integration Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">WORKS SEAMLESSLY WITH</Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 max-w-5xl mx-auto">
            <Card className="border-2 border-black bg-pastel-yellow hover:scale-105 transition-transform">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <ShoppingBag className="w-12 h-12 mb-3" />
                <p className="font-bold">Shopify</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-pink hover:scale-105 transition-transform">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <Square className="w-12 h-12 mb-3" />
                <p className="font-bold">Squarespace</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-cyan hover:scale-105 transition-transform">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <Layers className="w-12 h-12 mb-3" />
                <p className="font-bold">Wix</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-purple hover:scale-105 transition-transform">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <Globe className="w-12 h-12 mb-3" />
                <p className="font-bold">WordPress</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-green hover:scale-105 transition-transform">
              <CardContent className="flex flex-col items-center justify-center p-6">
                <Code className="w-12 h-12 mb-3" />
                <p className="font-bold">Custom Code</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-pastel-pink text-black hover:bg-pastel-pink">FEATURES</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Everything You Need</h2>
            <p className="text-muted-foreground text-lg">All the tools to make your store multilingual</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="border-2 border-black bg-pastel-yellow hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <Copy className="w-10 h-10 mb-2" />
                <CardTitle>Copy & Paste</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">Simple integration with just one line of code</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-pink hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <Bot className="w-10 h-10 mb-2" />
                <CardTitle>AI Powered</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">Smart translation powered by advanced AI</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-purple hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <Zap className="w-10 h-10 mb-2" />
                <CardTitle>Instant Setup</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">Go live in under 2 minutes</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-cyan hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <Globe className="w-10 h-10 mb-2" />
                <CardTitle>4 Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">English, Russian, Spanish, Portuguese</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-green hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <RefreshCw className="w-10 h-10 mb-2" />
                <CardTitle>Auto-Update</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">Translations update automatically</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black bg-pastel-orange hover:scale-105 hover:shadow-xl transition-all">
              <CardHeader>
                <TrendingUp className="w-10 h-10 mb-2" />
                <CardTitle>SEO Friendly</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">Optimized for search engines</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section id="languages" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-pastel-cyan text-black hover:bg-pastel-cyan">LANGUAGES</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Speak to the World</h2>
            <p className="text-muted-foreground text-lg">Connect with customers in their native language</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-12">
            <Card className="border-2 border-black hover:scale-105 transition-transform">
              <CardHeader>
                <div className="text-6xl mb-4">🇬🇧</div>
                <CardTitle>English</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Global reach with perfect English</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black hover:scale-105 transition-transform">
              <CardHeader>
                <div className="text-6xl mb-4">🇷🇺</div>
                <CardTitle>Russian</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Expand to Eastern European markets</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black hover:scale-105 transition-transform">
              <CardHeader>
                <div className="text-6xl mb-4">🇪🇸</div>
                <CardTitle>Spanish</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Connect with Latin America & Spain</p>
              </CardContent>
            </Card>
            
            <Card className="border-2 border-black hover:scale-105 transition-transform">
              <CardHeader>
                <div className="text-6xl mb-4">🇧🇷</div>
                <CardTitle>Portuguese</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Reach Brazil & Portuguese speakers</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="bg-black text-white py-6 rounded-lg text-center">
            <p className="text-lg font-medium">
              🚀 More languages coming in 2024: French, German, Italian & Chinese
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-pastel-pink text-black hover:bg-pastel-pink">PRICING</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-muted-foreground text-lg">Choose the plan that fits your needs</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter */}
            <Card className="border-2 border-black bg-white hover:scale-105 transition-transform">
              <CardHeader>
                <CardTitle className="text-3xl">Starter</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription className="mt-2">Perfect for small stores</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>1 website</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>4 languages</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>10,000 translations/mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>Email support</span>
                  </li>
                </ul>
                <Button className="w-full border-2 border-black bg-white text-black hover:bg-black hover:text-white">
                  Get Started
                </Button>
              </CardContent>
            </Card>
            
            {/* Pro - Most Popular */}
            <Card className="border-2 border-black bg-pastel-yellow -rotate-1 scale-105 hover:scale-110 transition-transform relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black text-white hover:bg-black">
                MOST POPULAR
              </Badge>
              <CardHeader>
                <CardTitle className="text-3xl">Pro</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">$79</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription className="mt-2">Best for growing businesses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>5 websites</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>4 languages</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>100,000 translations/mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>Custom domain</span>
                  </li>
                </ul>
                <Button className="w-full bg-black text-white hover:bg-black/90">
                  Get Started
                </Button>
              </CardContent>
            </Card>
            
            {/* Enterprise */}
            <Card className="border-2 border-black bg-white hover:scale-105 transition-transform">
              <CardHeader>
                <CardTitle className="text-3xl">Enterprise</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold">$199</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription className="mt-2">For large-scale operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>Unlimited websites</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>All languages</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>Unlimited translations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>24/7 support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>White label</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span>API access</span>
                  </li>
                </ul>
                <Button className="w-full border-2 border-black bg-white text-black hover:bg-black hover:text-white">
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section id="integration" className="py-20 bg-gradient-to-r from-pastel-pink via-pastel-cyan to-pastel-yellow">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-white text-black hover:bg-white">INTEGRATION</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Setup in 3 Steps</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto items-center">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-pastel-yellow rounded-lg flex items-center justify-center text-2xl font-bold border-2 border-black flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Sign Up</h3>
                  <p className="text-foreground/80">Create your free account in seconds</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-pastel-pink rounded-lg flex items-center justify-center text-2xl font-bold border-2 border-black flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Get Your Code</h3>
                  <p className="text-foreground/80">Copy your unique snippet</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-pastel-cyan rounded-lg flex items-center justify-center text-2xl font-bold border-2 border-black flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Paste & Go</h3>
                  <p className="text-foreground/80">Add to your site and you're done</p>
                </div>
              </div>
            </div>
            
            <Card className="bg-slate-900 text-white border-2 border-black">
              <CardContent className="p-6 relative">
                <div className="absolute top-4 right-4">
                  <Button size="sm" variant="ghost" className="text-white hover:text-white/80">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <pre className="text-sm overflow-x-auto">
                  <code>{`<script 
  src="https://vistro-lite.com/v1.js"
  data-key="your-api-key">
</script>`}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-pastel-yellow to-pastel-pink">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-4xl md:text-6xl font-bold text-black">
              Ready to Go Global?
            </h2>
            <p className="text-xl text-black/80">
              Join 500+ creators translating their stores
            </p>
            <Button size="lg" className="bg-black text-white hover:bg-black/90 px-12 py-6 text-lg rounded-xl">
              Start Your Free Trial
            </Button>
            <p className="text-sm text-black/70">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 font-bold text-xl mb-4">
                <Globe className="w-6 h-6" />
                Vistro-Lite
              </div>
              <p className="text-white/70 text-sm">
                AI-powered translation for modern creators
              </p>
            </div>
            
            <div>
              <h3 className="font-bold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-white/70 hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-white/70 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#integration" className="text-white/70 hover:text-white transition-colors">Integration</a></li>
                <li><a href="/docs" className="text-white/70 hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="text-white/70 hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-white/70">© 2024 Vistro-Lite. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="text-white/70 hover:text-white transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-white/70 hover:text-white transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="text-white/70 hover:text-white transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

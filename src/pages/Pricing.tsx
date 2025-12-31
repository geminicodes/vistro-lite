import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Twitter, Github, Linkedin } from "lucide-react";

const Pricing = () => {
  const plans = [
    {
      name: "Starter",
      description: "Perfect for small stores",
      price: "$29",
      features: [
        "1 website",
        "All 4 languages",
        "5,000 translations/mo",
        "Email support",
      ],
      cta: "Start Free Trial",
      popular: false,
      bgColor: "bg-background",
    },
    {
      name: "Pro",
      description: "For growing businesses",
      price: "$79",
      features: [
        "5 websites",
        "All 4 languages",
        "50,000 translations/mo",
        "Priority support",
        "Custom branding",
      ],
      cta: "Start Free Trial",
      popular: true,
      bgColor: "bg-pastel-yellow",
    },
    {
      name: "Enterprise",
      description: "For large operations",
      price: "$199",
      features: [
        "Unlimited websites",
        "All languages",
        "Unlimited translations",
        "24/7 support",
        "White label",
        "Dedicated manager",
      ],
      cta: "Contact Sales",
      popular: false,
      bgColor: "bg-background",
    },
  ];

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

      {/* Pricing Section */}
      <section className="py-20 bg-gradient-to-b from-pastel-pink/20 to-pastel-yellow/20">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <div className="text-center mb-16">
            <span className="inline-block bg-pastel-pink border-2 border-foreground px-4 py-1 rounded-full text-sm font-semibold mb-4">
              ⚡ PRICING
            </span>
            <h1 className="text-4xl md:text-5xl font-black mb-4">Simple Pricing</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              No hidden fees. No surprises. Just straightforward pricing.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`${plan.bgColor} border-2 border-foreground rounded-2xl p-6 relative ${
                  plan.popular ? "md:-mt-4 md:mb-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-pastel-pink border-2 border-foreground px-4 py-1 rounded-full text-xs font-bold uppercase">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="mb-6">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                
                <div className="mb-6">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  asChild
                  className={`w-full rounded-xl font-semibold h-12 ${
                    plan.popular
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-background text-foreground border-2 border-foreground hover:bg-foreground/5"
                  }`}
                >
                  <Link to="/auth">{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ or Additional Info */}
      <section className="py-16 border-t-2 border-foreground">
        <div className="container mx-auto px-4 text-center">
          <p className="text-muted-foreground">
            All plans include a 14-day free trial. No credit card required.
          </p>
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

export default Pricing;
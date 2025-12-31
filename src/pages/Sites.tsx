import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CopyButton } from "@/components/CopyButton";
import { mockData } from "@/lib/mockData";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, ExternalLink } from "lucide-react";

const Sites = () => {
  const [sites, setSites] = useState(mockData.getSites());
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const { toast } = useToast();

  const handleCreateSite = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !domain) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const newSite = mockData.createSite(name, domain);
    setSites(mockData.getSites());
    
    toast({
      title: "Site created!",
      description: "Your new site is ready to use",
    });
    
    setIsOpen(false);
    setName("");
    setDomain("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sites</h1>
            <p className="text-muted-foreground">Manage your websites and translation keys</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Site
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Site</DialogTitle>
                <DialogDescription>
                  Add a new website to start translating
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Site Name</Label>
                  <Input
                    id="name"
                    placeholder="My Awesome Site"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary">
                  Create Site
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {sites.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sites yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first site to start translating your content
              </p>
              <Button onClick={() => setIsOpen(true)} className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Site
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Sites</CardTitle>
              <CardDescription>
                {sites.length} {sites.length === 1 ? "site" : "sites"} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Site Key</TableHead>
                    <TableHead>Translations</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.name}</TableCell>
                      <TableCell>
                        <a
                          href={`https://${site.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {site.domain}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {site.siteKey.slice(0, 16)}...
                        </code>
                      </TableCell>
                      <TableCell>{site.translationCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <CopyButton text={site.siteKey} label="Copy Key" />
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/dashboard/sites/${site.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Sites;

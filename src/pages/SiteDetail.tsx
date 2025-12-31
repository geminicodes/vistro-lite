import { useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CodeSnippetEmbed } from "@/components/CodeSnippetEmbed";
import { mockData } from "@/lib/mockData";
import { Globe, TrendingUp, Clock, Plus, Trash2, ChevronLeft } from "lucide-react";

const SiteDetail = () => {
  const { id } = useParams();
  const site = id ? mockData.getSite(id) : null;
  const [activeTab, setActiveTab] = useState("overview");

  if (!site) {
    return <Navigate to="/dashboard" replace />;
  }

  // Mock data for demonstration
  const mockLocales = ["es", "fr", "de"];
  const mockJobs = [
    { id: "1", url: "https://example.com/page1", status: "completed", date: new Date().toISOString() },
    { id: "2", url: "https://example.com/page2", status: "completed", date: new Date(Date.now() - 86400000).toISOString() },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <Button variant="ghost" asChild className="mb-4">
            <Link to="/dashboard">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Sites
            </Link>
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{site.name}</h1>
            <Badge variant="secondary">Active</Badge>
          </div>
          <p className="text-muted-foreground">{site.domain}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Globe className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">Active</div>
              <p className="text-xs text-muted-foreground">All systems operational</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Translations</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{site.translationCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2 hours ago</div>
              <p className="text-xs text-muted-foreground">Recent translation</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="locales">Locales</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <CodeSnippetEmbed siteId={site.id} />

            <Card>
              <CardHeader>
                <CardTitle>Recent Translation Jobs</CardTitle>
                <CardDescription>Latest translation activity for this site</CardDescription>
              </CardHeader>
              <CardContent>
                {mockJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No translation jobs yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mockJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-sm">{job.url}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{job.status}</Badge>
                          </TableCell>
                          <TableCell>{new Date(job.date).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Locales Tab */}
          <TabsContent value="locales" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Manage Locales</CardTitle>
                    <CardDescription>Configure which languages your site supports</CardDescription>
                  </div>
                  <Button className="gradient-primary text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Locale
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockLocales.map((locale) => (
                    <div key={locale} className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{locale.toUpperCase()}</Badge>
                        <span className="font-medium">
                          {locale === "es" ? "Spanish" : locale === "fr" ? "French" : "German"}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Translation Jobs</CardTitle>
                <CardDescription>Complete history of translation activity</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Source URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-sm">{job.id}</TableCell>
                        <TableCell className="font-mono text-sm">{job.url}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{job.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(job.date).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SiteDetail;

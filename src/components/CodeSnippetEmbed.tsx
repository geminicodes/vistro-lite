import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "./CopyButton";
import { Info } from "lucide-react";

interface CodeSnippetEmbedProps {
  siteId: string;
}

export const CodeSnippetEmbed = ({ siteId }: CodeSnippetEmbedProps) => {
  const snippet = `<script src="/embed/v1.js" data-site="${siteId}"></script>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embed Snippet</CardTitle>
        <CardDescription>
          Add this code to your website's &lt;head&gt; section
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
            <code>{snippet}</code>
          </pre>
          <div className="absolute top-4 right-4">
            <CopyButton text={snippet} />
          </div>
        </div>
        
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Place this snippet in the <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;head&gt;</code> section 
            of your HTML for best performance. It will automatically detect visitor language and translate your content.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

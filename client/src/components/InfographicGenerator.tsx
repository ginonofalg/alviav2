import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  Loader2, 
  Image as ImageIcon, 
  Network,
  Lightbulb,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { apiRequestJson } from '@/lib/queryClient';

interface InfographicResponse {
  success: boolean;
  id: string;
  imageUrl: string;
  model: string;
}

type EntityLevel = 'collection' | 'project';

interface InfographicGeneratorProps {
  entityId: string;
  entityName: string;
  entityLevel: EntityLevel;
  hasAnalytics: boolean;
}

// For collection: summary, themes, findings
// For project: summary, themes, insights
type InfographicType = 'summary' | 'themes' | 'findings' | 'insights';

interface TabState {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function InfographicGenerator({ entityId, entityName, entityLevel, hasAnalytics }: InfographicGeneratorProps) {
  const [activeTab, setActiveTab] = useState<InfographicType>('summary');
  const [tabStates, setTabStates] = useState<Record<InfographicType, TabState>>({
    summary: { imageUrl: null, isLoading: false, error: null },
    themes: { imageUrl: null, isLoading: false, error: null },
    findings: { imageUrl: null, isLoading: false, error: null },
    insights: { imageUrl: null, isLoading: false, error: null },
  });

  // Validate that the type is valid for the current entity level
  const isValidType = (type: InfographicType): boolean => {
    if (entityLevel === 'collection') {
      return type === 'summary' || type === 'themes' || type === 'findings';
    } else {
      return type === 'summary' || type === 'themes' || type === 'insights';
    }
  };

  const getApiPath = (type: InfographicType): string | null => {
    if (!isValidType(type)) {
      return null;
    }
    if (entityLevel === 'collection') {
      return `/api/collections/${entityId}/infographic/${type}`;
    } else {
      return `/api/projects/${entityId}/infographic/${type}`;
    }
  };

  const handleGenerate = async (type: InfographicType) => {
    const apiPath = getApiPath(type);
    if (!apiPath) {
      setTabStates(prev => ({
        ...prev,
        [type]: { ...prev[type], isLoading: false, error: `Invalid infographic type "${type}" for ${entityLevel} level` },
      }));
      return;
    }

    setTabStates(prev => ({
      ...prev,
      [type]: { ...prev[type], isLoading: true, error: null },
    }));

    try {
      const result = await apiRequestJson<InfographicResponse>(
        'POST',
        apiPath,
        undefined,
        { timeoutMs: 120000 }
      );

      setTabStates(prev => ({
        ...prev,
        [type]: { imageUrl: result.imageUrl, isLoading: false, error: null },
      }));
    } catch (error) {
      setTabStates(prev => ({
        ...prev,
        [type]: { ...prev[type], isLoading: false, error: (error as Error).message },
      }));
    }
  };

  const handleDownload = (type: InfographicType) => {
    const imageUrl = tabStates[type].imageUrl;
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${entityName.replace(/\s+/g, '-').toLowerCase()}-${type}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isAnyLoading = Object.values(tabStates).some(s => s.isLoading);

  if (!hasAnalytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="heading-infographics">
            <ImageIcon className="w-5 h-5 text-primary" />
            Infographics
          </CardTitle>
          <CardDescription>
            Generate visual summaries of your research
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8" data-testid="empty-infographics">
            <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground" data-testid="text-no-analytics">
              Run analytics first to generate infographics
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderTabContent = (type: InfographicType, title: string, description: string) => {
    const state = tabStates[type];
    const { imageUrl, isLoading, error } = state;

    return (
      <div className="space-y-4">
        {!imageUrl && !isLoading && !error && (
          <div className="text-center py-8 border-2 border-dashed rounded-lg" data-testid={`empty-${type}`}>
            <ImageIcon className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">{description}</p>
            <Button 
              onClick={() => handleGenerate(type)} 
              disabled={isAnyLoading}
              data-testid={`button-generate-${type}`}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Generate {title}
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg" data-testid={`loading-${type}`}>
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Generating {title.toLowerCase()}...</p>
            <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive" data-testid={`error-${type}`}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
            <Button 
              onClick={() => handleGenerate(type)} 
              variant="outline"
              disabled={isAnyLoading}
              data-testid={`button-retry-${type}`}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}

        {imageUrl && !isLoading && (
          <div className="space-y-4" data-testid={`result-${type}`}>
            <div className="relative rounded-lg overflow-hidden border shadow-lg">
              <img
                src={imageUrl}
                alt={`${title} infographic`}
                className="w-full h-auto"
                data-testid={`image-${type}`}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                onClick={() => handleDownload(type)} 
                variant="outline"
                data-testid={`button-download-${type}`}
              >
                <Download className="w-4 h-4 mr-2" />
                Download PNG
              </Button>
              <Button 
                onClick={() => handleGenerate(type)} 
                variant="outline"
                disabled={isAnyLoading}
                data-testid={`button-regenerate-${type}`}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const levelLabel = entityLevel === 'collection' ? 'collection' : 'project';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" data-testid="heading-infographics">
          <ImageIcon className="w-5 h-5 text-primary" />
          Infographics
        </CardTitle>
        <CardDescription>
          Generate visual summaries of your {levelLabel} data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InfographicType)}>
          <TabsList className="mb-4">
            <TabsTrigger value="summary" className="gap-2" data-testid="tab-summary-infographic">
              <ImageIcon className="w-4 h-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-2" data-testid="tab-themes-infographic">
              <Network className="w-4 h-4" />
              Themes
            </TabsTrigger>
            {entityLevel === 'collection' && (
              <TabsTrigger value="findings" className="gap-2" data-testid="tab-findings-infographic">
                <Lightbulb className="w-4 h-4" />
                Findings
              </TabsTrigger>
            )}
            {entityLevel === 'project' && (
              <TabsTrigger value="insights" className="gap-2" data-testid="tab-insights-infographic">
                <Lightbulb className="w-4 h-4" />
                Insights
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="summary">
            {renderTabContent(
              'summary',
              'Summary Infographic',
              `Create a visual overview with key ${levelLabel} metrics and themes`
            )}
          </TabsContent>

          <TabsContent value="themes">
            {renderTabContent(
              'themes',
              'Theme Network',
              entityLevel === 'collection' 
                ? 'Visualize relationships between research themes'
                : 'Visualize cross-template theme connections'
            )}
          </TabsContent>

          {entityLevel === 'collection' && (
            <TabsContent value="findings">
              {renderTabContent(
                'findings',
                'Key Findings',
                'Generate a summary of key insights and consensus points'
              )}
            </TabsContent>
          )}

          {entityLevel === 'project' && (
            <TabsContent value="insights">
              {renderTabContent(
                'insights',
                'Strategic Insights',
                'Generate strategic insights and recommendations across templates'
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

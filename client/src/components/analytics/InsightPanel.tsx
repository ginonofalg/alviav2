import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Lightbulb, 
  Users, 
  GitFork, 
  Quote,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import type { KeyFinding, ConsensusPoint, DivergencePoint, ThemeVerbatim } from "@shared/schema";
import { VerbatimQuote, SentimentIndicator } from "./ThemeCard";

interface InsightPanelProps {
  keyFindings: KeyFinding[];
  consensusPoints: ConsensusPoint[];
  divergencePoints: DivergencePoint[];
  participantLabels?: Map<string, string>;
}

function KeyFindingCard({ finding, index, participantLabels }: { 
  finding: KeyFinding; 
  index: number;
  participantLabels?: Map<string, string>;
}) {
  const verbatims = finding.supportingVerbatims || [];
  const relatedThemes = finding.relatedThemes || [];
  
  return (
    <Card data-testid={`key-finding-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary" data-testid={`text-finding-number-${index}`}>{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground" data-testid={`text-finding-title-${index}`}>{finding.finding}</h4>
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-finding-significance-${index}`}>{finding.significance}</p>
            
            {relatedThemes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {relatedThemes.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-related-theme-${index}-${i}`}>
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            
            {verbatims.length > 0 && (
              <div className="mt-3 space-y-2">
                {verbatims.slice(0, 2).map((v, i) => (
                  <VerbatimQuote key={i} verbatim={v} index={i} participantLabels={participantLabels} />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsensusCard({ consensus, index, participantLabels }: { 
  consensus: ConsensusPoint;
  index: number;
  participantLabels?: Map<string, string>;
}) {
  const verbatims = consensus.verbatims || [];
  
  return (
    <Card className="border-green-200/50 dark:border-green-800/30 bg-green-50/30 dark:bg-green-950/10" data-testid={`consensus-card-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
          <h4 className="font-medium text-foreground" data-testid={`text-consensus-topic-${index}`}>{consensus.topic}</h4>
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-0" data-testid={`badge-agreement-${index}`}>
            {consensus.agreementLevel}% agree
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground" data-testid={`text-consensus-position-${index}`}>{consensus.position}</p>
        
        {verbatims.length > 0 && (
          <div className="mt-3 space-y-2">
            {verbatims.slice(0, 2).map((v, i) => (
              <VerbatimQuote key={i} verbatim={v} index={i} participantLabels={participantLabels} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DivergenceCard({ divergence, index, participantLabels }: { 
  divergence: DivergencePoint;
  index: number;
  participantLabels?: Map<string, string>;
}) {
  const perspectives = divergence.perspectives || [];
  
  return (
    <Card className="border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10" data-testid={`divergence-card-${index}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <GitFork className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <h4 className="font-medium text-foreground" data-testid={`text-divergence-topic-${index}`}>{divergence.topic}</h4>
        </div>
        
        <div className="space-y-3">
          {perspectives.map((p, i) => {
            const pVerbatims = p.verbatims || [];
            return (
              <div key={i} className="pl-3 border-l-2 border-amber-300 dark:border-amber-700">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" data-testid={`text-perspective-${index}-${i}`}>{p.position}</span>
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-perspective-count-${index}-${i}`}>
                    {p.count} {p.count === 1 ? 'participant' : 'participants'}
                  </Badge>
                </div>
                {pVerbatims.slice(0, 1).map((v, j) => (
                  <div key={j} className="mt-1">
                    <p className="text-xs italic text-muted-foreground" data-testid={`text-perspective-quote-${index}-${i}`}>"{v.quote}"</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function InsightPanel({ 
  keyFindings, 
  consensusPoints, 
  divergencePoints,
  participantLabels 
}: InsightPanelProps) {
  const hasContent = keyFindings.length > 0 || consensusPoints.length > 0 || divergencePoints.length > 0;
  
  if (!hasContent) {
    return (
      <Card data-testid="empty-insights-panel">
        <CardContent className="py-8 text-center">
          <Lightbulb className="w-10 h-10 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-medium mb-2" data-testid="text-no-insights-heading">No insights yet</h3>
          <p className="text-sm text-muted-foreground" data-testid="text-no-insights-message">
            Key findings, consensus points, and divergences will appear here after analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {keyFindings.length > 0 && (
        <div data-testid="section-key-findings">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-wrap" data-testid="heading-key-findings">
            <Lightbulb className="w-5 h-5 text-primary" />
            Key Findings
          </h3>
          <div className="space-y-4">
            {keyFindings.map((f, i) => (
              <KeyFindingCard key={i} finding={f} index={i} participantLabels={participantLabels} />
            ))}
          </div>
        </div>
      )}
      
      {consensusPoints.length > 0 && (
        <div data-testid="section-consensus">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-wrap" data-testid="heading-consensus">
            <Users className="w-5 h-5 text-green-600" />
            Areas of Consensus
          </h3>
          <div className="space-y-4">
            {consensusPoints.map((c, i) => (
              <ConsensusCard key={i} consensus={c} index={i} participantLabels={participantLabels} />
            ))}
          </div>
        </div>
      )}
      
      {divergencePoints.length > 0 && (
        <div data-testid="section-divergence">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-wrap" data-testid="heading-divergence">
            <GitFork className="w-5 h-5 text-amber-600" />
            Points of Divergence
          </h3>
          <div className="space-y-4">
            {divergencePoints.map((d, i) => (
              <DivergenceCard key={i} divergence={d} index={i} participantLabels={participantLabels} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { KeyFindingCard, ConsensusCard, DivergenceCard };

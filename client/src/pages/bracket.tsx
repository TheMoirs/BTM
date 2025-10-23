import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Team, type Match } from "@shared/schema";
import { Trophy, Award, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const stageOrder = ["initial", "quarter-finals", "semi-finals", "finals"];

const stageColors = {
  initial: "bg-muted text-muted-foreground",
  "quarter-finals": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "semi-finals": "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  finals: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

const stageLabels = {
  initial: "Initial Stage",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

export default function Bracket() {
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const getTeamName = (teamId: string) => {
    return teams?.find((t) => t.id === teamId)?.name || "Unknown Team";
  };

  const matchesByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = matches?.filter((m) => m.stage === stage) || [];
    return acc;
  }, {} as Record<string, Match[]>);

  const getCompletedCount = (stage: string) => {
    return matchesByStage[stage].filter((m) => m.status === "completed").length;
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading bracket...</p>
        </div>
      </div>
    );
  }

  const hasAnyMatches = matches && matches.length > 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Tournament Bracket</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View the tournament progression from initial rounds to finals
          </p>
        </div>

        {!hasAnyMatches ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Trophy className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No tournament brackets yet
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Create matches to build your tournament bracket
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {stageOrder.map((stage) => {
              const stageMatches = matchesByStage[stage];
              const completedCount = getCompletedCount(stage);
              
              if (stageMatches.length === 0) return null;

              return (
                <div key={stage} className="space-y-4" data-testid={`section-${stage}`}>
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold text-foreground">
                      {stageLabels[stage as keyof typeof stageLabels]}
                    </h2>
                    <Badge className={cn("text-xs", stageColors[stage as keyof typeof stageColors])}>
                      {completedCount} / {stageMatches.length} completed
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stageMatches.map((match) => {
                      const isCompleted = match.status === "completed";
                      const team1Won = isCompleted && match.winnerId === match.team1Id;
                      const team2Won = isCompleted && match.winnerId === match.team2Id;

                      return (
                        <Card
                          key={match.id}
                          className={cn(
                            "hover-elevate",
                            isCompleted && "border-green-200 dark:border-green-900"
                          )}
                          data-testid={`bracket-match-${match.id}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge
                                variant="outline"
                                className="text-xs"
                                data-testid={`bracket-status-${match.id}`}
                              >
                                {match.status === "completed" ? "Completed" : "Scheduled"}
                              </Badge>
                              {isCompleted && (
                                <Award className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            {match.matchDate && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground" data-testid={`bracket-date-${match.id}`}>
                                  {new Date(match.matchDate).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                  })}
                                </span>
                              </div>
                            )}
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div
                              className={cn(
                                "flex items-center justify-between p-3 rounded-md transition-colors",
                                team1Won
                                  ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
                                  : "bg-muted/50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {team1Won && (
                                  <Trophy className="h-4 w-4 text-green-600" />
                                )}
                                <span className={cn(
                                  "text-sm font-medium",
                                  team1Won && "text-green-700 dark:text-green-400"
                                )} data-testid={`bracket-team1-${match.id}`}>
                                  {getTeamName(match.team1Id)}
                                </span>
                              </div>
                              <span className="text-lg font-mono font-bold" data-testid={`bracket-score1-${match.id}`}>
                                {match.team1Score ?? "-"}
                              </span>
                            </div>

                            <div
                              className={cn(
                                "flex items-center justify-between p-3 rounded-md transition-colors",
                                team2Won
                                  ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
                                  : "bg-muted/50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {team2Won && (
                                  <Trophy className="h-4 w-4 text-green-600" />
                                )}
                                <span className={cn(
                                  "text-sm font-medium",
                                  team2Won && "text-green-700 dark:text-green-400"
                                )} data-testid={`bracket-team2-${match.id}`}>
                                  {getTeamName(match.team2Id)}
                                </span>
                              </div>
                              <span className="text-lg font-mono font-bold" data-testid={`bracket-score2-${match.id}`}>
                                {match.team2Score ?? "-"}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

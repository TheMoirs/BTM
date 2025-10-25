import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Result } from "@shared/schema";
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Trophy, BarChart3, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortColumn = "matchInfo" | "matchDate" | "teamName" | "pointsFor" | "pointsAgainst" | "pointsDifference" | "score" | "stage";
type SortDirection = "asc" | "desc";

const stageLabels = {
  initial: "Initial",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

type TeamSummary = {
  teamName: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDifference: number;
  totalPointsScored: number;
};

export default function Results() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("pointsFor");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: results, isLoading } = useQuery<Result[]>({
    queryKey: ["/api/results"],
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (stageFilter === "all") return results;
    return results.filter(result => result.stage === stageFilter);
  }, [results, stageFilter]);

  const getSortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortColumn) {
        case "matchInfo":
          aVal = a.matchInfo.toLowerCase();
          bVal = b.matchInfo.toLowerCase();
          break;
        case "matchDate":
          aVal = a.matchDate || "";
          bVal = b.matchDate || "";
          break;
        case "teamName":
          aVal = a.teamName.toLowerCase();
          bVal = b.teamName.toLowerCase();
          break;
        case "stage":
          aVal = a.stage.toLowerCase();
          bVal = b.stage.toLowerCase();
          break;
        case "pointsFor":
          aVal = a.pointsFor;
          bVal = b.pointsFor;
          break;
        case "pointsAgainst":
          aVal = a.pointsAgainst;
          bVal = b.pointsAgainst;
          break;
        case "pointsDifference":
          aVal = a.pointsDifference;
          bVal = b.pointsDifference;
          break;
        case "score":
          aVal = a.score;
          bVal = b.score;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredResults, sortColumn, sortDirection]);

  const teamSummaries = useMemo(() => {
    if (!filteredResults || filteredResults.length === 0) return [];

    const summaryMap = new Map<string, TeamSummary>();

    filteredResults.forEach(result => {
      if (!summaryMap.has(result.teamName)) {
        summaryMap.set(result.teamName, {
          teamName: result.teamName,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesDrawn: 0,
          gamesLost: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointsDifference: 0,
          totalPointsScored: 0,
        });
      }

      const summary = summaryMap.get(result.teamName)!;
      summary.gamesPlayed += 1;
      summary.pointsFor += result.pointsFor;
      summary.pointsAgainst += result.pointsAgainst;
      summary.pointsDifference += result.pointsDifference;
      summary.totalPointsScored += result.score;

      if (result.pointsFor === 2) {
        summary.gamesWon += 1;
      } else if (result.pointsFor === 1) {
        summary.gamesDrawn += 1;
      } else {
        summary.gamesLost += 1;
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      // Sort by points for first, then by points difference
      if (b.pointsFor !== a.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }
      return b.pointsDifference - a.pointsDifference;
    });
  }, [filteredResults]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  const handleClearAllResults = async () => {
    try {
      await apiRequest("DELETE", "/api/results");
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      setShowClearConfirm(false);
      toast({
        title: "Results cleared",
        description: "All results have been removed.",
      });
    } catch (error) {
      console.error("Error clearing results:", error);
      toast({
        title: "Error",
        description: "Failed to clear results.",
        variant: "destructive",
      });
    }
  };

  const availableStages = useMemo(() => {
    if (!results) return [];
    const stages = new Set(results.map(r => r.stage));
    return Array.from(stages).sort();
  }, [results]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Results</h1>
          <p className="text-muted-foreground">
            View match results and team points
          </p>
        </div>
        <div className="flex gap-2">
          {results && results.length > 0 && (
            <>
              <Dialog open={showSummary} onOpenChange={setShowSummary}>
                <DialogTrigger asChild>
                  <Button variant="default" data-testid="button-show-summary">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Summary
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      Team Summary Statistics
                      {stageFilter !== "all" && ` - ${stageLabels[stageFilter as keyof typeof stageLabels]}`}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-center">Played</TableHead>
                          <TableHead className="text-center">Won</TableHead>
                          <TableHead className="text-center">Drawn</TableHead>
                          <TableHead className="text-center">Lost</TableHead>
                          <TableHead className="text-center">Points For</TableHead>
                          <TableHead className="text-center">Points Against</TableHead>
                          <TableHead className="text-center">Points Difference</TableHead>
                          <TableHead className="text-center">Total Points Scored</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamSummaries.map((summary) => (
                          <TableRow key={summary.teamName} data-testid={`row-summary-${summary.teamName}`}>
                            <TableCell className="font-medium" data-testid={`text-team-${summary.teamName}`}>
                              {summary.teamName}
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-played-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesPlayed}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-won-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesWon}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-drawn-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesDrawn}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-lost-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesLost}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-points-for-${summary.teamName}`}>
                              <Badge variant="default" className="font-mono">
                                {summary.pointsFor}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-points-against-${summary.teamName}`}>
                              <span className="font-mono">{summary.pointsAgainst}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-points-difference-${summary.teamName}`}>
                              <Badge 
                                variant={summary.pointsDifference > 0 ? "default" : summary.pointsDifference < 0 ? "destructive" : "secondary"}
                                className="font-mono"
                              >
                                {summary.pointsDifference > 0 ? '+' : ''}{summary.pointsDifference}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-total-scored-${summary.teamName}`}>
                              <span className="font-mono">{summary.totalPointsScored}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="destructive"
                onClick={() => setShowClearConfirm(true)}
                data-testid="button-clear-all-results"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All Results
              </Button>
            </>
          )}
        </div>
      </div>

      {results && results.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-stage-filter">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {availableStages.map(stage => (
                <SelectItem key={stage} value={stage}>
                  {stageLabels[stage as keyof typeof stageLabels]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Loading results...</div>
          </CardContent>
        </Card>
      ) : !results || results.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">No results yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Results will appear here when match scores are entered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filteredResults.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">No results for this stage</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try selecting a different stage
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {stageFilter === "all" 
                ? `All Results (${filteredResults.length})`
                : `${stageLabels[stageFilter as keyof typeof stageLabels]} Results (${filteredResults.length})`
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("matchInfo")}
                        data-testid="sort-matchInfo"
                      >
                        Match
                        <SortIcon column="matchInfo" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("stage")}
                        data-testid="sort-stage"
                      >
                        Stage
                        <SortIcon column="stage" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("matchDate")}
                        data-testid="sort-matchDate"
                      >
                        Date
                        <SortIcon column="matchDate" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("teamName")}
                        data-testid="sort-teamName"
                      >
                        Team
                        <SortIcon column="teamName" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("pointsFor")}
                        data-testid="sort-pointsFor"
                      >
                        Points For
                        <SortIcon column="pointsFor" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("pointsAgainst")}
                        data-testid="sort-pointsAgainst"
                      >
                        Points Against
                        <SortIcon column="pointsAgainst" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("pointsDifference")}
                        data-testid="sort-pointsDifference"
                      >
                        Points Diff
                        <SortIcon column="pointsDifference" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("score")}
                        data-testid="sort-score"
                      >
                        Score
                        <SortIcon column="score" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getSortedResults.map((result) => (
                    <TableRow key={result.id} data-testid={`row-result-${result.id}`}>
                      <TableCell data-testid={`text-match-${result.id}`}>
                        {result.matchInfo}
                      </TableCell>
                      <TableCell data-testid={`text-stage-${result.id}`}>
                        <Badge variant="outline">
                          {stageLabels[result.stage as keyof typeof stageLabels]}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-date-${result.id}`}>
                        {result.matchDate ? (
                          <span className="text-sm">
                            {new Date(result.matchDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-team-${result.id}`}>
                        {result.teamName}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-points-for-${result.id}`}>
                        <Badge 
                          variant={result.pointsFor === 2 ? "default" : result.pointsFor === 1 ? "secondary" : "outline"}
                          className="font-mono"
                        >
                          {result.pointsFor}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-points-against-${result.id}`}>
                        <span className="font-mono">{result.pointsAgainst}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-points-difference-${result.id}`}>
                        <Badge 
                          variant={result.pointsDifference > 0 ? "default" : result.pointsDifference < 0 ? "destructive" : "secondary"}
                          className="font-mono"
                        >
                          {result.pointsDifference > 0 ? '+' : ''}{result.pointsDifference}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-score-${result.id}`}>
                        <span className="font-mono">{result.score}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all results?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all result records from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllResults}
              className="bg-destructive text-destructive-foreground hover-elevate"
              data-testid="button-confirm-clear"
            >
              Clear All Results
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

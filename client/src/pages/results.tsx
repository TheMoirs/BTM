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
import type { Result } from "@shared/schema";
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Trophy } from "lucide-react";
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

type SortColumn = "matchInfo" | "matchDate" | "teamName" | "points" | "score";
type SortDirection = "asc" | "desc";

export default function Results() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("points");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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

  const getSortedResults = useMemo(() => {
    if (!results) return [];

    return [...results].sort((a, b) => {
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
        case "points":
          aVal = a.points;
          bVal = b.points;
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
  }, [results, sortColumn, sortDirection]);

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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Results</h1>
          <p className="text-muted-foreground">
            View match results and team points
          </p>
        </div>
        {results && results.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => setShowClearConfirm(true)}
            data-testid="button-clear-all-results"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All Results
          </Button>
        )}
      </div>

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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">All Results ({results.length})</CardTitle>
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
                        onClick={() => handleSort("points")}
                        data-testid="sort-points"
                      >
                        Points
                        <SortIcon column="points" />
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
                      <TableCell className="text-center" data-testid={`text-points-${result.id}`}>
                        <Badge 
                          variant={result.points === 2 ? "default" : result.points === 1 ? "secondary" : "outline"}
                          className="font-mono"
                        >
                          {result.points}
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

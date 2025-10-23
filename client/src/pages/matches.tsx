import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertMatchSchema,
  updateMatchScoreSchema,
  type Team,
  type Match,
  type InsertMatch,
  type UpdateMatchScore,
} from "@shared/schema";
import { Plus, Trophy, Circle, CheckCircle2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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

export default function Matches() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [scoringMatch, setScoringMatch] = useState<Match | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const { toast } = useToast();

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const createForm = useForm<InsertMatch>({
    resolver: zodResolver(insertMatchSchema),
    defaultValues: {
      team1Id: "",
      team2Id: "",
      stage: "initial",
      status: "scheduled",
      matchDate: null,
    },
  });

  const scoreForm = useForm<UpdateMatchScore>({
    resolver: zodResolver(updateMatchScoreSchema),
    defaultValues: {
      team1Score: 0,
      team2Score: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertMatch) => apiRequest("POST", "/api/matches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      setIsCreateOpen(false);
      createForm.reset();
      toast({
        title: "Match created",
        description: "The match has been successfully scheduled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const scoreMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMatchScore }) =>
      apiRequest("PATCH", `/api/matches/${id}/score`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      setScoringMatch(null);
      scoreForm.reset();
      toast({
        title: "Score recorded",
        description: "The match result has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onCreateSubmit = (data: InsertMatch) => {
    if (data.team1Id === data.team2Id) {
      toast({
        title: "Invalid selection",
        description: "Please select two different teams",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(data);
  };

  const onScoreSubmit = (data: UpdateMatchScore) => {
    if (scoringMatch) {
      scoreMutation.mutate({ id: scoringMatch.id, data });
    }
  };

  const handleRecordScore = (match: Match) => {
    setScoringMatch(match);
    scoreForm.reset({
      team1Score: match.team1Score ?? 0,
      team2Score: match.team2Score ?? 0,
    });
  };

  const getTeamName = (teamId: string) => {
    return teams?.find((t) => t.id === teamId)?.name || "Unknown Team";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "in-progress":
        return <Circle className="h-4 w-4 text-yellow-600 fill-yellow-600" />;
      default:
        return <Circle className="h-4 w-4 text-blue-600" />;
    }
  };

  const filteredMatches = matches?.filter((match) => {
    if (activeTab === "all") return true;
    return match.stage === activeTab;
  });

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Matches</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Schedule matches and record results
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-match">
                <Plus className="h-4 w-4 mr-2" />
                Create Match
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby="match-form-description">
              <DialogHeader>
                <DialogTitle>Create New Match</DialogTitle>
                <p id="match-form-description" className="sr-only">
                  Select two teams and choose a tournament stage to schedule a new match
                </p>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-6">
                  <FormField
                    control={createForm.control}
                    name="team1Id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team 1</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-team1">
                              <SelectValue placeholder="Select first team" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teams?.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-center py-2">
                    <span className="text-2xl font-bold text-muted-foreground">VS</span>
                  </div>

                  <FormField
                    control={createForm.control}
                    name="team2Id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team 2</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-team2">
                              <SelectValue placeholder="Select second team" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teams?.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="stage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tournament Stage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-stage">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="initial">Initial Stage</SelectItem>
                            <SelectItem value="quarter-finals">Quarter-Finals</SelectItem>
                            <SelectItem value="semi-finals">Semi-Finals</SelectItem>
                            <SelectItem value="finals">Finals</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="matchDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Match Date (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                            data-testid="input-match-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      className="flex-1"
                      data-testid="button-cancel-match"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-match"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Match"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All Matches</TabsTrigger>
            <TabsTrigger value="initial" data-testid="tab-initial">Initial Stage</TabsTrigger>
            <TabsTrigger value="quarter-finals" data-testid="tab-quarters">Quarter-Finals</TabsTrigger>
            <TabsTrigger value="semi-finals" data-testid="tab-semis">Semi-Finals</TabsTrigger>
            <TabsTrigger value="finals" data-testid="tab-finals">Finals</TabsTrigger>
          </TabsList>
        </Tabs>

        {!filteredMatches || filteredMatches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Trophy className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {activeTab === "all" ? "No matches scheduled" : `No ${stageLabels[activeTab as keyof typeof stageLabels]} matches`}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {activeTab === "all" 
                  ? "Create your first match to get the competition started"
                  : `Schedule matches for the ${stageLabels[activeTab as keyof typeof stageLabels]}`
                }
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-match">
                <Plus className="h-4 w-4 mr-2" />
                Create Match
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredMatches.map((match) => (
              <Card key={match.id} className="hover-elevate" data-testid={`card-match-${match.id}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Badge className={cn("text-xs font-medium", stageColors[match.stage as keyof typeof stageColors])} data-testid={`badge-stage-${match.id}`}>
                          {stageLabels[match.stage as keyof typeof stageLabels]}
                        </Badge>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(match.status)}
                          <span className="text-xs text-muted-foreground capitalize" data-testid={`text-status-${match.id}`}>
                            {match.status.replace("-", " ")}
                          </span>
                        </div>
                        {match.matchDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground" data-testid={`text-date-${match.id}`}>
                              {new Date(match.matchDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 text-right">
                          <p className="text-lg font-semibold text-foreground" data-testid={`text-team1-${match.id}`}>
                            {getTeamName(match.team1Id)}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3 px-4">
                          <span className="text-2xl font-mono font-bold text-foreground min-w-[2rem] text-center" data-testid={`text-score1-${match.id}`}>
                            {match.team1Score ?? "-"}
                          </span>
                          <span className="text-muted-foreground font-medium">:</span>
                          <span className="text-2xl font-mono font-bold text-foreground min-w-[2rem] text-center" data-testid={`text-score2-${match.id}`}>
                            {match.team2Score ?? "-"}
                          </span>
                        </div>
                        
                        <div className="flex-1">
                          <p className="text-lg font-semibold text-foreground" data-testid={`text-team2-${match.id}`}>
                            {getTeamName(match.team2Id)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => handleRecordScore(match)}
                      data-testid={`button-record-score-${match.id}`}
                    >
                      {match.status === "completed" ? "Update Score" : "Record Score"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!scoringMatch} onOpenChange={(open) => !open && setScoringMatch(null)}>
          <DialogContent aria-describedby="score-form-description">
            <DialogHeader>
              <DialogTitle>Record Match Score</DialogTitle>
              <p id="score-form-description" className="sr-only">
                Enter the final score for each team to record the match result
              </p>
            </DialogHeader>
            {scoringMatch && (
              <Form {...scoreForm}>
                <form onSubmit={scoreForm.handleSubmit(onScoreSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <FormField
                      control={scoreForm.control}
                      name="team1Score"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{getTeamName(scoringMatch.team1Id)}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="0"
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-score1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={scoreForm.control}
                      name="team2Score"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{getTeamName(scoringMatch.team2Id)}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="0"
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-score2"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setScoringMatch(null)}
                      className="flex-1"
                      data-testid="button-cancel-score"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={scoreMutation.isPending}
                      data-testid="button-submit-score"
                    >
                      {scoreMutation.isPending ? "Saving..." : "Save Score"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

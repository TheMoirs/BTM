import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Tournament, InsertTournament } from "@shared/schema";

interface TournamentContextType {
  currentTournament: Tournament | null;
  isLoading: boolean;
  selectTournament: (tournament: Tournament) => void;
  createTournament: (data: InsertTournament) => Promise<Tournament>;
  deleteTournament: (id: string) => Promise<void>;
}

const TournamentContext = createContext<TournamentContextType | undefined>(undefined);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);

  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertTournament) => {
      const response = await apiRequest("POST", "/api/tournaments", data);
      return (await response.json()) as Tournament;
    },
    onSuccess: (newTournament) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      setCurrentTournament(newTournament);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tournaments/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      
      // After deletion, select the next available tournament
      const updatedTournaments = queryClient.getQueryData<Tournament[]>(["/api/tournaments"]);
      if (updatedTournaments && updatedTournaments.length > 0) {
        setCurrentTournament(updatedTournaments[0]);
      } else {
        setCurrentTournament(null);
      }
    },
  });

  // Set the latest tournament as the current one on initial load
  useEffect(() => {
    if (tournaments && tournaments.length > 0 && !currentTournament) {
      setCurrentTournament(tournaments[0]);
    }
  }, [tournaments, currentTournament]);

  const selectTournament = (tournament: Tournament) => {
    setCurrentTournament(tournament);
    // Invalidate all data queries to refetch for the new tournament
    queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/results"] });
  };

  const createTournament = async (data: InsertTournament): Promise<Tournament> => {
    return await createMutation.mutateAsync(data);
  };

  const deleteTournament = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id);
  };

  return (
    <TournamentContext.Provider
      value={{
        currentTournament,
        isLoading,
        selectTournament,
        createTournament,
        deleteTournament,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (context === undefined) {
    throw new Error("useTournament must be used within a TournamentProvider");
  }
  return context;
}

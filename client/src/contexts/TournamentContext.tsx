import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Tournament, InsertTournament } from "@shared/schema";

interface TournamentContextType {
  currentTournament: Tournament | null;
  isLoading: boolean;
  selectTournament: (tournament: Tournament) => void;
  createTournament: (data: InsertTournament) => Promise<Tournament>;
  updateTournament: (id: string, data: InsertTournament) => Promise<Tournament>;
  deleteTournament: (id: string) => Promise<void>;
}

const TournamentContext = createContext<TournamentContextType | undefined>(undefined);

const TOURNAMENT_STORAGE_KEY = 'boules-selected-tournament-id';

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
      localStorage.setItem(TOURNAMENT_STORAGE_KEY, newTournament.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertTournament }) => {
      const response = await apiRequest("PATCH", `/api/tournaments/${id}`, data);
      return (await response.json()) as Tournament;
    },
    onSuccess: (updatedTournament) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      // Update current tournament if it's the one being edited
      if (currentTournament?.id === updatedTournament.id) {
        setCurrentTournament(updatedTournament);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tournaments/${id}`);
    },
    onSuccess: async () => {
      // Clear current tournament - the useEffect will select a new one after refetch
      setCurrentTournament(null);
      
      await queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
    },
  });

  // Set the tournament on initial load or after deletion
  // Priority: 1) URL parameter, 2) localStorage, 3) latest tournament
  useEffect(() => {
    if (tournaments && tournaments.length > 0) {
      // Check if URL has a tournament ID parameter (from shareable link)
      const params = new URLSearchParams(window.location.search);
      const tournamentIdFromUrl = params.get('tournament');
      
      // Priority 1: If URL specifies a tournament, select it
      if (tournamentIdFromUrl) {
        const tournamentFromUrl = tournaments.find(t => t.id === tournamentIdFromUrl);
        if (tournamentFromUrl && tournamentFromUrl.id !== currentTournament?.id) {
          setCurrentTournament(tournamentFromUrl);
          localStorage.setItem(TOURNAMENT_STORAGE_KEY, tournamentFromUrl.id);
          return;
        }
      }
      
      // Priority 2: If no current tournament, try to restore from localStorage
      if (!currentTournament) {
        const savedTournamentId = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
        if (savedTournamentId) {
          const savedTournament = tournaments.find(t => t.id === savedTournamentId);
          if (savedTournament) {
            setCurrentTournament(savedTournament);
            return;
          }
        }
        
        // Priority 3: Default to the latest (first) tournament
        setCurrentTournament(tournaments[0]);
        localStorage.setItem(TOURNAMENT_STORAGE_KEY, tournaments[0].id);
      }
      
      // If current tournament no longer exists (was deleted), select the first one
      if (currentTournament && !tournaments.find(t => t.id === currentTournament.id)) {
        setCurrentTournament(tournaments[0]);
        localStorage.setItem(TOURNAMENT_STORAGE_KEY, tournaments[0].id);
      }
    } else {
      // No tournaments available, clear current tournament and localStorage
      if (currentTournament) {
        setCurrentTournament(null);
        localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
      }
    }
  }, [tournaments, currentTournament]);

  const selectTournament = (tournament: Tournament) => {
    setCurrentTournament(tournament);
    // Save to localStorage to persist selection across page refreshes
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, tournament.id);
    // Invalidate all data queries to refetch for the new tournament
    queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/results"] });
  };

  const createTournament = async (data: InsertTournament): Promise<Tournament> => {
    return await createMutation.mutateAsync(data);
  };

  const updateTournament = async (id: string, data: InsertTournament): Promise<Tournament> => {
    return await updateMutation.mutateAsync({ id, data });
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
        updateTournament,
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

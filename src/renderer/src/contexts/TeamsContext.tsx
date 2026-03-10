/**
 * Teams Context
 *
 * Global state management for multi-team architecture.
 * Provides team data and actions to all components.
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { AgentStatus, AgentMessage } from '../../../shared/types';

// Types
export interface Agent {
  id: string;
  role: string;
  isLeader: boolean;
  status: AgentStatus;
  messages: AgentMessage[];
}

export interface Team {
  id: string;
  name: string;
  workingDirectory: string;
  leaderId: string;
  agents: Agent[];
  status: 'idle' | 'active' | 'complete';
  createdAt: number;
}

interface TeamsState {
  teams: Map<string, Team>;
  activeTeamId: string | null;
  isLoading: boolean;
}

type TeamsAction =
  | { type: 'INIT'; teams: Team[]; activeTeamId: string | null }
  | { type: 'ADD_TEAM'; team: Team }
  | { type: 'DELETE_TEAM'; teamId: string }
  | { type: 'SET_ACTIVE'; teamId: string }
  | { type: 'UPDATE_TEAM_STATUS'; teamId: string; status: Team['status'] }
  | { type: 'ADD_AGENT'; teamId: string; agent: Agent }
  | { type: 'REMOVE_AGENT'; teamId: string; agentId: string }
  | { type: 'UPDATE_AGENT_STATUS'; teamId: string; agentId: string; status: AgentStatus }
  | { type: 'ADD_AGENT_MESSAGE'; teamId: string; agentId: string; message: AgentMessage }
  | { type: 'UPDATE_AGENT_MESSAGE'; teamId: string; agentId: string; messageId: string; content: string }
  | { type: 'CLEAR_ALL' };

interface TeamsContextValue {
  state: TeamsState;
  activeTeam: Team | null;
  // Actions
  createTeam: (workingDirectory: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  setActiveTeam: (teamId: string) => Promise<void>;
  sendCommand: (teamId: string, command: string) => void;
  stopAllAgents: (teamId: string) => void;
}

const TeamsContext = createContext<TeamsContextValue | null>(null);

function teamsReducer(state: TeamsState, action: TeamsAction): TeamsState {
  switch (action.type) {
    case 'INIT': {
      const teams = new Map<string, Team>();
      action.teams.forEach(team => teams.set(team.id, team));
      return { teams, activeTeamId: action.activeTeamId, isLoading: false };
    }
    case 'ADD_TEAM': {
      const newTeams = new Map(state.teams);
      newTeams.set(action.team.id, action.team);
      return {
        ...state,
        teams: newTeams,
        activeTeamId: state.activeTeamId || action.team.id,
      };
    }
    case 'DELETE_TEAM': {
      const newTeams = new Map(state.teams);
      newTeams.delete(action.teamId);
      let newActiveId: string | null = state.activeTeamId;
      if (state.activeTeamId === action.teamId) {
        const firstKey = newTeams.keys().next().value;
        newActiveId = firstKey !== undefined ? firstKey : null;
      }
      return { ...state, teams: newTeams, activeTeamId: newActiveId };
    }
    case 'SET_ACTIVE':
      return { ...state, activeTeamId: action.teamId };
    case 'UPDATE_TEAM_STATUS': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, { ...team, status: action.status });
      return { ...state, teams: newTeams };
    }
    case 'ADD_AGENT': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, {
        ...team,
        agents: [...team.agents, action.agent],
      });
      return { ...state, teams: newTeams };
    }
    case 'REMOVE_AGENT': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, {
        ...team,
        agents: team.agents.filter(a => a.id !== action.agentId),
      });
      return { ...state, teams: newTeams };
    }
    case 'UPDATE_AGENT_STATUS': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, {
        ...team,
        agents: team.agents.map(a =>
          a.id === action.agentId ? { ...a, status: action.status } : a
        ),
      });
      return { ...state, teams: newTeams };
    }
    case 'ADD_AGENT_MESSAGE': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, {
        ...team,
        agents: team.agents.map(a =>
          a.id === action.agentId
            ? { ...a, messages: [...a.messages, action.message] }
            : a
        ),
      });
      return { ...state, teams: newTeams };
    }
    case 'UPDATE_AGENT_MESSAGE': {
      const team = state.teams.get(action.teamId);
      if (!team) return state;
      const newTeams = new Map(state.teams);
      newTeams.set(action.teamId, {
        ...team,
        agents: team.agents.map(a =>
          a.id === action.agentId
            ? {
                ...a,
                messages: a.messages.map(m =>
                  m.id === action.messageId ? { ...m, content: action.content } : m
                ),
              }
            : a
        ),
      });
      return { ...state, teams: newTeams };
    }
    case 'CLEAR_ALL':
      return { teams: new Map(), activeTeamId: null, isLoading: false };
    default:
      return state;
  }
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(teamsReducer, {
    teams: new Map(),
    activeTeamId: null,
    isLoading: true,
  });

  // Subscribe to IPC events
  useEffect(() => {
    const unsubInit = window.teamAPI?.onInit(({ teams, activeTeamId }) => {
      dispatch({ type: 'INIT', teams, activeTeamId });
    });

    const unsubCreated = window.teamAPI?.onTeamCreated((team) => {
      dispatch({
        type: 'ADD_TEAM',
        team: {
          ...team,
          agents: team.agents || [],
          status: (team.status as Team['status']) || 'idle',
        }
      });
    });

    const unsubDeleted = window.teamAPI?.onTeamDeleted(({ teamId }) => {
      dispatch({ type: 'DELETE_TEAM', teamId });
    });

    const unsubActiveChanged = window.teamAPI?.onActiveTeamChanged(({ teamId }) => {
      dispatch({ type: 'SET_ACTIVE', teamId });
    });

    const unsubTeamStatus = window.teamAPI?.onTeamStatusChanged(({ teamId, status }) => {
      dispatch({ type: 'UPDATE_TEAM_STATUS', teamId, status: status as Team['status'] });
    });

    const unsubAgentAdded = window.teamAPI?.onAgentAdded(({ teamId, agent }) => {
      dispatch({ type: 'ADD_AGENT', teamId, agent });
    });

    const unsubAgentRemoved = window.teamAPI?.onAgentRemoved(({ teamId, agentId }) => {
      dispatch({ type: 'REMOVE_AGENT', teamId, agentId });
    });

    const unsubAgentStatus = window.teamAPI?.onAgentStatus(({ teamId, agentId, status }) => {
      dispatch({ type: 'UPDATE_AGENT_STATUS', teamId, agentId, status });
    });

    const unsubAgentMessage = window.teamAPI?.onAgentMessage(({ teamId, agentId, message }) => {
      dispatch({ type: 'ADD_AGENT_MESSAGE', teamId, agentId, message });
    });

    const unsubMessageUpdate = window.teamAPI?.onAgentMessageUpdate(({ teamId, agentId, messageId, content }) => {
      dispatch({ type: 'UPDATE_AGENT_MESSAGE', teamId, agentId, messageId, content });
    });

    const unsubAllCleared = window.teamAPI?.onAllCleared(() => {
      dispatch({ type: 'CLEAR_ALL' });
    });

    return () => {
      unsubInit?.();
      unsubCreated?.();
      unsubDeleted?.();
      unsubActiveChanged?.();
      unsubTeamStatus?.();
      unsubAgentAdded?.();
      unsubAgentRemoved?.();
      unsubAgentStatus?.();
      unsubAgentMessage?.();
      unsubMessageUpdate?.();
      unsubAllCleared?.();
    };
  }, []);

  // Actions
  const createTeam = useCallback(async (workingDirectory: string) => {
    await window.teamAPI?.createTeam(workingDirectory);
  }, []);

  const deleteTeam = useCallback(async (teamId: string) => {
    await window.teamAPI?.deleteTeam(teamId);
  }, []);

  const setActiveTeam = useCallback(async (teamId: string) => {
    await window.teamAPI?.setActiveTeam(teamId);
  }, []);

  const sendCommand = useCallback((teamId: string, command: string) => {
    window.teamAPI?.sendCommand(teamId, command);
  }, []);

  const stopAllAgents = useCallback((teamId: string) => {
    window.teamAPI?.stopAllAgents(teamId);
  }, []);

  // Memoize activeTeam to prevent unnecessary recalculations
  const activeTeam = useMemo(
    () => state.activeTeamId ? state.teams.get(state.activeTeamId) || null : null,
    [state.activeTeamId, state.teams]
  );

  // Memoize context value to prevent all consumers from re-rendering on every state change
  const contextValue = useMemo(
    () => ({ state, activeTeam, createTeam, deleteTeam, setActiveTeam, sendCommand, stopAllAgents }),
    [state, activeTeam, createTeam, deleteTeam, setActiveTeam, sendCommand, stopAllAgents]
  );

  return (
    <TeamsContext.Provider value={contextValue}>
      {children}
    </TeamsContext.Provider>
  );
}

export function useTeams() {
  const context = useContext(TeamsContext);
  if (!context) {
    throw new Error('useTeams must be used within a TeamsProvider');
  }
  return context;
}

/**
 * useMessageReducer - Centralized state management for App.tsx
 * Replaces 13 useState calls with a single reducer for better maintainability
 */

import { useReducer, useCallback, Dispatch } from 'react';
import type { AgentStatus, OMCStatusInfo, AgentRole, MessageType } from '../../../shared/types';

// Message interface
export interface Message {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  timestamp: number;
}

// Result data interface
export interface ResultData {
  result: string;
  costUsd: number;
  turns: number;
}

// Active agent interface
export interface ActiveAgent {
  id: string;
  role: AgentRole;
}

// Complete app state shape
export interface AppState {
  prompt: string;
  messages: Message[];
  status: AgentStatus;
  workingDirectory: string | null;
  currentToolUse: string | null;
  error: string | null;
  result: ResultData | null;
  teamActive: boolean;
  activeAgents: ActiveAgent[];
  omcStatus: OMCStatusInfo | null;
  showOmcDetails: boolean;
  isComposing: boolean;
}

// Action types
export type AppAction =
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'APPEND_MESSAGE_CHUNK'; payload: { id: string; chunk: string; type?: MessageType } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_STATUS'; payload: AgentStatus }
  | { type: 'SET_WORKING_DIRECTORY'; payload: string | null }
  | { type: 'SET_TOOL_USE'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RESULT'; payload: ResultData | null }
  | { type: 'SET_TEAM_ACTIVE'; payload: boolean }
  | { type: 'ADD_AGENT'; payload: ActiveAgent }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'CLEAR_AGENTS' }
  | { type: 'SET_OMC_STATUS'; payload: OMCStatusInfo | null }
  | { type: 'TOGGLE_OMC_DETAILS' }
  | { type: 'SET_COMPOSING'; payload: boolean }
  | { type: 'RESET' }
  | { type: 'PREPARE_SEND' };

// Initial state
const initialState: AppState = {
  prompt: '',
  messages: [],
  status: 'idle',
  workingDirectory: null,
  currentToolUse: null,
  error: null,
  result: null,
  teamActive: false,
  activeAgents: [],
  omcStatus: null,
  showOmcDetails: false,
  isComposing: false,
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload };

    case 'ADD_MESSAGE': {
      const existing = state.messages.find(m => m.id === action.payload.id);
      if (existing) {
        return {
          ...state,
          messages: state.messages.map(m =>
            m.id === action.payload.id ? action.payload : m
          ),
        };
      }
      return { ...state, messages: [...state.messages, action.payload] };
    }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id
            ? { ...m, content: action.payload.content }
            : m
        ),
      };

    case 'APPEND_MESSAGE_CHUNK': {
      const existing = state.messages.find(m => m.id === action.payload.id);
      if (existing) {
        return {
          ...state,
          messages: state.messages.map(m =>
            m.id === action.payload.id
              ? { ...m, content: m.content + action.payload.chunk }
              : m
          ),
        };
      }
      // Create new message if doesn't exist
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.payload.id,
            type: action.payload.type || 'text',
            content: action.payload.chunk,
            timestamp: Date.now(),
          },
        ],
      };
    }

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload,
        currentToolUse: ['idle', 'complete'].includes(action.payload)
          ? null
          : state.currentToolUse,
      };

    case 'SET_WORKING_DIRECTORY':
      return { ...state, workingDirectory: action.payload };

    case 'SET_TOOL_USE':
      return { ...state, currentToolUse: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_RESULT':
      return { ...state, result: action.payload };

    case 'SET_TEAM_ACTIVE':
      return { ...state, teamActive: action.payload };

    case 'ADD_AGENT': {
      if (state.activeAgents.find(a => a.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        activeAgents: [...state.activeAgents, action.payload],
        teamActive: true,
      };
    }

    case 'REMOVE_AGENT':
      return {
        ...state,
        activeAgents: state.activeAgents.filter(a => a.id !== action.payload),
      };

    case 'CLEAR_AGENTS':
      return { ...state, activeAgents: [], teamActive: false };

    case 'SET_OMC_STATUS':
      return { ...state, omcStatus: action.payload };

    case 'TOGGLE_OMC_DETAILS':
      return { ...state, showOmcDetails: !state.showOmcDetails };

    case 'SET_COMPOSING':
      return { ...state, isComposing: action.payload };

    case 'PREPARE_SEND':
      return {
        ...state,
        messages: [],
        error: null,
        result: null,
        prompt: '',
      };

    case 'RESET':
      return {
        ...initialState,
        workingDirectory: state.workingDirectory,
        omcStatus: state.omcStatus,
      };

    default:
      return state;
  }
}

// Hook return type
export interface UseMessageReducerReturn {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  actions: {
    setPrompt: (prompt: string) => void;
    addMessage: (message: Message) => void;
    appendChunk: (id: string, chunk: string, type?: MessageType) => void;
    clearMessages: () => void;
    setStatus: (status: AgentStatus) => void;
    setWorkingDirectory: (dir: string | null) => void;
    setToolUse: (toolName: string | null) => void;
    setError: (error: string | null) => void;
    setResult: (result: ResultData | null) => void;
    setTeamActive: (active: boolean) => void;
    addAgent: (agent: ActiveAgent) => void;
    removeAgent: (agentId: string) => void;
    clearAgents: () => void;
    setOmcStatus: (status: OMCStatusInfo | null) => void;
    toggleOmcDetails: () => void;
    setComposing: (composing: boolean) => void;
    prepareSend: () => void;
    reset: () => void;
  };
}

/**
 * Custom hook for centralized app state management
 */
export function useMessageReducer(): UseMessageReducerReturn {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Memoized action creators
  const actions = {
    setPrompt: useCallback((prompt: string) =>
      dispatch({ type: 'SET_PROMPT', payload: prompt }), []),

    addMessage: useCallback((message: Message) =>
      dispatch({ type: 'ADD_MESSAGE', payload: message }), []),

    appendChunk: useCallback((id: string, chunk: string, type?: MessageType) =>
      dispatch({ type: 'APPEND_MESSAGE_CHUNK', payload: { id, chunk, type } }), []),

    clearMessages: useCallback(() =>
      dispatch({ type: 'CLEAR_MESSAGES' }), []),

    setStatus: useCallback((status: AgentStatus) =>
      dispatch({ type: 'SET_STATUS', payload: status }), []),

    setWorkingDirectory: useCallback((dir: string | null) =>
      dispatch({ type: 'SET_WORKING_DIRECTORY', payload: dir }), []),

    setToolUse: useCallback((toolName: string | null) =>
      dispatch({ type: 'SET_TOOL_USE', payload: toolName }), []),

    setError: useCallback((error: string | null) =>
      dispatch({ type: 'SET_ERROR', payload: error }), []),

    setResult: useCallback((result: ResultData | null) =>
      dispatch({ type: 'SET_RESULT', payload: result }), []),

    setTeamActive: useCallback((active: boolean) =>
      dispatch({ type: 'SET_TEAM_ACTIVE', payload: active }), []),

    addAgent: useCallback((agent: ActiveAgent) =>
      dispatch({ type: 'ADD_AGENT', payload: agent }), []),

    removeAgent: useCallback((agentId: string) =>
      dispatch({ type: 'REMOVE_AGENT', payload: agentId }), []),

    clearAgents: useCallback(() =>
      dispatch({ type: 'CLEAR_AGENTS' }), []),

    setOmcStatus: useCallback((status: OMCStatusInfo | null) =>
      dispatch({ type: 'SET_OMC_STATUS', payload: status }), []),

    toggleOmcDetails: useCallback(() =>
      dispatch({ type: 'TOGGLE_OMC_DETAILS' }), []),

    setComposing: useCallback((composing: boolean) =>
      dispatch({ type: 'SET_COMPOSING', payload: composing }), []),

    prepareSend: useCallback(() =>
      dispatch({ type: 'PREPARE_SEND' }), []),

    reset: useCallback(() =>
      dispatch({ type: 'RESET' }), []),
  };

  return { state, dispatch, actions };
}

export default useMessageReducer;

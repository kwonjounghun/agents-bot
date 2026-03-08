/**
 * CreateTeamButton Component
 *
 * Button to create a new team by selecting a working directory.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTeams } from '../../contexts/TeamsContext';

export function CreateTeamButton() {
  const { createTeam } = useTeams();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const directory = await window.teamAPI?.selectDirectory();
      if (directory) {
        await createTeam(directory);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      disabled={isLoading}
      className={`
        w-full py-3 px-4 rounded-lg font-medium text-sm
        bg-gradient-to-r from-blue-500 to-purple-500 text-white
        hover:from-blue-600 hover:to-purple-600
        shadow-lg shadow-blue-500/25
        transition-all
        ${isLoading ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>+</span>
          <span>팀장 호출</span>
        </span>
      )}
    </motion.button>
  );
}

/**
 * SubagentBubble Component
 *
 * Speech bubble container for sub-agent messages.
 * Uses AccumulatingSpeechBubble with sub-agent specific configuration.
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRole, SpeechMessage } from '../../shared';
import { AccumulatingSpeechBubble } from '../../components/AccumulatingSpeechBubble';

interface SubagentBubbleProps {
  role: AgentRole;
  messages: SpeechMessage[];
  isStreaming: boolean;
}

export function SubagentBubble({ role, messages, isStreaming }: SubagentBubbleProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        className="w-full"
      >
        <AccumulatingSpeechBubble role={role} messages={messages} isStreaming={isStreaming} maxHeight={140} />
      </motion.div>
    </AnimatePresence>
  );
}

export default SubagentBubble;

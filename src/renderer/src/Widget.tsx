import { useEffect, useState, useRef } from 'react';
import type { AgentRole, AgentStatus, WidgetMessage } from '../../shared/types';
import { WidgetContainer } from './components/WidgetContainer';

function Widget() {
  const [agentId, setAgentId] = useState('');
  const [role, setRole] = useState<AgentRole>('executor');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageType, setMessageType] = useState<'thinking' | 'speaking'>('thinking');
  const [isStreaming, setIsStreaming] = useState(false);

  // Use ref to track current message type without re-subscribing
  const messageTypeRef = useRef<'thinking' | 'speaking'>('thinking');

  useEffect(() => {
    // Get widget identity from URL params
    const params = window.widgetAPI?.getWidgetParams();
    if (params) {
      setAgentId(params.agentId);
      setRole(params.role as AgentRole);
    }

    // Subscribe to messages
    const unsubMessage = window.widgetAPI?.onMessage((message: WidgetMessage) => {
      if (message.type === 'complete') {
        setIsStreaming(false);
        return;
      }

      if (message.type === 'tool_use') {
        // Tool use shows as speaking
        setCurrentMessage(message.content);
        setMessageType('speaking');
        messageTypeRef.current = 'speaking';
        setIsStreaming(true);
        return;
      }

      const newType = message.type === 'thinking' ? 'thinking' : 'speaking';

      // If message type changed, reset content
      if (newType !== messageTypeRef.current) {
        setCurrentMessage(message.content);
        setMessageType(newType);
        messageTypeRef.current = newType;
      } else {
        // Accumulate content
        setCurrentMessage(prev => prev + message.content);
      }

      setIsStreaming(true);
    });

    const unsubStatus = window.widgetAPI?.onStatus((data) => {
      setStatus(data.status);

      if (data.status === 'idle') {
        // Reset message on idle
        setTimeout(() => {
          setCurrentMessage('');
          setIsStreaming(false);
          messageTypeRef.current = 'thinking';
        }, 2000); // Show last message for 2 seconds
      } else if (data.status === 'complete') {
        setIsStreaming(false);
      } else if (data.status === 'thinking') {
        // Reset for new thinking block
        setCurrentMessage('');
        messageTypeRef.current = 'thinking';
        setMessageType('thinking');
      }
    });

    const unsubClose = window.widgetAPI?.onClose(() => {
      window.close();
    });

    return () => {
      unsubMessage?.();
      unsubStatus?.();
      unsubClose?.();
    };
  }, []); // Empty dependency - subscribe once

  return (
    <WidgetContainer
      agentId={agentId}
      role={role}
      status={status}
      currentMessage={currentMessage}
      messageType={messageType}
      isStreaming={isStreaming}
    />
  );
}

export default Widget;

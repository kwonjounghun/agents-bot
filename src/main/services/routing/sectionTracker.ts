/**
 * Section Tracker
 * Single Responsibility: Track message sections for accumulated messages
 *
 * Handles:
 * - Generating unique section IDs
 * - Tracking current section per agent
 * - Detecting section transitions
 */

/**
 * Message types that can be routed to widgets
 */
export type WidgetMessageType = 'thinking' | 'speaking' | 'tool_use' | 'complete';

/**
 * Section information for message grouping
 */
export interface SectionInfo {
  id: string;
  type: WidgetMessageType;
}

/**
 * Result of tracking a message's section
 */
export interface SectionTrackResult {
  sectionId: string;
  isNewSection: boolean;
}

/**
 * SectionTracker manages message section tracking for accumulated messages.
 * This enables grouping of related messages in the widget display.
 */
export class SectionTracker {
  /** Map of agentId -> current section info */
  private agentSections: Map<string, SectionInfo> = new Map();

  /**
   * Generate a unique section ID
   */
  generateSectionId(): string {
    return `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track a message and determine if it starts a new section
   *
   * @param agentId - The agent ID
   * @param type - The message type
   * @returns Section tracking result with ID and whether it's a new section
   */
  trackSection(agentId: string, type: WidgetMessageType): SectionTrackResult {
    const currentSection = this.agentSections.get(agentId);

    // Check if this is a new section (different type or no current section)
    if (!currentSection || currentSection.type !== type) {
      const newSection: SectionInfo = {
        id: this.generateSectionId(),
        type,
      };
      this.agentSections.set(agentId, newSection);

      return {
        sectionId: newSection.id,
        isNewSection: true,
      };
    }

    // Same section continues
    return {
      sectionId: currentSection.id,
      isNewSection: false,
    };
  }

  /**
   * Get the current section for an agent
   */
  getCurrentSection(agentId: string): SectionInfo | undefined {
    return this.agentSections.get(agentId);
  }

  /**
   * Reset the section for an agent (e.g., when agent completes)
   */
  resetSection(agentId: string): void {
    this.agentSections.delete(agentId);
  }

  /**
   * Clear all section tracking
   */
  clear(): void {
    this.agentSections.clear();
  }
}

/**
 * Create a new SectionTracker instance
 */
export function createSectionTracker(): SectionTracker {
  return new SectionTracker();
}

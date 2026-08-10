/**
 * BaseAgent - Standard interface for domain-specific AI agents
 */
class BaseAgent {
  constructor({ name, domain, description, intents = [], tools = [] }) {
    this.name = name;
    this.domain = domain;
    this.description = description;
    this.intents = intents;
    this.tools = tools;
  }

  /**
   * Main entrypoint for processing user messages within this domain
   * @param {Object} params
   * @param {string} params.message - Current user prompt
   * @param {Array} params.history - Recent message history
   * @param {Object} params.userContext - User details (id, pharmacy_id, etc.)
   * @param {Object} params.draftState - Active draft state for multi-turn workflow
   * @param {string} params.intent - Detected intent from Intent Router
   */
  async process({ message, history, userContext, draftState, intent }) {
    throw new Error(`process() method must be implemented by ${this.name}`);
  }

  /**
   * Helper to construct unified agent response format
   */
  buildResponse({
    content,
    module = this.domain,
    intent = null,
    draftState = null,
    action = null,
    chips = [],
    confidence = 1.0,
  }) {
    return {
      module,
      intent,
      content,
      draftState,
      action,
      chips,
      confidence,
    };
  }
}

module.exports = BaseAgent;

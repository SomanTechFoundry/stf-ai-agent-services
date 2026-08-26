/**
 * Tool registry — the complete set of tools available to the AI agent.
 *
 * Add new tools here as they are built.
 * The agent orchestrator imports all tools from this single location.
 */

import {
  getBusinessInfoTool,
  getServicesTool,
  getServiceDetailsTool,
  getBusinessHoursTool,
  getFAQsTool,
} from "./business-tools";
import { findOrCreateCustomerTool } from "./customer-tools";
import {
  checkAvailabilityTool,
  createAppointmentTool,
  listCustomerAppointmentsTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
} from "./booking-tools";
import { handoffToHumanTool } from "./escalation-tools";
import type { AgentTool } from "./types";

export type { AgentTool, ToolContext, ToolResult } from "./types";
export { toolSuccess, toolError } from "./types";

/**
 * All tools available to the salon AI receptionist.
 * The order matters — it influences how Gemini understands the toolset.
 */
export const SALON_TOOLS: AgentTool[] = [
  getBusinessInfoTool,
  getServicesTool,
  getServiceDetailsTool,
  getBusinessHoursTool,
  getFAQsTool,
  findOrCreateCustomerTool,
  checkAvailabilityTool,
  createAppointmentTool,
  listCustomerAppointmentsTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  handoffToHumanTool,
];

/**
 * Build a tool map for fast lookup during execution.
 */
export function buildToolMap(tools: AgentTool[]): Map<string, AgentTool> {
  return new Map(tools.map((t) => [t.definition.name, t]));
}

export {
  getBusinessInfoTool,
  getServicesTool,
  getServiceDetailsTool,
  getBusinessHoursTool,
  getFAQsTool,
  findOrCreateCustomerTool,
  checkAvailabilityTool,
  createAppointmentTool,
  listCustomerAppointmentsTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  handoffToHumanTool,
};

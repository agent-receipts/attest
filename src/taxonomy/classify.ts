import type { RiskLevel } from "../receipt/types.js";
import { getDefaultRiskLevel } from "./actions.js";
import type { TaxonomyMapping } from "./types.js";

export interface ClassificationResult {
	action_type: string;
	risk_level: RiskLevel;
}

export function classifyToolCall(
	toolName: string,
	mappings: TaxonomyMapping[],
): ClassificationResult {
	const mapping = mappings.find((m) => m.tool_name === toolName);
	const actionType = mapping?.action_type ?? "unknown";
	const entry = getDefaultRiskLevel(actionType);

	return {
		action_type: entry.type,
		risk_level: entry.risk_level,
	};
}

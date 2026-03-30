import type {
	ActionReceipt,
	OutcomeStatus,
	ReceiptQuery,
	ReceiptStore,
	RiskLevel,
} from "@attest-protocol/attest-ts";

const VALID_RISK_LEVELS = new Set<string>([
	"low",
	"medium",
	"high",
	"critical",
]);
const VALID_STATUSES = new Set<string>(["success", "failure", "pending"]);

/**
 * Options for the `attest list` command.
 */
export interface ListOptions {
	chainId?: string;
	actionType?: string;
	riskLevel?: string;
	status?: string;
	after?: string;
	before?: string;
	limit?: number;
	json?: boolean;
}

/**
 * Format a receipt as a single summary line.
 */
function formatReceiptLine(receipt: ActionReceipt): string {
	const action = receipt.credentialSubject.action;
	const chain = receipt.credentialSubject.chain;
	const outcome = receipt.credentialSubject.outcome;
	const risk = action.risk_level.toUpperCase().padEnd(8);
	const statusIcon =
		outcome.status === "success"
			? "✓"
			: outcome.status === "failure"
				? "✗"
				: "…";

	return `${chain.chain_id}#${chain.sequence}  ${statusIcon}  ${risk}  ${action.type.padEnd(30)}  ${action.timestamp}  ${receipt.id}`;
}

/**
 * Run the `attest list` command.
 */
export function runList(store: ReceiptStore, options: ListOptions): string {
	const query: ReceiptQuery = {};

	if (options.chainId) query.chainId = options.chainId;
	if (options.actionType) query.actionType = options.actionType;
	if (options.riskLevel) {
		if (!VALID_RISK_LEVELS.has(options.riskLevel)) {
			return `Invalid risk level "${options.riskLevel}". Must be: low, medium, high, critical.`;
		}
		query.riskLevel = options.riskLevel as RiskLevel;
	}
	if (options.status) {
		if (!VALID_STATUSES.has(options.status)) {
			return `Invalid status "${options.status}". Must be: success, failure, pending.`;
		}
		query.status = options.status as OutcomeStatus;
	}
	if (options.after) query.after = options.after;
	if (options.before) query.before = options.before;
	if (options.limit) query.limit = options.limit;

	const receipts = store.query(query);

	if (options.json) {
		return JSON.stringify(receipts, null, 2);
	}

	if (receipts.length === 0) {
		return "No receipts found.";
	}

	const header =
		"CHAIN                  ST  RISK      ACTION                          TIMESTAMP                     ID";
	const lines = receipts.map(formatReceiptLine);
	return [header, ...lines].join("\n");
}

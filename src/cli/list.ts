import type { ActionReceipt } from "../receipt/types.js";
import type { ReceiptQuery, ReceiptStore } from "../store/store.js";

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
	if (options.riskLevel)
		query.riskLevel = options.riskLevel as ReceiptQuery["riskLevel"];
	if (options.status) query.status = options.status as ReceiptQuery["status"];
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

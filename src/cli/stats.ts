import type { ReceiptStore } from "@attest-protocol/attest-ts";

/**
 * Options for the `attest stats` command.
 */
export interface StatsOptions {
	json?: boolean;
}

/**
 * Run the `attest stats` command.
 *
 * Shows summary statistics for the receipt store.
 */
export function runStats(
	store: ReceiptStore,
	options: StatsOptions = {},
): string {
	const stats = store.stats();

	if (options.json) {
		return JSON.stringify(stats, null, 2);
	}

	if (stats.total === 0) {
		return "No receipts in store.";
	}

	const lines = [
		`Receipts: ${stats.total}`,
		`Chains:   ${stats.chains}`,
		"",
		"By risk level:",
		...stats.byRisk.map((r) => `  ${r.risk_level.padEnd(10)} ${r.count}`),
		"",
		"By status:",
		...stats.byStatus.map((s) => `  ${s.status.padEnd(10)} ${s.count}`),
		"",
		"By action type:",
		...stats.byAction.map((a) => `  ${a.action_type.padEnd(30)} ${a.count}`),
	];

	return lines.join("\n");
}

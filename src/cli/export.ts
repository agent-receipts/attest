import type { ReceiptStore } from "@attest-protocol/attest-ts";

/**
 * Run the `attest export` command.
 *
 * Exports all receipts in a chain as a JSON array, ordered by sequence.
 * The output is a self-contained bundle suitable for sharing or archival.
 */
export function runExport(store: ReceiptStore, chainId: string): string {
	const receipts = store.getChain(chainId);

	if (receipts.length === 0) {
		return `No receipts found for chain "${chainId}".`;
	}

	return JSON.stringify(
		{
			chainId,
			exportedAt: new Date().toISOString(),
			count: receipts.length,
			receipts,
		},
		null,
		2,
	);
}

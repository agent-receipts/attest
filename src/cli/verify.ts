import type { ReceiptStore } from "../store/store.js";
import { verifyStoredChain } from "../store/verify.js";

/**
 * Options for the `attest verify` command.
 */
export interface VerifyOptions {
	/** Output raw JSON instead of formatted text. */
	json?: boolean;
}

/**
 * Run the `attest verify` command.
 *
 * Loads a chain from the store and reports integrity status.
 */
export function runVerify(
	store: ReceiptStore,
	chainId: string,
	publicKey: string,
	options: VerifyOptions = {},
): string {
	const result = verifyStoredChain(store, chainId, publicKey);

	if (options.json) {
		return JSON.stringify(result, null, 2);
	}

	if (result.length === 0) {
		return `No receipts found for chain "${chainId}".`;
	}

	const lines = [
		`Chain:    ${chainId}`,
		`Receipts: ${result.length}`,
		`Status:   ${result.valid ? "✓ valid" : "✗ BROKEN"}`,
	];

	if (!result.valid) {
		lines.push(
			`Broken at: sequence ${result.brokenAt + 1} (index ${result.brokenAt})`,
		);

		const broken = result.receipts[result.brokenAt];
		if (broken) {
			const issues = [];
			if (!broken.signatureValid) issues.push("invalid signature");
			if (!broken.hashLinkValid) issues.push("broken hash link");
			if (!broken.sequenceValid) issues.push("invalid sequence");
			lines.push(`Issues:   ${issues.join(", ")}`);
		}
	}

	return lines.join("\n");
}

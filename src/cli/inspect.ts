import { type ReceiptStore, verifyReceipt } from "@attest-protocol/attest-ts";

/**
 * Options for the `attest inspect` command.
 */
export interface InspectOptions {
	/** Ed25519 public key (PEM) for signature verification. */
	publicKey?: string;
	/** Output raw JSON instead of formatted text. */
	json?: boolean;
}

/**
 * Run the `attest inspect` command.
 *
 * Displays a single receipt with optional signature verification.
 */
export function runInspect(
	store: ReceiptStore,
	receiptId: string,
	options: InspectOptions = {},
): string {
	const receipt = store.getById(receiptId);

	if (!receipt) {
		return `Receipt not found: ${receiptId}`;
	}

	if (options.json) {
		const output: Record<string, unknown> = { receipt };
		if (options.publicKey) {
			output.signatureValid = verifyReceipt(receipt, options.publicKey);
		}
		return JSON.stringify(output, null, 2);
	}

	const action = receipt.credentialSubject.action;
	const chain = receipt.credentialSubject.chain;
	const outcome = receipt.credentialSubject.outcome;
	const issuer = receipt.issuer;

	const lines = [
		`Receipt:    ${receipt.id}`,
		`Issued:     ${receipt.issuanceDate}`,
		`Issuer:     ${issuer.id}`,
		`Principal:  ${receipt.credentialSubject.principal.id}`,
		"",
		`Action:     ${action.type}`,
		`Risk:       ${action.risk_level}`,
		`Timestamp:  ${action.timestamp}`,
		`Status:     ${outcome.status}`,
	];

	if (outcome.error) {
		lines.push(`Error:      ${outcome.error}`);
	}

	lines.push(
		"",
		`Chain:      ${chain.chain_id}`,
		`Sequence:   ${chain.sequence}`,
		`Previous:   ${chain.previous_receipt_hash ?? "(none)"}`,
	);

	if (options.publicKey) {
		const valid = verifyReceipt(receipt, options.publicKey);
		lines.push("", `Signature:  ${valid ? "✓ valid" : "✗ INVALID"}`);
	}

	return lines.join("\n");
}

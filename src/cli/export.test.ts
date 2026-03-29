import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionReceipt } from "../receipt/types.js";
import { CONTEXT, CREDENTIAL_TYPE, VERSION } from "../receipt/types.js";
import type { ReceiptStore } from "../store/store.js";
import { openStore } from "../store/store.js";
import { runExport } from "./export.js";

function makeReceipt(sequence: number, chainId: string): ActionReceipt {
	return {
		"@context": CONTEXT,
		id: `urn:receipt:${chainId}-${sequence}`,
		type: CREDENTIAL_TYPE,
		version: VERSION,
		issuer: { id: "did:agent:test" },
		issuanceDate: "2026-03-29T14:00:00Z",
		credentialSubject: {
			principal: { id: "did:user:test" },
			action: {
				id: `act_${sequence}`,
				type: "filesystem.file.read",
				risk_level: "low",
				timestamp: "2026-03-29T14:00:00Z",
			},
			outcome: { status: "success" },
			chain: {
				sequence,
				previous_receipt_hash: null,
				chain_id: chainId,
			},
		},
		proof: { type: "Ed25519Signature2020", proofValue: "utest" },
	};
}

describe("runExport", () => {
	let store: ReceiptStore;

	beforeEach(() => {
		store = openStore(":memory:");
	});

	afterEach(() => {
		store.close();
	});

	it("exports a chain as JSON bundle", () => {
		store.insert(makeReceipt(1, "chain_a"), "sha256:1");
		store.insert(makeReceipt(2, "chain_a"), "sha256:2");

		const output = runExport(store, "chain_a");
		const parsed = JSON.parse(output);

		expect(parsed.chainId).toBe("chain_a");
		expect(parsed.count).toBe(2);
		expect(parsed.receipts).toHaveLength(2);
		expect(parsed.exportedAt).toBeDefined();
	});

	it("returns message for empty chain", () => {
		const output = runExport(store, "nonexistent");
		expect(output).toContain("No receipts found");
	});

	it("only exports the requested chain", () => {
		store.insert(makeReceipt(1, "chain_a"), "sha256:a");
		store.insert(makeReceipt(1, "chain_b"), "sha256:b");

		const output = runExport(store, "chain_a");
		const parsed = JSON.parse(output);

		expect(parsed.count).toBe(1);
		expect(parsed.receipts[0].id).toBe("urn:receipt:chain_a-1");
	});
});

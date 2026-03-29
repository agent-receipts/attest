import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair, signReceipt } from "../receipt/signing.js";
import type { UnsignedActionReceipt } from "../receipt/types.js";
import { CONTEXT, CREDENTIAL_TYPE, VERSION } from "../receipt/types.js";
import type { ReceiptStore } from "../store/store.js";
import { openStore } from "../store/store.js";
import { runInspect } from "./inspect.js";

function makeUnsigned(): UnsignedActionReceipt {
	return {
		"@context": CONTEXT,
		id: "urn:receipt:inspect-test",
		type: CREDENTIAL_TYPE,
		version: VERSION,
		issuer: { id: "did:agent:test" },
		issuanceDate: "2026-03-29T14:00:00Z",
		credentialSubject: {
			principal: { id: "did:user:test" },
			action: {
				id: "act_1",
				type: "filesystem.file.read",
				risk_level: "low",
				timestamp: "2026-03-29T14:00:00Z",
			},
			outcome: { status: "success" },
			chain: {
				sequence: 1,
				previous_receipt_hash: null,
				chain_id: "chain_test",
			},
		},
	};
}

describe("runInspect", () => {
	let store: ReceiptStore;
	let publicKey: string;

	beforeEach(() => {
		store = openStore(":memory:");
		const keys = generateKeyPair();
		publicKey = keys.publicKey;

		const signed = signReceipt(
			makeUnsigned(),
			keys.privateKey,
			"did:agent:test#key-1",
		);
		store.insert(signed, "sha256:test");
	});

	afterEach(() => {
		store.close();
	});

	it("displays receipt details", () => {
		const output = runInspect(store, "urn:receipt:inspect-test");

		expect(output).toContain("urn:receipt:inspect-test");
		expect(output).toContain("filesystem.file.read");
		expect(output).toContain("did:agent:test");
		expect(output).toContain("did:user:test");
		expect(output).toContain("success");
	});

	it("returns not-found message for missing receipt", () => {
		const output = runInspect(store, "urn:receipt:missing");
		expect(output).toContain("Receipt not found");
	});

	it("verifies signature when publicKey provided", () => {
		const output = runInspect(store, "urn:receipt:inspect-test", {
			publicKey,
		});
		expect(output).toContain("✓ valid");
	});

	it("shows invalid signature with wrong key", () => {
		const other = generateKeyPair();
		const output = runInspect(store, "urn:receipt:inspect-test", {
			publicKey: other.publicKey,
		});
		expect(output).toContain("✗ INVALID");
	});

	it("outputs JSON when --json flag is set", () => {
		const output = runInspect(store, "urn:receipt:inspect-test", {
			json: true,
			publicKey,
		});
		const parsed = JSON.parse(output);

		expect(parsed.receipt.id).toBe("urn:receipt:inspect-test");
		expect(parsed.signatureValid).toBe(true);
	});
});

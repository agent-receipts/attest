import {
	generateKeyPair,
	hashReceipt,
	openStore,
	type ReceiptStore,
	signReceipt,
} from "@attest-protocol/attest-ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeUnsigned } from "../test-utils/receipts.js";
import { runVerify } from "./verify.js";

describe("runVerify", () => {
	let store: ReceiptStore;
	let publicKey: string;
	let privateKey: string;

	beforeEach(() => {
		store = openStore(":memory:");
		const keys = generateKeyPair();
		publicKey = keys.publicKey;
		privateKey = keys.privateKey;
	});

	afterEach(() => {
		store.close();
	});

	it("reports valid for a correct chain", () => {
		let prevHash: string | null = null;
		for (let i = 1; i <= 3; i++) {
			const signed = signReceipt(
				makeUnsigned(i, prevHash),
				privateKey,
				"did:agent:test#key-1",
			);
			const hash = hashReceipt(signed);
			store.insert(signed, hash);
			prevHash = hash;
		}

		const output = runVerify(store, "chain_test", publicKey);

		expect(output).toContain("✓ valid");
		expect(output).toContain("Receipts: 3");
	});

	it("reports broken chain with details", () => {
		const first = signReceipt(
			makeUnsigned(1, null),
			privateKey,
			"did:agent:test#key-1",
		);
		store.insert(first, hashReceipt(first));

		// Second receipt with wrong previous hash
		const second = signReceipt(
			makeUnsigned(2, "sha256:wrong"),
			privateKey,
			"did:agent:test#key-1",
		);
		store.insert(second, hashReceipt(second));

		const output = runVerify(store, "chain_test", publicKey);

		expect(output).toContain("✗ BROKEN");
		expect(output).toContain("broken hash link");
	});

	it("returns message for empty chain", () => {
		const output = runVerify(store, "nonexistent", publicKey);
		expect(output).toContain("No receipts found");
	});

	it("outputs JSON when --json flag is set", () => {
		const signed = signReceipt(
			makeUnsigned(1, null),
			privateKey,
			"did:agent:test#key-1",
		);
		store.insert(signed, hashReceipt(signed));

		const output = runVerify(store, "chain_test", publicKey, {
			json: true,
		});
		const parsed = JSON.parse(output);

		expect(parsed.valid).toBe(true);
		expect(parsed.length).toBe(1);
	});
});

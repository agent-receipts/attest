import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionReceipt } from "../receipt/types.js";
import { CONTEXT, CREDENTIAL_TYPE, VERSION } from "../receipt/types.js";
import type { ReceiptStore } from "../store/store.js";
import { openStore } from "../store/store.js";
import { runList } from "./list.js";

function makeReceipt(overrides: {
	id?: string;
	sequence?: number;
	chainId?: string;
	actionType?: string;
	riskLevel?: "low" | "medium" | "high" | "critical";
	status?: "success" | "failure" | "pending";
	timestamp?: string;
}): ActionReceipt {
	return {
		"@context": CONTEXT,
		id: overrides.id ?? "urn:receipt:test-1",
		type: CREDENTIAL_TYPE,
		version: VERSION,
		issuer: { id: "did:agent:test" },
		issuanceDate: "2026-03-29T14:00:00Z",
		credentialSubject: {
			principal: { id: "did:user:test" },
			action: {
				id: "act_1",
				type: overrides.actionType ?? "filesystem.file.read",
				risk_level: overrides.riskLevel ?? "low",
				timestamp: overrides.timestamp ?? "2026-03-29T14:00:00Z",
			},
			outcome: { status: overrides.status ?? "success" },
			chain: {
				sequence: overrides.sequence ?? 1,
				previous_receipt_hash: null,
				chain_id: overrides.chainId ?? "chain_test",
			},
		},
		proof: { type: "Ed25519Signature2020", proofValue: "utest" },
	};
}

describe("runList", () => {
	let store: ReceiptStore;

	beforeEach(() => {
		store = openStore(":memory:");
	});

	afterEach(() => {
		store.close();
	});

	it("returns no-receipts message for empty store", () => {
		const output = runList(store, {});
		expect(output).toBe("No receipts found.");
	});

	it("lists receipts with summary lines", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:1", actionType: "filesystem.file.read" }),
			"sha256:1",
		);

		const output = runList(store, {});

		expect(output).toContain("CHAIN");
		expect(output).toContain("filesystem.file.read");
		expect(output).toContain("urn:receipt:1");
		expect(output).toContain("✓");
	});

	it("filters by chain id", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:a", chainId: "chain_a" }),
			"sha256:a",
		);
		store.insert(
			makeReceipt({ id: "urn:receipt:b", chainId: "chain_b" }),
			"sha256:b",
		);

		const output = runList(store, { chainId: "chain_a" });

		expect(output).toContain("urn:receipt:a");
		expect(output).not.toContain("urn:receipt:b");
	});

	it("filters by risk level", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:low", riskLevel: "low" }),
			"sha256:1",
		);
		store.insert(
			makeReceipt({
				id: "urn:receipt:high",
				sequence: 2,
				riskLevel: "high",
			}),
			"sha256:2",
		);

		const output = runList(store, { riskLevel: "high" });

		expect(output).toContain("urn:receipt:high");
		expect(output).not.toContain("urn:receipt:low");
	});

	it("outputs JSON when --json flag is set", () => {
		store.insert(makeReceipt({}), "sha256:1");

		const output = runList(store, { json: true });
		const parsed = JSON.parse(output);

		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe("urn:receipt:test-1");
	});

	it("respects limit", () => {
		store.insert(makeReceipt({ id: "urn:receipt:1" }), "sha256:1");
		store.insert(makeReceipt({ id: "urn:receipt:2", sequence: 2 }), "sha256:2");

		const output = runList(store, { limit: 1 });
		const lines = output.split("\n");

		// Header + 1 receipt line
		expect(lines).toHaveLength(2);
	});

	it("shows failure indicator for failed receipts", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:fail", status: "failure" }),
			"sha256:1",
		);

		const output = runList(store, {});
		expect(output).toContain("✗");
	});
});

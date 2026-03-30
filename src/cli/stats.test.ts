import { openStore, type ReceiptStore } from "@attest-protocol/attest-ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeReceipt } from "../test-utils/receipts.js";
import { runStats } from "./stats.js";

describe("runStats", () => {
	let store: ReceiptStore;

	beforeEach(() => {
		store = openStore(":memory:");
	});

	afterEach(() => {
		store.close();
	});

	it("returns no-receipts message for empty store", () => {
		const output = runStats(store);
		expect(output).toBe("No receipts in store.");
	});

	it("shows summary statistics", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:1", riskLevel: "low", status: "success" }),
			"sha256:1",
		);
		store.insert(
			makeReceipt({
				id: "urn:receipt:2",
				sequence: 2,
				riskLevel: "high",
				status: "failure",
				actionType: "system.command.execute",
			}),
			"sha256:2",
		);

		const output = runStats(store);

		expect(output).toContain("Receipts: 2");
		expect(output).toContain("Chains:   1");
		expect(output).toContain("low");
		expect(output).toContain("high");
		expect(output).toContain("success");
		expect(output).toContain("failure");
		expect(output).toContain("filesystem.file.read");
		expect(output).toContain("system.command.execute");
	});

	it("outputs JSON when --json flag is set", () => {
		store.insert(makeReceipt({}), "sha256:1");

		const output = runStats(store, { json: true });
		const parsed = JSON.parse(output);

		expect(parsed.total).toBe(1);
		expect(parsed.chains).toBe(1);
		expect(parsed.byRisk).toHaveLength(1);
	});

	it("counts multiple chains", () => {
		store.insert(
			makeReceipt({ id: "urn:receipt:a", chainId: "chain_a" }),
			"sha256:a",
		);
		store.insert(
			makeReceipt({ id: "urn:receipt:b", chainId: "chain_b" }),
			"sha256:b",
		);

		const output = runStats(store);
		expect(output).toContain("Chains:   2");
	});
});

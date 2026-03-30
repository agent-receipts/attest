import { openStore, type ReceiptStore } from "@attest-protocol/attest-ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeReceipt } from "../test-utils/receipts.js";
import { runExport } from "./export.js";

describe("runExport", () => {
	let store: ReceiptStore;

	beforeEach(() => {
		store = openStore(":memory:");
	});

	afterEach(() => {
		store.close();
	});

	it("exports a chain as JSON bundle", () => {
		store.insert(
			makeReceipt({
				id: "urn:receipt:chain_a-1",
				sequence: 1,
				chainId: "chain_a",
			}),
			"sha256:1",
		);
		store.insert(
			makeReceipt({
				id: "urn:receipt:chain_a-2",
				sequence: 2,
				chainId: "chain_a",
			}),
			"sha256:2",
		);

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
		store.insert(
			makeReceipt({
				id: "urn:receipt:chain_a-1",
				sequence: 1,
				chainId: "chain_a",
			}),
			"sha256:a",
		);
		store.insert(
			makeReceipt({
				id: "urn:receipt:chain_b-1",
				sequence: 1,
				chainId: "chain_b",
			}),
			"sha256:b",
		);

		const output = runExport(store, "chain_a");
		const parsed = JSON.parse(output);

		expect(parsed.count).toBe(1);
		expect(parsed.receipts[0].id).toBe("urn:receipt:chain_a-1");
	});
});

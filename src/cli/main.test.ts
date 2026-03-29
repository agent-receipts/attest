import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashReceipt } from "../receipt/hash.js";
import { generateKeyPair, signReceipt } from "../receipt/signing.js";
import { openStore } from "../store/store.js";
import { makeReceipt, makeUnsigned } from "../test-utils/receipts.js";

const CLI = join(
	import.meta.dirname ?? ".",
	"..",
	"..",
	"dist",
	"cli",
	"main.js",
);

describe("attest CLI", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "attest-cli-"));
		dbPath = join(tempDir, "test.db");

		// Seed the database
		const store = openStore(dbPath);
		store.insert(
			makeReceipt({
				id: "urn:receipt:cli-1",
				actionType: "filesystem.file.read",
				riskLevel: "low",
			}),
			"sha256:1",
		);
		store.insert(
			makeReceipt({
				id: "urn:receipt:cli-2",
				sequence: 2,
				actionType: "system.command.execute",
				riskLevel: "high",
			}),
			"sha256:2",
		);
		store.close();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true });
	});

	function run(...args: string[]): string {
		return execFileSync("node", [CLI, ...args, "--db", dbPath], {
			encoding: "utf-8",
		}).trim();
	}

	it("shows help with --help", () => {
		const output = execFileSync("node", [CLI, "--help"], {
			encoding: "utf-8",
		});
		expect(output).toContain("Usage: attest");
	});

	it("lists receipts", () => {
		const output = run("list");
		expect(output).toContain("urn:receipt:cli-1");
		expect(output).toContain("urn:receipt:cli-2");
	});

	it("filters list by risk level", () => {
		const output = run("list", "--risk", "high");
		expect(output).toContain("urn:receipt:cli-2");
		expect(output).not.toContain("urn:receipt:cli-1");
	});

	it("lists in JSON mode", () => {
		const output = run("list", "--json");
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(2);
	});

	it("inspects a receipt", () => {
		const output = run("inspect", "urn:receipt:cli-1");
		expect(output).toContain("urn:receipt:cli-1");
		expect(output).toContain("filesystem.file.read");
	});

	it("exports a chain", () => {
		const output = run("export", "chain_test");
		const parsed = JSON.parse(output);
		expect(parsed.chainId).toBe("chain_test");
		expect(parsed.count).toBe(2);
	});

	it("verifies a chain with key", () => {
		// Build a properly signed chain
		const keys = generateKeyPair();
		const signedDbPath = join(tempDir, "signed.db");
		const store = openStore(signedDbPath);

		let prevHash: string | null = null;
		for (let i = 1; i <= 2; i++) {
			const signed = signReceipt(
				makeUnsigned(i, prevHash),
				keys.privateKey,
				"did:agent:test#key-1",
			);
			const hash = hashReceipt(signed);
			store.insert(signed, hash);
			prevHash = hash;
		}
		store.close();

		const keyPath = join(tempDir, "public.pem");
		writeFileSync(keyPath, keys.publicKey);

		const output = execFileSync(
			"node",
			[CLI, "verify", "chain_test", "--key", keyPath, "--db", signedDbPath],
			{ encoding: "utf-8" },
		).trim();

		expect(output).toContain("✓ valid");
	});

	it("exits with error for unknown command", () => {
		try {
			execFileSync("node", [CLI, "unknown"], {
				encoding: "utf-8",
				stdio: "pipe",
			});
			expect.unreachable("should have thrown");
		} catch (error) {
			const err = error as { status: number; stderr: Buffer };
			expect(err.status).toBe(1);
		}
	});
});
